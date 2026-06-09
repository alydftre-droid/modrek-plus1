// Shared helper used by all AI edge functions to load runtime settings
// from the public.ai_function_settings table. Falls back to safe defaults
// if the row is missing or DB read fails.

export type AiFunctionSettings = {
  function_name: string;
  models_to_try: string[];
  max_retries: number;
  fallback_delay_ms: number;
  enable_streaming: boolean;
};

export type AiFallbackAudience = "student" | "teacher" | "general";
export type AiFailureKind = "safety" | "rate_limit" | "timeout" | "auth" | "billing" | "empty" | "invalid_json" | "network" | "service";

const DEFAULTS: Record<string, AiFunctionSettings> = {
  "ai-chat": {
    function_name: "ai-chat",
    models_to_try: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: true,
  },
  "support-assistant": {
    function_name: "support-assistant",
    models_to_try: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: true,
  },
  "teacher-assistant": {
    function_name: "teacher-assistant",
    models_to_try: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: true,
  },
  "generate-exam": {
    function_name: "generate-exam",
    models_to_try: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-flash-latest"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: false,
  },
  "grade-essay": {
    function_name: "grade-essay",
    models_to_try: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-flash-latest"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: false,
  },
};

export async function loadAiSettings(
  // deno-lint-ignore no-explicit-any
  sb: any,
  fnName: string,
): Promise<AiFunctionSettings> {
  const fallback = DEFAULTS[fnName] ?? {
    function_name: fnName,
    models_to_try: ["gemini-2.5-flash", "gemini-flash-latest"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: false,
  };
  try {
    const { data, error } = await sb
      .from("ai_function_settings")
      .select("function_name, models_to_try, max_retries, fallback_delay_ms, enable_streaming")
      .eq("function_name", fnName)
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      function_name: data.function_name,
      models_to_try: Array.isArray(data.models_to_try) && data.models_to_try.length > 0 ? data.models_to_try : fallback.models_to_try,
      max_retries: typeof data.max_retries === "number" ? data.max_retries : fallback.max_retries,
      fallback_delay_ms: typeof data.fallback_delay_ms === "number" ? data.fallback_delay_ms : fallback.fallback_delay_ms,
      enable_streaming: typeof data.enable_streaming === "boolean" ? data.enable_streaming : fallback.enable_streaming,
    };
  } catch (_e) {
    return fallback;
  }
}

// Helper to call Gemini with model fallback. Returns either streamed Response
// or the raw upstream response on success, or a structured error.
export type GeminiCallResult =
  | { ok: true; response: Response; model: string }
  | { ok: false; status: number; lastError?: string };

export async function callGeminiWithFallback(opts: {
  apiKey: string;
  models: string[];
  body: Record<string, unknown>;
  fallbackDelayMs?: number;
  timeoutMs?: number;
}): Promise<GeminiCallResult> {
  let lastStatus = 0;
  let lastError = "";
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 45_000;
  for (let i = 0; i < opts.models.length; i++) {
    const model = opts.models[i];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
    try {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ...opts.body, model }),
      });
      clearTimeout(timeoutId);
      if (resp.ok) return { ok: true, response: resp, model };
      lastStatus = resp.status;
      lastError = await resp.text().catch(() => "");
      console.error("Gemini error:", model, resp.status, lastError.slice(0, 300));
      // Fatal auth/credit errors — don't retry other models
      if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
        return { ok: false, status: 402, lastError };
      }
      // 429 / 5xx → try next model after optional delay
      if (i < opts.models.length - 1 && opts.fallbackDelayMs && opts.fallbackDelayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.fallbackDelayMs));
      }
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e instanceof Error ? e.message : String(e);
      if (String(lastError).toLowerCase().includes("abort") || String(lastError).toLowerCase().includes("timeout")) {
        lastError = `timeout after ${timeoutMs}ms`;
      }
      console.error("Gemini fetch error:", model, lastError);
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
  }), {
    status: 200,
    headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponseFromStatus(status: number, corsHeaders: Record<string, string>): Response {
  if (status === 402) {
    return new Response(JSON.stringify({ error: "تعذّر الاتصال بالذكاء الاصطناعي. تحقّق من مفتاح GEMINI_API_KEY." }), {
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
