// Unified client for the Modrek AI reasoning engine (Phase 4/5 integration).
// All Modrek surfaces — student chat, teacher assistant, exam generator,
// image/exam analyzers, and lesson explainer — go through this helper so we
// have one place to enforce cancellation, retries, timing and error UX.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON } from "@/lib/aiStream";

export type ModrekMode =
  | "auto" | "answer" | "explain" | "solve" | "summarize" | "compare" | "translate"
  | "generate_exam" | "extract_questions" | "analyze_exam" | "analyze_image" | "grade_answer";

export type ModrekMessage = { role: "system" | "user" | "assistant"; content: unknown };

export interface ModrekCitation {
  source_id?: string;
  source_title?: string;
  unit_title?: string;
  page_from?: number | null;
  page_to?: number | null;
  confidence?: number;
  snippet?: string;
}

export interface ModrekReasonRequest {
  mode?: ModrekMode;
  query?: string;
  messages?: ModrekMessage[];
  image_base64?: string | null;
  image_mime?: string | null;
  file_base64?: string | null;
  file_mime?: string | null;
  file_name?: string | null;
  filters?: Record<string, unknown>;
  exam?: {
    question_count?: number;
    mcq?: number;
    tf?: number;
    essay?: number;
    difficulty?: "سهل" | "متوسط" | "صعب" | "مختلط";
    distribution?: string;
    subject?: string;
    lesson?: string;
  };
  student_answer?: string;
  model_answer?: string;
}

export interface ModrekReasonResponse {
  mode: ModrekMode;
  plan?: any;
  answer?: string;
  exam?: { questions: any[] };
  analysis?: any;
  grading?: any;
  citations: ModrekCitation[];
  confidence: number;
  library_used: boolean;
  suggest_external?: boolean;
  duration_ms?: number;
  error?: string;
}

export class ModrekAbortError extends Error {
  constructor() { super("cancelled"); this.name = "ModrekAbortError"; }
}

export interface InvokeOptions {
  signal?: AbortSignal;
  retries?: number;      // default 1 auto-retry on transient failure
  timeoutMs?: number;    // default 90s
}

async function once(body: ModrekReasonRequest, signal: AbortSignal): Promise<ModrekReasonResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON) throw new Error("إعدادات الاتصال غير متاحة");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? SUPABASE_ANON;

  const r = await fetch(`${SUPABASE_URL}/functions/v1/modrek-reason`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  const text = await r.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* keep raw */ }

  if (!r.ok) {
    const msg = json?.error || `فشل الاتصال (${r.status})`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return json as ModrekReasonResponse;
}

export async function invokeModrekReason(
  body: ModrekReasonRequest,
  opts: InvokeOptions = {},
): Promise<ModrekReasonResponse> {
  const retries = Math.max(0, opts.retries ?? 1);
  const timeoutMs = opts.timeoutMs ?? 90_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const external = opts.signal;
    const onExternalAbort = () => ac.abort();
    if (external) {
      if (external.aborted) throw new ModrekAbortError();
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await once(body, ac.signal);
    } catch (err: any) {
      if (external?.aborted) throw new ModrekAbortError();
      const status = err?.status as number | undefined;
      const transient = err?.name === "AbortError" || (status && status >= 500);
      if (attempt < retries && transient) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (err?.name === "AbortError") throw new ModrekAbortError();
      throw err;
    } finally {
      clearTimeout(timer);
      if (external) external.removeEventListener("abort", onExternalAbort);
    }
  }
  throw new Error("تعذر تنفيذ الطلب");
}

// Convenience helpers used across UI surfaces.
export function isAbort(err: unknown): err is ModrekAbortError {
  return err instanceof ModrekAbortError || (err as any)?.name === "AbortError";
}

export function confidenceLabel(c: number): { label: string; tone: "high" | "mid" | "low" } {
  if (c >= 0.75) return { label: "ثقة عالية", tone: "high" };
  if (c >= 0.55) return { label: "ثقة متوسطة", tone: "mid" };
  return { label: "ثقة منخفضة", tone: "low" };
}
