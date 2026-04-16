import { supabase } from "@/integrations/supabase/client";

type SupportAssistantPayload = {
  messages: Array<{ role: string; content: unknown }>;
};

type SupportAssistantResponse = {
  content?: string;
  error?: string;
};

function normalizeMessages(messages: SupportAssistantPayload["messages"]) {
  return messages
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: typeof message.content === "string" || Array.isArray(message.content) ? message.content : String(message.content ?? ""),
    }));
}

export async function invokeSupportAssistant(payload: SupportAssistantPayload) {
  let lastError: Error | null = null;

  // Refresh session before calling to avoid stale token 401s
  const { error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr) {
    throw new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabase.functions.invoke<SupportAssistantResponse>("support-assistant", {
      body: {
        ...payload,
        messages: normalizeMessages(payload.messages),
      },
    });

    if (error) {
      lastError = new Error(error.message || "فشل الاتصال بالمساعد");
      continue;
    }

    const content = typeof data?.content === "string" ? data.content.trim() : "";
    if (content) {
      return content;
    }

    lastError = new Error(data?.error || "لم يصل رد صالح من المساعد");
  }

  throw lastError || new Error("تعذر الوصول للمساعد الآن");
}