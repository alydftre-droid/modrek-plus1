// Shared OpenRouter helpers. Kept intentionally small: existing edge
// functions call `callGeminiWithFallback` in `_shared/aiSettings.ts`; that
// helper now tries OpenRouter first and falls back to Gemini direct on any
// error. Only TTS uses OpenRouter directly (via the `openrouter-tts` edge
// function) since Gemini has no equivalent OpenAI-compatible speech endpoint.

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";
export const OPENROUTER_DEFAULT_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
export const OPENROUTER_DEFAULT_TTS_VOICE = "Charon";
export const OPENROUTER_TTS_QUALITY = "openrouter-gemini-tts-egyptian-teacher-hd";
const OPENROUTER_SAFE_MAX_OUTPUT_TOKENS = 16_384;
const OPENROUTER_TTS_MODEL_ALLOWLIST = new Set([
  "openai/gpt-4o-mini-tts",
  "google/gemini-2.5-flash-tts",
  "google/gemini-2.5-pro-tts",
  "google/gemini-2.5-flash-lite-preview-tts",
  "google/gemini-3.1-flash-tts-preview",
]);

export const EGYPTIAN_TEACHER_TTS_INSTRUCTIONS = [
  "تحدث بالعربية بلهجة مصرية طبيعية خفيفة ومفهومة، كمعلم مصري محترف يشرح لطالب أمامه.",
  "الصوت رجولي دافئ وواضح، السرعة طبيعية، والوقفات محسوبة بدون رتابة أو تقطيع للكلمات.",
  "ارفع النبرة قليلاً عند التعريفات والنقاط المهمة، واهدأ أثناء الشرح، وأضف حماساً بسيطاً عند الأمثلة.",
  "انطق الفصحى والآيات القرآنية بوضوح واحترام، ولا تغيّر كلمات الآيات أو تشكيلها.",
  "انطق المصطلحات العلمية والإنجليزية داخل الشرح بنطق عربي مصري مفهوم دون تهجئة عشوائية.",
].join(" ");

const OPENROUTER_REFERRER = "https://modrekplus.com";
const OPENROUTER_APP_TITLE = "Modrek Plus";

/**
 * Normalize a bare Gemini model id (e.g. "gemini-2.5-flash") to the
 * OpenRouter form ("google/gemini-2.5-flash"). Already-qualified ids pass
 * through unchanged.
 */
export function toOpenRouterModelId(model: string): string {
  const raw = String(model || "").trim();
  if (!raw) return OPENROUTER_DEFAULT_CHAT_MODEL;
  if (raw.includes("/")) return raw;
  if (raw.startsWith("gemini-")) return `google/${raw}`;
  return raw;
}

export function toOpenRouterTtsModelId(model?: string): string {
  const normalized = toOpenRouterModelId(model || OPENROUTER_DEFAULT_TTS_MODEL);
  if (OPENROUTER_TTS_MODEL_ALLOWLIST.has(normalized)) return normalized;
  console.warn("[openrouter-tts] non_tts_model_replaced", JSON.stringify({ requested: normalized, replacement: OPENROUTER_DEFAULT_TTS_MODEL }));
  return OPENROUTER_DEFAULT_TTS_MODEL;
}

export function getOpenRouterApiKey(): string {
  return String(Deno.env.get("OPENROUTER_API_KEY") || "").trim();
}

export function buildOpenRouterHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": OPENROUTER_REFERRER,
    "X-Title": OPENROUTER_APP_TITLE,
    ...extra,
  };
}

export type OpenRouterDebugInfo = {
  requestUrl: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
  startedAt: string;
  durationMs?: number;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBodyPreview?: string;
  errorMessage?: string;
};

function redactAuthorization(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = key.toLowerCase() === "authorization" ? "Bearer [REDACTED_OPENROUTER_API_KEY]" : value;
  }
  return out;
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
}

function buildGeminiTtsInput(input: string, instructions: string): string {
  const cleanInput = String(input || "").trim();
  const cleanInstructions = String(instructions || EGYPTIAN_TEACHER_TTS_INSTRUCTIONS).trim();
  return [
    cleanInstructions,
    "اقرأ النص التالي فقط بصوت معلم مصري طبيعي. لا تنطق تعليمات الأسلوب، ولا تضف مقدمة أو خاتمة.",
    "النص:",
    cleanInput,
  ].join("\n");
}

