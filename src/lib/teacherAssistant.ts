import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionJson, streamEdgeFunction } from "@/lib/aiStream";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

type TeacherAssistantPayload = {
  messages: Array<{ role: string; content: unknown }>;
  onDelta?: (chunk: string, full: string) => void;
};

function normalizeMessages(messages: TeacherAssistantPayload["messages"]) {
  return messages.slice(-12).map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string" || Array.isArray(m.content)
        ? m.content
        : String(m.content ?? ""),
  }));
}

async function callNonStream(messages: ReturnType<typeof normalizeMessages>): Promise<string> {
  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON) throw new Error("جلسة غير صالحة، سجّل الدخول من جديد");

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/teacher-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, stream: false }),
  });

  if (!resp.ok) {
    let msg = `الخدمة غير متاحة (${resp.status})`;
    try { const j = await resp.json(); if (j?.error) msg = String(j.error); } catch { /* ignore */ }
    throw new Error(msg);
  }
  const j = await resp.json().catch(() => ({} as any));
  return String(j?.content ?? j?.response ?? "").trim();
}

export async function invokeTeacherAssistant(payload: TeacherAssistantPayload) {
  const { onDelta } = payload;
  const messages = normalizeMessages(payload.messages);
  let lastError: Error | null = null;

  // Attempt 1: streaming
  try {
    let aggregate = "";
    const result = await streamEdgeFunction(
      "teacher-assistant",
      { messages },
      {
        onDelta: (delta) => {
          aggregate += delta;
          onDelta?.(delta, aggregate);
        },
      },
    );
    const content = (result.content || aggregate).trim();
    if (content) return content;
    lastError = new Error("رد فارغ من المساعد");
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
    console.error("[teacher-assistant] stream attempt failed:", lastError.message);
  }

  // Attempt 2: non-stream fallback (more reliable)
  try {
    const content = await callNonStream(messages);
    if (content) {
      onDelta?.(content, content);
      return content;
    }
    lastError = new Error("رد فارغ من المساعد");
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
    console.error("[teacher-assistant] non-stream attempt failed:", lastError.message);
  }

  try {
    const data = await invokeEdgeFunctionJson<{ content?: string; response?: string }>("teacher-assistant", {
      messages,
      stream: false,
    });
    const content = String(data?.content ?? data?.response ?? "").trim();
    if (content) {
      onDelta?.(content, content);
      return content;
    }
    lastError = new Error("رد فارغ من المساعد");
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
    console.error("[teacher-assistant] supabase invoke fallback failed:", lastError.message);
  }

  throw lastError || new Error("تعذر الوصول للمساعد الآن");
}
