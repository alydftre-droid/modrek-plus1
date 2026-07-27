// ============================================================================
// Central AI model policy for Modrek Plus.
// ----------------------------------------------------------------------------
// Rules (see project brief):
//   1. Gemini 2.5 Flash is the DEFAULT for every AI task on the platform
//      (chat, explanations, Q&A, PDF analysis, OCR post-processing,
//      summarization, extraction, RAG, background workers, book processing,
//      metadata, keywords, page analysis, embeddings pipeline, cron jobs).
//   2. Gemini 2.5 Pro is ONLY used for formal exam generation
//      (`modrek-ai-exams` — teacher/final exams and explicitly requested
//      complex reasoning).
//   3. Never call Pro from book uploads, indexing, OCR, explanations,
//      PDF processing, embeddings pipeline, background/automated jobs.
//
// All other AI code MUST import from this file rather than hardcoding
// model IDs. This lets us change the platform-wide policy from one place.
// ============================================================================

// ---- Model IDs -------------------------------------------------------------
export const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_CHAT_FALLBACK = "google/gemini-2.5-flash-lite";

// Vision / multimodal (PDF pages, image OCR post-processing, page analysis).
// Deliberately Flash — vision on Pro is explicitly forbidden by policy.
export const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_VISION_FALLBACK = "google/gemini-2.5-flash-lite";

// Formal exam generation only.
export const EXAM_MODEL_PRIMARY = "google/gemini-2.5-pro";
export const EXAM_MODEL_FALLBACK = "google/gemini-2.5-flash";

// TTS is a separate modality and does not participate in the Flash/Pro policy.
export const DEFAULT_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";

// ---- Convenience arrays ----------------------------------------------------
export const DEFAULT_CHAT_MODELS = [DEFAULT_CHAT_MODEL, DEFAULT_CHAT_FALLBACK];
export const DEFAULT_VISION_MODELS = [DEFAULT_VISION_MODEL, DEFAULT_VISION_FALLBACK];
export const EXAM_MODELS = [EXAM_MODEL_PRIMARY, EXAM_MODEL_FALLBACK];
export const DEFAULT_TTS_MODELS = [DEFAULT_TTS_MODEL];

// ---- Policy helper ---------------------------------------------------------
// Function names that are allowed to use the Pro exam model. Anything else
// gets forced to the Flash default even if a stale DB row says otherwise.
const EXAM_FUNCTION_NAMES = new Set<string>([
  "modrek-ai-exams",
]);

export function isExamFunction(fnName?: string | null): boolean {
  return !!fnName && EXAM_FUNCTION_NAMES.has(fnName);
}

/**
 * Enforce the Flash/Pro policy on any list of models loaded from
 * `ai_function_settings` (or from a caller). Non-exam functions have every
 * `gemini-2.5-pro*` id stripped and replaced by the platform default.
 */
export function enforceModelPolicy(fnName: string, models: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  const isExam = isExamFunction(fnName);
  for (const raw of models) {
    let id = String(raw || "").trim();
    if (!id) continue;
    const bare = id.replace(/^google\//, "");
    const isPro = /^gemini-2\.5-pro/i.test(bare);
    if (isPro && !isExam) {
      // Policy violation — swap to the platform default.
      id = DEFAULT_CHAT_MODEL;
      console.warn("[ai-policy] pro_model_replaced", JSON.stringify({
        function: fnName,
        requested: raw,
        replacement: DEFAULT_CHAT_MODEL,
      }));
    }
    if (!seen.has(id)) {
      seen.add(id);
      cleaned.push(id);
    }
  }
  if (!cleaned.length) {
    return isExam ? [...EXAM_MODELS] : [...DEFAULT_CHAT_MODELS];
  }
  return cleaned;
}

// ---- Structured logging ----------------------------------------------------
// Rough public pricing (USD per 1M tokens) used only for cost estimation
// in logs. Update whenever provider pricing changes.
const COST_PER_MTOK: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash":       { input: 0.30, output: 2.50 },
  "google/gemini-2.5-flash-lite":  { input: 0.10, output: 0.40 },
  "google/gemini-2.5-pro":         { input: 1.25, output: 10.00 },
  "google/gemini-3.1-flash-tts-preview": { input: 0.30, output: 0.30 },
};

export interface AiCallLog {
  function: string;               // edge function name
  task?: string;                  // sub-task (e.g. "generate_explanations")
  model: string;                  // model id actually used
  purpose?: "chat" | "exam" | "vision" | "tts" | "background" | "ocr" | "rag" | "grade" | "summarize" | "extract";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  error?: string;
}

export function estimateCostUSD(model: string, promptTokens = 0, completionTokens = 0): number | null {
  const price = COST_PER_MTOK[model];
  if (!price) return null;
  const cost = (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
  return Number(cost.toFixed(6));
}

/**
 * One-line structured AI call log. Emits JSON so it is easy to grep in the
 * edge-function logs and later aggregate into a dashboard.
 */
export function logAiCall(entry: AiCallLog): void {
  const est = estimateCostUSD(entry.model, entry.promptTokens, entry.completionTokens);
  const payload = {
    kind: "ai_call",
    function: entry.function,
    task: entry.task ?? null,
    model: entry.model,
    purpose: entry.purpose ?? null,
    tokens: {
      prompt: entry.promptTokens ?? null,
      completion: entry.completionTokens ?? null,
      total: entry.totalTokens ?? (((entry.promptTokens ?? 0) + (entry.completionTokens ?? 0)) || null),
    },
    duration_ms: entry.durationMs ?? null,
    status: entry.status ?? null,
    ok: entry.ok ?? null,
    est_cost_usd: est,
    error: entry.error ? String(entry.error).slice(0, 300) : null,
  };
  console.log("[ai-call]", JSON.stringify(payload));
}