const SCIENCE_PRONUNCIATION: Array<[RegExp, string]> = [
  [/\bDNA\b/gi, "دي إن إيه"],
  [/\bHTML\b/gi, "إتش تي إم إل"],
  [/\bCSS\b/gi, "سي إس إس"],
  [/\bJavaScript\b/g, "جافا سكريبت"],
  [/\bAPI\b/gi, "إيه بي آي"],
  [/\bCPU\b/gi, "سي بي يو"],
  [/\bRAM\b/gi, "رام"],
  [/\bHTTPS\b/gi, "إتش تي تي بي إس"],
  [/\bHTTP\b/gi, "إتش تي تي بي"],
  [/\bSupabase\b/g, "سوبا بيس"],
  [/\bBunny\.net\b/gi, "بَني دوت نِت"],
  [/\bGemini\b/g, "جيميناي"],
  [/\bOpenRouter\b/g, "أوبن راوتر"],
  [/\bOpenAI\b/g, "أوبن إيه آي"],
  [/\bLovable\b/g, "لافابِل"],
  [/\bPostgreSQL\b/g, "بوستجرس كيو إل"],
  [/\bReact\b/g, "رياكت"],
  [/\bTypeScript\b/g, "تايب سكريبت"],
  [/\bVite\b/g, "فيت"],
];

const DIGITS_AR = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TENS_AR = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const TEENS_AR = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const HUNDREDS_AR = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

export function numberToArabicWords(value: string): string {
  const raw = String(value || "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(raw)) return value;
  if (raw.includes(".")) {
    const [whole, fraction] = raw.split(".");
    return `${numberToArabicWords(whole)} فاصلة ${fraction.split("").map((d) => DIGITS_AR[Number(d)] ?? d).join(" ")}`;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n > 999999) return raw.split("").map((d) => DIGITS_AR[Number(d)] ?? d).join(" ");
  if (n < 10) return DIGITS_AR[n];
  if (n < 20) return TEENS_AR[n - 10];
  if (n < 100) {
    const ones = n % 10;
    const tens = Math.floor(n / 10);
    return ones ? `${DIGITS_AR[ones]} و${TENS_AR[tens]}` : TENS_AR[tens];
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return rest ? `${HUNDREDS_AR[hundreds]} و${numberToArabicWords(String(rest))}` : HUNDREDS_AR[hundreds];
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandWord = thousands === 1 ? "ألف" : thousands === 2 ? "ألفان" : `${numberToArabicWords(String(thousands))} ألف`;
  return rest ? `${thousandWord} و${numberToArabicWords(String(rest))}` : thousandWord;
}

function operatorToArabic(op: string): string {
  if (op === "+") return "زائد";
  if (op === "-" || op === "−") return "ناقص";
  if (op === "*" || op === "x" || op === "X" || op === "×") return "في";
  if (op === "/" || op === "÷") return "على";
  return op;
}

export function preprocessSpeechForTeacher(input: string): string {
  let text = String(input || "")
    .replace(/[\t ]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[#*_`>~|{}\[\]]/g, " ")
    .replace(/[؛;]+/g, "،")
    .replace(/([،,.!?؟])\s*/g, "$1 ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const [pattern, replacement] of SCIENCE_PRONUNCIATION) {
    text = text.replace(pattern, replacement);
  }

  text = text.replace(/(\d+[\d,]*(?:\.\d+)?)\s*([+\-−*xX×\/÷])\s*(\d+[\d,]*(?:\.\d+)?)\s*=\s*(\d+[\d,]*(?:\.\d+)?)/g,
    (_m, a, op, b, c) => `${numberToArabicWords(a)} ${operatorToArabic(op)} ${numberToArabicWords(b)} يساوي ${numberToArabicWords(c)}`,
  );
  text = text.replace(/(\d+[\d,]*(?:\.\d+)?)\s*([+\-−*xX×\/÷])\s*(\d+[\d,]*(?:\.\d+)?)/g,
    (_m, a, op, b) => `${numberToArabicWords(a)} ${operatorToArabic(op)} ${numberToArabicWords(b)}`,
  );
  text = text.replace(/\b\d+[\d,]*(?:\.\d+)?\b/g, (n) => numberToArabicWords(n));

  text = text
    .replace(/\b(تعالوا|تعالى|خلينا|ركز معايا|خد بالك)\b/gu, "$1...")
    .replace(/\s*\.\s*/g, ".\n")
    .replace(/\s*؟\s*/g, "؟\n")
    .replace(/\s*!\s*/g, "!\n")
    .replace(/\s+،/g, "،")
    .replace(/،\s*/g, "، ")
    .replace(/\.{4,}/g, "...")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const balanced: string[] = [];
  for (const line of lines) {
    if (line.length <= 180) {
      balanced.push(line);
      continue;
    }
    let remaining = line;
    while (remaining.length > 180) {
      const breakAt = Math.max(remaining.lastIndexOf("،", 180), remaining.lastIndexOf(" ", 180));
      const cut = breakAt > 60 ? breakAt + 1 : 180;
      balanced.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) balanced.push(remaining);
  }
  return balanced.join("\n");
}

export function estimatePcmDurationSeconds(bytes: number, sampleRate = 24000, channels = 1, bitsPerSample = 16): number {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  return byteRate > 0 ? Number((bytes / byteRate).toFixed(2)) : 0;
}

/**
 * Call OpenRouter chat completions. Returns the raw Response so callers can
 * pipe SSE streams straight to the client (compatible with the existing
 * `aiStream.ts` client parser).
 */
export async function openRouterChat(opts: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ ok: true; response: Response } | { ok: false; status: number; lastError: string }> {
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  try {
    const body = applySafeOpenRouterTokenBudget(opts.body);
    const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildOpenRouterHeaders(opts.apiKey),
      signal: controller.signal,
      body: JSON.stringify({ ...body, model: toOpenRouterModelId(opts.model) }),
    });
    clearTimeout(timer);
    if (resp.ok) return { ok: true, response: resp };
    const text = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, lastError: text };
  } catch (err) {
    clearTimeout(timer);
    let msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) {
      msg = `timeout after ${timeoutMs}ms`;
    }
    return { ok: false, status: 0, lastError: msg };
  }
}

