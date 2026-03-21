import { supabase } from "@/integrations/supabase/client";

type SupportAssistantPayload = {
  messages: Array<{ role: string; content: unknown }>;
};

type SupportAssistantResponse = {
  content?: string;
  error?: string;
};

export async function invokeSupportAssistant(payload: SupportAssistantPayload) {
  const { data, error } = await supabase.functions.invoke<SupportAssistantResponse>("support-assistant", {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || "فشل الاتصال بالمساعد");
  }

  const content = typeof data?.content === "string" ? data.content.trim() : "";
  if (!content) {
    throw new Error(data?.error || "لم يصل رد صالح من المساعد");
  }

  return content;
}