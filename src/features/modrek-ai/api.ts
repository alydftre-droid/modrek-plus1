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
}): Promise<{ reply?: string; examId?: string; attemptId?: string | null; title?: string; questionCount?: number }> {
  let lastError: any = null;

  const readFunctionError = async (error: any) => {
    const response = error?.context;
    if (response && typeof response.json === "function") {
      try {
        const body = await response.json();
        return body?.reply || body?.error || body?.message || null;
      } catch {
        try { return await response.text(); } catch { return null; }
      }
    }
    return null;
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await supabase.functions.invoke("modrek-ai-exams", { body: input });
    if (!error) {
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    }
    const serverMessage = await readFunctionError(error);
    if (serverMessage && !String(serverMessage).includes("Edge Function returned")) {
      lastError = new Error(serverMessage);
    } else {
      lastError = error;
    }
  }

  console.error("[modrek-ai-exams] invoke failed", lastError);
  throw new Error(
    lastError?.message && !String(lastError.message).includes("Edge Function returned")
      ? lastError.message
      : "تعذر إنشاء الامتحان حالياً، جاري إعادة المحاولة..."
  );
}
