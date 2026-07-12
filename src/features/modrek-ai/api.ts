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

async function readFunctionErrorBody(error: any): Promise<{ message?: string; code?: string; traceId?: string } | null> {
  const response = error?.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.json();
      return {
        message: body?.error || body?.reply || body?.message,
        code: body?.errorCode,
        traceId: body?.traceId,
      };
    } catch {
      try {
        const t = await response.text();
        return { message: t };
      } catch { return null; }
    }
  }
  return null;
}

export async function callExamsAssistant(input: {
  messages: any[];
  conversationContext?: Record<string, any>;
}): Promise<{ reply?: string; examId?: string; attemptId?: string | null; title?: string; questionCount?: number; redirectTo?: string }> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-exams", { body: input });

  if (!error) {
    if ((data as any)?.error) {
      const err: any = new Error((data as any).error);
      err.code = (data as any).errorCode;
      err.traceId = (data as any).traceId;
      throw err;
    }
    return data as any;
  }

  const body = await readFunctionErrorBody(error);
  const message = body?.message || error?.message || "تعذر الاتصال بالمساعد";
  const suffix = body?.traceId ? ` (traceId: ${body.traceId})` : "";
  console.error("[modrek-ai-exams] invoke failed", { message, code: body?.code, traceId: body?.traceId });
  const err: any = new Error(`${message}${suffix}`);
  err.code = body?.code;
  err.traceId = body?.traceId;
  throw err;
}
