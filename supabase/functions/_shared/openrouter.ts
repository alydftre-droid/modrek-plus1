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
    const resp = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: buildOpenRouterHeaders(opts.apiKey),
      signal: controller.signal,
      body: JSON.stringify({ ...opts.body, model: toOpenRouterModelId(opts.model) }),
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
}): Promise<{ ok: true; response: Response } | { ok: false; status: number; lastError: string }> {
  const timeoutMs = typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  try {
    const model = toOpenRouterModelId(opts.model || OPENROUTER_DEFAULT_TTS_MODEL);
    const requested = opts.format || "pcm";
    const format = model.toLowerCase().includes("gemini") ? "pcm" : requested;
    const body: Record<string, unknown> = {
      model,
      input: opts.input,
      voice: opts.voice || OPENROUTER_DEFAULT_TTS_VOICE,
      response_format: format,
      instructions: opts.instructions || EGYPTIAN_TEACHER_TTS_INSTRUCTIONS,
    };
    if (typeof opts.speed === "number") body.speed = opts.speed;

    const resp = await fetch(`${OPENROUTER_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: buildOpenRouterHeaders(opts.apiKey),
      signal: controller.signal,
      body: JSON.stringify(body),
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
