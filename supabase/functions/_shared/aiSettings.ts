// Shared helper used by all AI edge functions to load runtime settings
// from the public.ai_function_settings table. Falls back to safe defaults
// if the row is missing or DB read fails.
import { getOpenRouterApiKey, openRouterChat, toOpenRouterModelId } from "./openrouter.ts";
import { getActiveAiProvider } from "./aiProvider.ts";
import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_TTS_MODELS as POLICY_TTS_MODELS,
  EXAM_MODELS,
  enforceModelPolicy,
  isExamFunction,
  logAiCall,
} from "./aiModels.ts";

export type AiFunctionSettings = {
  function_name: string;
  models_to_try: string[];
  max_retries: number;
  fallback_delay_ms: number;
  enable_streaming: boolean;
};

export type AiFallbackAudience = "student" | "teacher" | "general";
export type AiFailureKind = "safety" | "rate_limit" | "timeout" | "auth" | "billing" | "empty" | "invalid_json" | "network" | "service";

export const OFFICIAL_PLATFORM_NAME_AR = "مدرك بلس";
export const OFFICIAL_PLATFORM_NAME_EN = "Modrek Plus";

export function sanitizeForbiddenPlatformNames(content: string): string {
  const legacyArabicWithHamza = new RegExp("\\u0623\\u0632\\u0647\\u0631\\u064a\\u0648\\u0646", "g");
  const legacyArabicWithoutHamza = new RegExp("\\u0627\\u0632\\u0647\\u0631\\u064a\\u0648\\u0646", "g");
  return String(content || "")
    .replace(legacyArabicWithHamza, OFFICIAL_PLATFORM_NAME_AR)
    .replace(legacyArabicWithoutHamza, OFFICIAL_PLATFORM_NAME_AR)
    .replace(new RegExp(["Azhar", "ion"].join(""), "gi"), OFFICIAL_PLATFORM_NAME_EN)
    .replace(new RegExp(["Azhary", "on"].join(""), "gi"), OFFICIAL_PLATFORM_NAME_EN);
}

// Model selection is fully centralised in _shared/aiModels.ts. Every
// entry here defers to that policy — Flash is the platform default and
// Pro is reserved for formal exam generation only.
const DEFAULT_MODELS = DEFAULT_CHAT_MODELS;
const DEFAULT_TTS_MODELS = POLICY_TTS_MODELS;

const DEFAULTS: Record<string, AiFunctionSettings> = {
  "ai-chat":            { function_name: "ai-chat",            models_to_try: DEFAULT_MODELS, max_retries: 3, fallback_delay_ms: 0, enable_streaming: true },
  "support-assistant":  { function_name: "support-assistant",  models_to_try: DEFAULT_MODELS, max_retries: 3, fallback_delay_ms: 0, enable_streaming: true },
  "teacher-assistant":  { function_name: "teacher-assistant",  models_to_try: DEFAULT_MODELS, max_retries: 3, fallback_delay_ms: 0, enable_streaming: true },
  // Formal exams are the only surface allowed to use Gemini 2.5 Pro.
  "modrek-ai-exams":    { function_name: "modrek-ai-exams",    models_to_try: EXAM_MODELS,    max_retries: 3, fallback_delay_ms: 0, enable_streaming: false },
  "grade-essay":        { function_name: "grade-essay",        models_to_try: DEFAULT_MODELS, max_retries: 3, fallback_delay_ms: 0, enable_streaming: false },
  "library-explain-tts": { function_name: "library-explain-tts", models_to_try: DEFAULT_TTS_MODELS, max_retries: 2, fallback_delay_ms: 0, enable_streaming: false },
};

const GLOBAL_MODEL_FALLBACKS = DEFAULT_MODELS;


/**
 * Kept for compatibility with existing edge functions. Returns the
 * OpenRouter key — reading from Vault first, then env. The `envKey`
 * parameter is ignored (legacy signature); callers no longer need to
 * pass a Gemini key.
 */
