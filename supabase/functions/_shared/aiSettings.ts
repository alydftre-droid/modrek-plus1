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

const DEFAULTS: Record<string, AiFunctionSettings> = {
  "ai-chat": {
    function_name: "ai-chat",
    models_to_try: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: true,
  },
  "support-assistant": {
    function_name: "support-assistant",
    models_to_try: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: true,
  },
  "teacher-assistant": {
    function_name: "teacher-assistant",
    models_to_try: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: true,
  },
  "generate-exam": {
    function_name: "generate-exam",
    models_to_try: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: false,
  },
  "grade-essay": {
    function_name: "grade-essay",
    models_to_try: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    max_retries: 3,
    fallback_delay_ms: 0,
    enable_streaming: false,
  },
};

const GLOBAL_MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

export async function resolveGeminiApiKey(
  // deno-lint-ignore no-explicit-any
  sb: any,
  envKey: string,
): Promise<{ apiKey: string; source: "vault" | "env" | "missing" }> {
  try {
    const { data, error } = await sb.rpc("get_edge_secret", { p_name: "GEMINI_API_KEY" });
    const vaultKey = typeof data === "string" ? data.trim() : "";
    if (!error && vaultKey) return { apiKey: vaultKey, source: "vault" };
  } catch (_e) {
    // The RPC exists only on production after the hardening migration. Older
    // preview projects continue using the Edge Function environment secret.
  }

  const normalizedEnvKey = String(envKey || "").trim();
  if (normalizedEnvKey) return { apiKey: normalizedEnvKey, source: "env" };
  return { apiKey: "", source: "missing" };
}

function uniqueModels(models: string[]) {
  const seen = new Set<string>();
  return models
    .map((model) => String(model || "").trim())
    .filter((model) => model && !seen.has(model) && seen.add(model));
}

function withGlobalGeminiFallbacks(models: string[]) {
  const normalized = uniqueModels(models);
  const hasGeminiModel = normalized.some((model) => model.startsWith("gemini-"));
  return hasGeminiModel ? uniqueModels([...normalized, ...GLOBAL_MODEL_FALLBACKS]) : normalized;
}

export async function loadAiSettings(
  // deno-lint-ignore no-explicit-any
  sb: any,
  fnName: string,
): Promise<AiFunctionSettings> {
  const fallback = DEFAULTS[fnName] ?? {
    function_name: fnName,
    models_to_try: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
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
      models_to_try: Array.isArray(data.models_to_try) && data.models_to_try.length > 0
        ? withGlobalGeminiFallbacks(data.models_to_try)
        : withGlobalGeminiFallbacks(fallback.models_to_try),
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
  | { ok: true; response: Response; model: string; provider: "gemini" }
  | { ok: false; status: number; lastError?: string };

function summarizeUpstreamError(input?: string) {
  const text = String(input || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    const error = parsed?.error;
    if (error?.message) return String(error.message);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // keep raw text when upstream did not return JSON
  }
  return text;
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) return null;
  return {
    mimeType: match[1] || "application/octet-stream",
    data: match[2] ? match[3] : btoa(decodeURIComponent(match[3] || "")),
  };
}

function normalizeTextFromOpenAiContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") return p.text;
      if (typeof p.content === "string") return p.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function openAiContentToGeminiParts(content: unknown) {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content ?? "") }];

  const parts: Record<string, unknown>[] = [];
  for (const rawPart of content) {
    if (typeof rawPart === "string") {
      parts.push({ text: rawPart });
      continue;
    }
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as Record<string, any>;
    if (typeof part.text === "string") {
      parts.push({ text: part.text });
      continue;
    }
    const imageUrl = part.image_url?.url;
    if (typeof imageUrl === "string") {
      const parsed = parseDataUrl(imageUrl);
      if (parsed) parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
      else parts.push({ text: `[image: ${imageUrl}]` });
      continue;
    }
    const fileData = part.file?.file_data;
    if (typeof fileData === "string") {
      const parsed = parseDataUrl(fileData);
      if (parsed) parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
      else parts.push({ text: `[file: ${part.file?.filename || "attachment"}]` });
    }
  }
  return parts.length ? parts : [{ text: "" }];
}

