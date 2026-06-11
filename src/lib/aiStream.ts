import { supabase } from "@/integrations/supabase/client";

// Hardcoded fallbacks keep the assistant working even when the production build
// (e.g. on the official domain) is missing VITE_* env vars. The publishable key is safe in code.
const FALLBACK_SUPABASE_URL = "https://qohhrliaecdtaeyfhcvb.supabase.co";
const FALLBACK_SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A";

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || FALLBACK_SUPABASE_ANON;

export type StreamCallbacks = {
  onDelta?: (text: string, full: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
};

export type StreamResult = {
  content: string;
  status: number;
  ok: boolean;
};

export async function invokeEdgeFunctionJson<T = any>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) {
    throw new Error(error.message || "تعذر الوصول إلى الخدمة الآن");
  }
  return (data ?? {}) as T;
}

async function getAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.access_token) return sessionData.session.access_token;

  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: refreshed } = await supabase.auth.getSession();
  return refreshed?.session?.access_token ?? null;
}

/**
 * Calls a Lovable Cloud edge function with SSE streaming (OpenAI-compatible chunks).
 * Falls back to non-stream JSON parsing if upstream isn't actually streaming.
 * Returns the full content. If response was non-stream JSON (e.g. {content} or {response}),
 * the full text is delivered via onDelta in one chunk and returned.
 */
export async function streamEdgeFunction(
  fnName: string,
  body: Record<string, unknown>,
  cb: StreamCallbacks = {},
): Promise<StreamResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    const err = new Error("إعدادات الاتصال غير متاحة حالياً");
    cb.onError?.(err);
    throw err;
  }
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  let token = await getAccessToken();
  if (!token) {
    const err = new Error("جلسة غير صالحة، سجّل الدخول من جديد");
    cb.onError?.(err);
    throw err;
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    const json = await invokeEdgeFunctionJson<{ content?: string; response?: string; error?: string }>(fnName, {
      ...body,
      stream: false,
    });
    const content = String(json?.content ?? json?.response ?? "").trim();
    if (!content) {
      const err = new Error(json?.error || "تعذر الوصول إلى خدمة المساعد الآن");
      cb.onError?.(err);
      throw err;
    }
    cb.onDelta?.(content, content);
    cb.onDone?.(content);
    return { content, status: 200, ok: true };
  }

  if (resp.status === 401) {
    token = await getAccessToken();
    if (!token) {
      const err = new Error("جلسة غير صالحة، سجّل الدخول من جديد");
      cb.onError?.(err);
      throw err;
    }

    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
    });
  }

  const status = resp.status;

  if (!resp.ok) {
    let errMsg = `الخدمة غير متاحة (${status})`;
    try {
      const j = await resp.json();
      if (j?.error) errMsg = String(j.error);
    } catch {
      // ignore
    }
    const err = new Error(errMsg);
    cb.onError?.(err);
    throw err;
  }

  const ctype = resp.headers.get("content-type") || "";

  if (ctype.includes("text/html")) {
    const err = new Error("تعذر الوصول إلى خدمة المساعد الآن");
    cb.onError?.(err);
    throw err;
  }

  // Non-stream JSON fallback
  if (!ctype.includes("text/event-stream")) {
    const j = await resp.json().catch(() => ({} as any));
    const content = String(j?.content ?? j?.response ?? "").trim();
    if (content) cb.onDelta?.(content, content);
    cb.onDone?.(content);
    return { content, status, ok: true };
  }

  // SSE parsing
  if (!resp.body) {
    cb.onDone?.("");
    return { content: "", status, ok: true };
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process SSE events split by blank line OR newline-prefixed "data:"
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content
          ?? j?.choices?.[0]?.message?.content
          ?? "";
        if (typeof delta === "string" && delta) {
          full += delta;
          cb.onDelta?.(delta, full);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
  cb.onDone?.(full);
  return { content: full, status, ok: true };
}