export async function resolveGeminiApiKey(
  // deno-lint-ignore no-explicit-any
  sb: any,
  _envKey?: string,
): Promise<{ apiKey: string; source: "vault" | "env" | "missing" }> {
  // Resolves the key of the ACTIVE AI provider (OpenRouter, AgentRouter, ...).
  // The inactive provider is never contacted and its key is never read.
  try {
    const active = await getActiveAiProvider();
    if (active.apiKey) return { apiKey: active.apiKey, source: "env" };
  } catch (_e) { /* fall through to legacy env lookup */ }
  const envKey = String(Deno.env.get("OPENROUTER_API_KEY") || "").trim();
  if (envKey) return { apiKey: envKey, source: "env" };
  return { apiKey: "", source: "missing" };
}

// Alias with clearer name for new code.
export const resolveOpenRouterApiKey = resolveGeminiApiKey;

function uniqueModels(models: string[]) {
  const seen = new Set<string>();
  return models
    .map((model) => String(model || "").trim())
    .filter((model) => model && !seen.has(model) && seen.add(model));
}

function withGlobalGeminiFallbacks(models: string[]) {
  return uniqueModels([...models, ...GLOBAL_MODEL_FALLBACKS]);
}

function normalizeModelsForFunction(fnName: string, models: string[], fallback: AiFunctionSettings) {
  if (fnName.includes("tts")) return uniqueModels(models.length ? models : fallback.models_to_try);
  const base = models.length ? models : fallback.models_to_try;
  // Enforce the platform Flash/Pro policy — non-exam functions cannot use Pro.
  const withFallbacks = withGlobalGeminiFallbacks(base);
  return enforceModelPolicy(fnName, withFallbacks);
}


export async function loadAiSettings(
  // deno-lint-ignore no-explicit-any
  sb: any,
  fnName: string,
): Promise<AiFunctionSettings> {
  const fallback = DEFAULTS[fnName] ?? {
    function_name: fnName,
    models_to_try: DEFAULT_MODELS,
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: false,
  };
  try {
    // Each provider keeps its own model lists. OpenRouter keeps using the
    // original ai_function_settings table (unchanged); any other active
    // provider reads ai_provider_function_settings.
    let activeProvider = "openrouter";
    try { activeProvider = (await getActiveAiProvider()).provider; } catch (_e) { /* default */ }

    let data: any = null;
    let error: any = null;
    if (activeProvider !== "openrouter") {
      const res = await sb
        .from("ai_provider_function_settings")
        .select("function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming")
        .eq("provider", activeProvider)
        .eq("function_name", fnName)
        .maybeSingle();
      data = res.data; error = res.error;
    }
    if (!data) {
      const res = await sb
        .from("ai_function_settings")
        .select("function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming")
        .eq("function_name", fnName)
        .maybeSingle();
      data = res.data; error = res.error;
    }
    if (error || !data) return fallback;
    return {
      function_name: data.function_name,
      models_to_try: normalizeModelsForFunction(
        fnName,
        Array.isArray(data.models_to_try) ? data.models_to_try : [],
        fallback,
      ),
      max_retries: typeof data.max_retries === "number" ? data.max_retries : fallback.max_retries,
      fallback_delay_ms: typeof data.fallback_delay_ms === "number" ? data.fallback_delay_ms : fallback.fallback_delay_ms,
      enable_streaming: typeof data.enable_streaming === "boolean" ? data.enable_streaming : fallback.enable_streaming,
    };
  } catch (_e) {
    return fallback;
  }
}

// Helper to call the AI provider with model fallback. OpenRouter is the ONLY
// provider — Gemini/OpenAI/Anthropic direct paths have been removed.
export type AiProvider = string;
export type GeminiCallResult =
  | { ok: true; response: Response; model: string; provider: AiProvider }
  | { ok: false; status: number; lastError?: string };