function buildGeminiNativeBody(openAiBody: Record<string, unknown>) {
  const messages = Array.isArray(openAiBody.messages) ? openAiBody.messages as Record<string, unknown>[] : [];
  const systemParts: string[] = [];
  const contents: Record<string, unknown>[] = [];

  const tools = Array.isArray(openAiBody.tools) ? openAiBody.tools as Record<string, any>[] : [];
  const selectedTool = tools.find((tool) => tool?.type === "function" && tool?.function?.name);
  if (selectedTool?.function?.name) {
    systemParts.push(
      `If structured output is needed, return ONLY a valid JSON object matching the function "${selectedTool.function.name}". Do not wrap it in markdown. Schema: ${JSON.stringify(selectedTool.function.parameters || {})}`,
    );
  }

  for (const message of messages) {
    const role = String(message?.role || "user");
    if (role === "system") {
      const text = normalizeTextFromOpenAiContent(message.content).trim();
      if (text) systemParts.push(text);
      continue;
    }
    contents.push({
      role: role === "assistant" ? "model" : "user",
      parts: openAiContentToGeminiParts(message.content),
    });
  }

  const generationConfig: Record<string, unknown> = {};
  if (typeof openAiBody.temperature === "number") generationConfig.temperature = openAiBody.temperature;
  if (typeof openAiBody.max_tokens === "number") generationConfig.maxOutputTokens = openAiBody.max_tokens;
  if (typeof openAiBody.max_completion_tokens === "number") generationConfig.maxOutputTokens = openAiBody.max_completion_tokens;

  return {
    contents: contents.length ? contents : [{ role: "user", parts: [{ text: "" }] }],
    ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

function textFromGeminiNativePayload(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (part?.functionCall?.args) return JSON.stringify(part.functionCall.args);
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function openAiCompatibleJsonResponse(content: string, modelName: string, stream: boolean) {
  if (stream) {
    const chunk = JSON.stringify({ choices: [{ delta: { content } }] });
    return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

  const tryEndpoint = async (
    url: string,
    apiKey: string,
    modelName: string,
  ): Promise<{ ok: true; response: Response } | { ok: false; status: number; lastError: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      const resp = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ ...opts.body, model: modelName }),
      });
      clearTimeout(timeoutId);
      if (resp.ok) return { ok: true, response: resp };
      const text = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, lastError: text };
    } catch (e) {
      clearTimeout(timeoutId);
      let msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) {
        msg = `timeout after ${timeoutMs}ms`;
      }
      return { ok: false, status: 0, lastError: msg };
    }
  };

  const tryNativeEndpoint = async (
    apiKey: string,
    modelName: string,
  ): Promise<{ ok: true; response: Response } | { ok: false; status: number; lastError: string }> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify(buildGeminiNativeBody(opts.body)),
        },
      );
      clearTimeout(timeoutId);
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        return { ok: false, status: resp.status, lastError: text };
      }
      const payload = await resp.json().catch(() => null);
      const content = sanitizeForbiddenPlatformNames(textFromGeminiNativePayload(payload));
      if (!content) return { ok: false, status: 502, lastError: "EMPTY_NATIVE_GEMINI_RESPONSE" };
      return { ok: true, response: openAiCompatibleJsonResponse(content, modelName, opts.body?.stream === true) };
    } catch (e) {
      clearTimeout(timeoutId);
      let msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) {
        msg = `timeout after ${timeoutMs}ms`;
      }
      return { ok: false, status: 0, lastError: msg };
    }
  };

  if (!opts.apiKey) {
    return { ok: false, status: 401, lastError: "GEMINI_API_KEY_MISSING" };
  }

  // Direct Gemini OpenAI-compatible endpoint only. Production must not depend
  // on Lovable AI Gateway, so a missing/invalid Gemini key fails explicitly.
  const models = withGlobalGeminiFallbacks(opts.models).filter((model) => model !== "gemini-flash-latest");
  for (let i = 0; opts.apiKey && i < models.length; i++) {
    const model = models[i];
    const openAiResult = await tryEndpoint(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      opts.apiKey,
      model,
    );
    if (openAiResult.ok) {
      console.log("AI provider success", JSON.stringify({ provider: "gemini", endpoint: "openai-compatible", model }));
      return { ok: true, response: openAiResult.response, model, provider: "gemini" };
    }

    lastStatus = openAiResult.status;
    lastError = openAiResult.lastError;
    console.error("Gemini OpenAI-compatible error", JSON.stringify({ model, status: openAiResult.status, error: summarizeUpstreamError(openAiResult.lastError).slice(0, 500) }));

    // Always try the native Gemini endpoint as a fallback. Some API keys
    // (e.g. AI Studio keys provisioned outside the OpenAI-compat allowlist)
    // return 401/403 on the OpenAI-compatible path but work on native.
    {
      const nativeResult = await tryNativeEndpoint(opts.apiKey, model);
      if (nativeResult.ok) {
        console.log("AI provider success", JSON.stringify({ provider: "gemini", endpoint: "native", model }));
        return { ok: true, response: nativeResult.response, model, provider: "gemini" };
      }

      lastStatus = nativeResult.status || openAiResult.status;
      lastError = nativeResult.lastError || openAiResult.lastError;
      console.error("Gemini native error", JSON.stringify({ model, status: nativeResult.status, error: summarizeUpstreamError(nativeResult.lastError).slice(0, 500) }));
    }

    // Stop only when native ALSO returns auth/billing — no point trying more models.
    if (lastStatus === 401 || lastStatus === 403 || lastStatus === 402) {
      break;
    }
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

export function buildAiSuccessPayload(content: string, provider: "gemini", model: string) {
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
