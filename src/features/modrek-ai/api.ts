import { supabase } from "@/integrations/supabase/client";

export async function callStudyAssistant(input: {
  messages: any[];
  conversationContext?: Record<string, any>;
}): Promise<{ reply: string }> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-study", { body: input });
  if (error) throw new Error(error.message || "تعذر الاتصال بالمساعد");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { reply: string };
}

export async function callExamsAssistant(input: {
  messages: any[];
  conversationContext?: Record<string, any>;
}): Promise<{ reply?: string; examId?: string; title?: string; questionCount?: number }> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-exams", { body: input });
  if (error) throw new Error(error.message || "تعذر الاتصال بمساعد الامتحانات");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}