function summarizeUpstreamError(input?: string) {
  const text = String(input || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    const error = parsed?.error;
    if (error?.message) return String(error.message);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch { /* keep raw text */ }
  return text;
}

/**
 * Call the AI provider (OpenRouter) with model fallback. Prefer an explicitly
 * resolved key (Vault/env from the caller), then fall back to process env.
 */
export async function callGeminiWithFallback(opts: {
  apiKey?: string;
  models: string[];
  body: Record<string, unknown>;
  fallbackDelayMs?: number;
  timeoutMs?: number;
  functionName?: string;
  task?: string;
  purpose?: "chat" | "exam" | "vision" | "tts" | "background" | "ocr" | "rag" | "grade" | "summarize" | "extract";
}): Promise<GeminiCallResult> {
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 45_000;
  // Resolve the ACTIVE provider (OpenRouter by default). Only that provider
  // is contacted — the inactive one receives no requests at all.
  let active = { provider: "openrouter", baseUrl: "", apiKey: "", apiKeyEnv: "OPENROUTER_API_KEY" };
  try {
    const resolved = await getActiveAiProvider();
    active = { provider: resolved.provider, baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, apiKeyEnv: resolved.apiKeyEnv };
  } catch (_e) { /* fallback to env-based OpenRouter */ }
  const providerKey = String(opts.apiKey || "").trim() || active.apiKey || getOpenRouterApiKey();
  if (!providerKey) {
    return { ok: false, status: 401, lastError: `${active.apiKeyEnv}_MISSING` };
  }

  const fnName = opts.functionName || "unknown";
  // Enforce Flash/Pro policy at call time as the last line of defence, so a
  // stale caller cannot slip a Pro model into a non-exam surface.
  const models = enforceModelPolicy(fnName, withGlobalGeminiFallbacks(opts.models));
  let lastStatus = 0;
  let lastError = "";

  for (let i = 0; i < models.length; i++) {
    const orModel = toOpenRouterModelId(models[i]);
    const startedAt = Date.now();
    const orResult = await openRouterChat({
      apiKey: providerKey,
      model: orModel,
      body: opts.body,
      timeoutMs,
      baseUrl: active.baseUrl || undefined,
    });
    const durationMs = Date.now() - startedAt;
    if (orResult.ok) {
      logAiCall({
        function: fnName,
        task: opts.task,
        model: orModel,
        purpose: opts.purpose,
        durationMs,
        status: 200,
        ok: true,
      });
      return { ok: true, response: orResult.response, model: orModel, provider: active.provider };
    }
    lastStatus = orResult.status;
    lastError = orResult.lastError;
    logAiCall({
      function: fnName,
      task: opts.task,
      model: orModel,
      purpose: opts.purpose,
      durationMs,
      status: orResult.status,
      ok: false,
      error: summarizeUpstreamError(orResult.lastError).slice(0, 500),
    });
    // Hard failures — retrying more models won't help.
    if (orResult.status === 401 || orResult.status === 402 || orResult.status === 403) break;
    if (i < models.length - 1 && opts.fallbackDelayMs && opts.fallbackDelayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.fallbackDelayMs));

    }
  }

  return { ok: false, status: lastStatus || 502, lastError };
}



function truncateErrorForLog(input?: string, max = 500) {
  if (!input) return "";
  return input.length > max ? `${input.slice(0, max)}…` : input;
}

export function detectAiFailureKind(status?: number, lastError?: string): AiFailureKind {
  const text = String(lastError || "").toLowerCase();

  if (status === 429 || text.includes("rate") || text.includes("quota")) return "rate_limit";
  if (status === 401 || text.includes("api key") || text.includes("unauthorized")) return "auth";
  if (status === 402 || status === 403 || text.includes("billing") || text.includes("payment required")) return "billing";
  if (text.includes("timeout") || text.includes("deadline") || text.includes("abort")) return "timeout";
  if (
    text.includes("safety") ||
    text.includes("blocked") ||
    text.includes("prohibited") ||
    text.includes("harm_category") ||
    text.includes("responsible ai") ||
    text.includes("recitation") ||
    text.includes("content filter")
  ) return "safety";
  if (text.includes("unexpected end of json") || text.includes("invalid json") || text.includes("json parse")) return "invalid_json";
  if (text.includes("network") || text.includes("failed to fetch") || text.includes("connection")) return "network";
  if (text.includes("empty_response") || text.includes("empty response") || text.includes("no content")) return "empty";
  return "service";
}