function applySafeOpenRouterTokenBudget(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  const rawMaxTokens = Number(next.max_tokens ?? next.max_completion_tokens ?? 0);
  const safeMax = Number.isFinite(rawMaxTokens) && rawMaxTokens > 0
    ? Math.min(rawMaxTokens, OPENROUTER_SAFE_MAX_OUTPUT_TOKENS)
    : OPENROUTER_SAFE_MAX_OUTPUT_TOKENS;
  next.max_tokens = safeMax;
  if ("max_completion_tokens" in next) next.max_completion_tokens = safeMax;
  return next;
}

/**
 * Call OpenRouter TTS. Gemini TTS via OpenRouter only supports
 * response_format="pcm" — silently force it for gemini models so callers
 * don't get 400s. Wrap the PCM with `pcmToWav` if you need a playable
 * container.
 */
export async function openRouterTts(opts: {
  apiKey: string;
  model?: string;
  input: string;
  voice?: string;
  format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  instructions?: string;
  speed?: number;
  timeoutMs?: number;
}): Promise<{ ok: true; response: Response; debug: OpenRouterDebugInfo } | { ok: false; status: number; lastError: string; debug: OpenRouterDebugInfo }> {
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  const requestUrl = `${OPENROUTER_BASE_URL}/audio/speech`;
  const started = performance.now();
  try {
    const model = toOpenRouterTtsModelId(opts.model || OPENROUTER_DEFAULT_TTS_MODEL);
    const requested = opts.format || "pcm";
    const isGeminiTts = model.toLowerCase().includes("gemini");
    const format = isGeminiTts ? "pcm" : requested === "pcm" ? "pcm" : "mp3";
    const body: Record<string, unknown> = {
      model,
      input: isGeminiTts
        ? buildGeminiTtsInput(opts.input, opts.instructions || EGYPTIAN_TEACHER_TTS_INSTRUCTIONS)
        : opts.input,
      voice: opts.voice || OPENROUTER_DEFAULT_TTS_VOICE,
      response_format: format,
    };
    // OpenRouter documents `speed` for OpenAI-compatible voices. Gemini TTS ignores
    // or may reject unknown provider fields, so we keep Gemini requests minimal.
    if (!isGeminiTts && typeof opts.speed === "number") body.speed = opts.speed;
    const headers = buildOpenRouterHeaders(opts.apiKey);
    const debug: OpenRouterDebugInfo = {
      requestUrl,
      method: "POST",
      headers: redactAuthorization(headers),
      body: { ...body, input_length: String(body.input || "").length },
      startedAt: new Date().toISOString(),
    };

    console.info("[openrouter-tts][request]", JSON.stringify(debug));

    const resp = await fetch(requestUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timer);
    debug.durationMs = Math.round(performance.now() - started);
    debug.status = resp.status;
    debug.responseHeaders = responseHeadersToObject(resp.headers);
    console.info("[openrouter-tts][response]", JSON.stringify({ ...debug, body: { ...debug.body, input: "[OMITTED_IN_RESPONSE_LOG]" } }));
    if (resp.ok) return { ok: true, response: resp, debug };
    const text = await resp.text().catch(() => "");
    debug.responseBodyPreview = text.slice(0, 2000);
    console.error("[openrouter-tts][response-error]", JSON.stringify(debug));
    return { ok: false, status: resp.status, lastError: text, debug };
  } catch (err) {
    clearTimeout(timer);
    let msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) {
      msg = `timeout after ${timeoutMs}ms`;
    }
    const debug: OpenRouterDebugInfo = {
      requestUrl,
      method: "POST",
      headers: { Authorization: "Bearer [REDACTED_OPENROUTER_API_KEY]", "Content-Type": "application/json" },
      body: { model: opts.model || OPENROUTER_DEFAULT_TTS_MODEL, voice: opts.voice || OPENROUTER_DEFAULT_TTS_VOICE, response_format: opts.format || "pcm", input_length: opts.input.length },
      startedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      status: 0,
      errorMessage: msg,
    };
    console.error("[openrouter-tts][fetch-error]", JSON.stringify(debug));
    return { ok: false, status: 0, lastError: msg, debug };
  }
}

