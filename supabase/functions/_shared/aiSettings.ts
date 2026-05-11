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
}): Promise<GeminiCallResult> {
  let lastStatus = 0;
  let lastError = "";
  for (let i = 0; i < opts.models.length; i++) {
    const model = opts.models[i];
    try {
      const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...opts.body, model }),
      });
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
      lastError = e instanceof Error ? e.message : String(e);
      console.error("Gemini fetch error:", model, lastError);
    }
  }
  return { ok: false, status: lastStatus || 502, lastError };
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
