import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type StreamCallbacks = {
  onDelta?: (text: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
};

export type StreamResult = {
  content: string;
  status: number;
  ok: boolean;
};

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
  // Refresh session to avoid stale token 401
  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

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

  // Non-stream JSON fallback
  if (!ctype.includes("text/event-stream")) {
    const j = await resp.json().catch(() => ({} as any));
    const content = String(j?.content ?? j?.response ?? "").trim();
    if (content) cb.onDelta?.(content);
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
          cb.onDelta?.(delta);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }
  cb.onDone?.(full);
  return { content: full, status, ok: true };
}
