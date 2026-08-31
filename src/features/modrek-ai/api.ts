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
}): Promise<{ reply: string; diagram?: { format: "mermaid" | "svg"; code: string; title?: string } | null }> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-study", { body: input });
  if (error) throw new Error(error.message || "تعذر الاتصال بالمساعد");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { reply: string; diagram?: { format: "mermaid" | "svg"; code: string; title?: string } | null };
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
  err.debug = body?.debug;
  if (body?.debug) {
    console.error("[src/features/modrek-ai/api.ts:callExamsAssistant] exam generation diagnostic", body.debug);
  }
  return err;
}

async function readFunctionErrorBody(error: any): Promise<{ message?: string; publicMessage?: string; code?: string; traceId?: string; technicalMessage?: string; debug?: any } | null> {
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
        ...(body?.debug ? { debug: body.debug } : {}),
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
    debug: (body as any)?.debug,
    stack: error?.stack,
  });
  const err: any = new Error(message);
  err.publicMessage = message;
  err.technicalMessage = body?.technicalMessage || error?.message;
  err.code = body?.code;
  err.traceId = body?.traceId;
  err.debug = (body as any)?.debug;
  throw err;
}

export async function startModrekTrainingAttemptViaFunction(input: {
  examId: string;
  attemptId?: string | null;
}): Promise<{ success: boolean; attempt_id?: string; resumed?: boolean; training_exam?: boolean; already_submitted?: boolean; redirect_to_review?: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-exams", {
    body: {
      action: "start-training-attempt",
      examId: input.examId,
      attemptId: input.attemptId || null,
    },
  });
  if (error) {
    const body = await readFunctionErrorBody(error);
    throw new Error(body?.message || error.message || "تعذر بدء التدريب");
  }
  return data as any;
}

export async function loadModrekTrainingQuestionsViaFunction(attemptId: string): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke("modrek-ai-exams", {
    body: {
      action: "load-training-questions",
      attemptId,
    },
  });
  if (error) {
    const body = await readFunctionErrorBody(error);
    throw new Error(body?.message || error.message || "تعذر تحميل أسئلة التدريب");
  }
  return (((data as any)?.questions || []) as any[]);
}

export async function submitModrekTrainingAttemptViaFunction(input: {
  attemptId?: string | null;
  examId?: string | null;
  answers?: Array<{
    questionId: string;
    selectedOptionIds?: string[];
    answerText?: string | null;
    flagged?: boolean;
  }>;
  tabSwitches?: number;
  fullscreenExits?: number;
}): Promise<{
  success: boolean;
  attempt_id?: string;
  already_submitted?: boolean;
  needs_ai_grading?: boolean;
  needs_manual_grading?: boolean;
  training_exam?: boolean;
  error?: string;
}> {
  console.debug("[exam-debug] submitModrekTrainingAttemptViaFunction.beforeRpc", {
    attempt_id: input.attemptId || null,
    exam_id: input.examId || null,
    answers_count: input.answers?.length || 0,
    rpc: "submit_exam_attempt_resilient",
  });
  const { data, error } = await supabase.rpc("submit_exam_attempt_resilient", {
    _exam_id: input.examId || null,
    _attempt_id: input.attemptId || null,
    _answers: input.answers || [],
    _tab_switches: input.tabSwitches || 0,
    _fullscreen_exits: input.fullscreenExits || 0,
  } as any);
  if (error) {
    console.debug("[exam-debug] submitModrekTrainingAttemptViaFunction.rpcError", { error });
    throw new Error(error.message || "تعذر تسليم التدريب");
  }
  console.debug("[exam-debug] submitModrekTrainingAttemptViaFunction.afterRpc", { response: data });
  return data as any;
}