export function buildAiFallbackMessage(audience: AiFallbackAudience, kind: AiFailureKind): string {
  if (kind === "safety") {
    return audience === "teacher"
      ? "أقدر أساعدك في الاستخدام الآمن للمنصة وحماية الحساب، لكن لا أستطيع المساعدة في الاختراق أو الإضرار بالأنظمة. لو تحب، أشرح لك أفضل ممارسات الأمان أو طريقة تأمين حسابك خطوة بخطوة."
      : "لا أستطيع المساعدة في الاختراق أو أي استخدام ضار. إذا كان قصدك الحماية أو الأمان الرقمي، أقدر أشرح لك الطريقة الآمنة بشكل واضح وبسيط.";
  }

  if (kind === "rate_limit") return "الخدمة عليها ضغط مؤقت الآن. جرّب مرة أخرى بعد دقيقة، وأنا جاهز أكمل معك فوراً.";
  if (kind === "timeout") return "الرد أخذ وقتاً أطول من المعتاد. أعد إرسال سؤالك أو ارسله بشكل أقصر وسأكمل معك فوراً.";
  if (kind === "empty") return "لم يصلني رد صالح هذه المرة. أعد صياغة سؤالك أو أرسله بشكل أقصر وسأحاول فوراً.";
  if (kind === "invalid_json") return "حدثت مشكلة مؤقتة أثناء تجهيز الرد. أعد إرسال سؤالك الآن وسأكمل معك بشكل طبيعي.";
  if (kind === "network") return "حدثت مشكلة اتصال مؤقتة. جرّب مرة أخرى بعد لحظات، والخدمة ما زالت تعمل بشكل طبيعي.";
  if (kind === "auth" || kind === "billing") return "الخدمة غير متاحة مؤقتاً حالياً. حاول بعد قليل، وإذا استمرت المشكلة تواصل مع الدعم.";

  if (audience === "teacher") {
    return "تعذر تجهيز الرد الآن، لكن الخدمة ما زالت تعمل. أعد إرسال سؤالك أو اكتب المطلوب باختصار وسأكمل معك فوراً.";
  }

  if (audience === "student") {
    return "تعذر تجهيز الرد الآن، لكن المساعد ما زال يعمل. أعد إرسال سؤالك أو اكتبه بشكل أوضح وسأحاول معك فوراً.";
  }

  return "تعذر تجهيز الرد الآن، لكن الخدمة ما زالت تعمل. أعد المحاولة بعد لحظات.";
}

export function fallbackAssistantResponse(opts: {
  audience: AiFallbackAudience;
  corsHeaders: Record<string, string>;
  functionName: string;
  kind?: AiFailureKind;
  lastError?: string;
  message?: string;
  status?: number;
}): Response {
  const kind = opts.kind ?? detectAiFailureKind(opts.status, opts.lastError);
  const message = opts.message ?? buildAiFallbackMessage(opts.audience, kind);

  console.error(`[${opts.functionName}] fallback_response`, JSON.stringify({
    kind,
    status: opts.status ?? null,
    lastError: truncateErrorForLog(opts.lastError),
  }));

  return new Response(JSON.stringify({
    content: message,
    response: message,
    fallback: true,
    reason: kind,
    provider: "fallback",
    model: null,
  }), {
    status: 200,
    headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
  });
}

export function buildAiSuccessPayload(content: string, provider: AiProvider, model: string) {
  return {
    content,
    response: content,
    fallback: false,
    provider,
    model,
  };
}

export function errorResponseFromStatus(status: number, corsHeaders: Record<string, string>): Response {
  if (status === 402) {
    return new Response(JSON.stringify({ error: "تعذّر الاتصال بالذكاء الاصطناعي عبر OpenRouter. تحقق من الرصيد أو المفتاح." }), {
      status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (status === 429) {
    return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح. حاول بعد دقيقة." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: "خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. حاول لاحقاً." }), {
    status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