/**
 * Wrap raw PCM bytes (signed 16-bit little-endian mono) in a minimal WAV
 * (RIFF) header so browsers can play the result as `audio/wav`.
 * Defaults match Gemini TTS output: 24000 Hz, 16-bit, mono.
 */
export function pcmToWav(pcm: Uint8Array, opts: { sampleRate?: number; channels?: number; bitsPerSample?: number } = {}): Uint8Array {
  const sampleRate = opts.sampleRate ?? 24000;
  const channels = opts.channels ?? 1;
  const bitsPerSample = opts.bitsPerSample ?? 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const out = new Uint8Array(buffer);
  out.set(pcm, 44);
  return out;
}

// ============================================================================
// OpenRouter Embeddings
// ============================================================================
export const OPENROUTER_DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims

/**
 * Batch-embed strings via OpenRouter (OpenAI-compatible /embeddings).
 * Returns arrays of vectors aligned to `inputs` order.
 */
export async function openRouterEmbed(opts: {
  apiKey: string;
  model?: string;
  inputs: string[];
  timeoutMs?: number;
}): Promise<{ ok: true; vectors: number[][]; model: string } | { ok: false; status: number; lastError: string }> {
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  const model = String(opts.model || OPENROUTER_DEFAULT_EMBED_MODEL).trim() || OPENROUTER_DEFAULT_EMBED_MODEL;
  try {
    const resp = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: "POST",
      headers: buildOpenRouterHeaders(opts.apiKey),
      signal: controller.signal,
      body: JSON.stringify({ model, input: opts.inputs }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, lastError: text };
    }
    const json = await resp.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    const vectors = rows
      .slice()
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((r: any) => Array.isArray(r?.embedding) ? r.embedding as number[] : []);
    if (vectors.length !== opts.inputs.length) {
      return { ok: false, status: 502, lastError: `embedding_count_mismatch:${vectors.length}/${opts.inputs.length}` };
    }
    return { ok: true, vectors, model };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, lastError: msg };
  }
}

/** Vision — build an image+text chat body for OpenRouter multimodal chat. */
export function buildVisionMessages(imageUrl: string, prompt: string, systemPrompt?: string) {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageUrl } },
    ],
  });
  return messages;
}
