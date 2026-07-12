import { supabase } from "@/integrations/supabase/client";

function stringifyFunctionMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const anyValue: any = value;
    const parts = [anyValue.message, anyValue.details, anyValue.hint, anyValue.code]
      .filter((part) => typeof part === "string" && part.trim());
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(value); } catch { return "خطأ غير معروف من الخادم"; }
  }
  return undefined;
}

export async function callStudyAssistant(input: {
  messages: any[];
  conversationContext?: Record<string, any>;
}): Promise<{ reply: string }> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-study", { body: input });
  if (error) throw new Error(error.message || "تعذر الاتصال بالمساعد");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { reply: string };
}

function buildUserFacingExamError(body: any, fallback?: string) {
  const publicMessage = stringifyFunctionMessage(body?.publicMessage);
  const reply = stringifyFunctionMessage(body?.reply);
  const technical = stringifyFunctionMessage(body?.error) || stringifyFunctionMessage(body?.message) || fallback;
  const message = publicMessage || reply || "تعذر إنشاء الامتحان حالياً. حاول مرة أخرى بعد قليل.";
  const err: any = new Error(message);
  err.publicMessage = message;
  err.technicalMessage = technical;
  err.code = body?.errorCode;
  err.traceId = body?.traceId;
  return err;
}

async function readFunctionErrorBody(error: any): Promise<{ message?: string; publicMessage?: string; code?: string; traceId?: string; technicalMessage?: string } | null> {
  const response = error?.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.json();
      return {
        message: stringifyFunctionMessage(body?.publicMessage) || stringifyFunctionMessage(body?.reply) || stringifyFunctionMessage(body?.message),
        publicMessage: stringifyFunctionMessage(body?.publicMessage),
        technicalMessage: stringifyFunctionMessage(body?.error),
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
      throw buildUserFacingExamError(data, "تعذر إنشاء الامتحان");
    }
    return data as any;
  }

  const body = await readFunctionErrorBody(error);
  const message = body?.publicMessage || body?.message || "تعذر الاتصال بمساعد الامتحانات حالياً.";
  console.error("[src/features/modrek-ai/api.ts:callExamsAssistant] invoke failed", {
    publicMessage: message,
    technicalMessage: body?.technicalMessage || error?.message,
    code: body?.code,
    traceId: body?.traceId,
    stack: error?.stack,
  });
  const err: any = new Error(message);
  err.publicMessage = message;
  err.technicalMessage = body?.technicalMessage || error?.message;
  err.code = body?.code;
  err.traceId = body?.traceId;
  throw err;
}
