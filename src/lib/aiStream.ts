import { supabase } from "@/integrations/supabase/client";

type EdgeJsonPayload = {
  content?: string;
  response?: string;
  error?: string;
  provider?: string;
  model?: string | null;
  fallback?: boolean;
};

// AI assistants hit the same backend the app is built against (env-driven).
// All required edge functions must be deployed on the production project
// (qteuqfntsocsdbjmdvmr) — see docs/external-supabase-transfer.md.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

export type StreamCallbacks = {
  onDelta?: (text: string, full: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
};

export type StreamResult = {
  content: string;
  status: number;
  ok: boolean;
  provider?: string;
  model?: string | null;
  fallback?: boolean;
};

export async function invokeEdgeFunctionJson<T = any>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error("إعدادات الاتصال غير متاحة حالياً");
  }

  let token = await getAccessToken();
  if (!token) {
    throw new Error("جلسة غير صالحة، سجّل الدخول من جديد");
  }

  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  let resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401) {
    token = await getAccessToken();
    if (!token) {
      throw new Error("جلسة غير صالحة، سجّل الدخول من جديد");
    }

    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  if (!resp.ok) {
    let errMsg = `الخدمة غير متاحة (${resp.status})`;
    try {
      const json = await resp.json();
      if (json?.error) errMsg = String(json.error);
    } catch {
      // ignore malformed error payloads
    }
    throw new Error(errMsg);
  }

  const ctype = resp.headers.get("content-type") || "";
  if (ctype.includes("text/html")) {
    throw new Error("تعذر الوصول إلى الخدمة الآن");
  }

  return (await resp.json().catch(() => ({}))) as T;
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
    const json = await invokeEdgeFunctionJson<EdgeJsonPayload>(fnName, {
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
    return { content, status: 200, ok: true, provider: json.provider, model: json.model, fallback: json.fallback };
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
    const j = await resp.json().catch(() => ({} as EdgeJsonPayload));
    const content = String(j?.content ?? j?.response ?? "").trim();
    if (content) cb.onDelta?.(content, content);
    cb.onDone?.(content);
    return { content, status, ok: true, provider: j.provider, model: j.model, fallback: j.fallback };
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
