// Shared OpenRouter helpers. Kept intentionally small: existing edge
// functions call `callGeminiWithFallback` in `_shared/aiSettings.ts`; that
// helper now tries OpenRouter first and falls back to Gemini direct on any
// error. Only TTS uses OpenRouter directly (via the `openrouter-tts` edge
// function) since Gemini has no equivalent OpenAI-compatible speech endpoint.

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";
export const OPENROUTER_DEFAULT_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";

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
 * Call OpenRouter TTS. Returns raw audio bytes (streaming Response.body)
 * from `/audio/speech`. Compatible with the OpenAI audio-speech shape.
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
    const body: Record<string, unknown> = {
      model: toOpenRouterModelId(opts.model || OPENROUTER_DEFAULT_TTS_MODEL),
      input: opts.input,
      voice: opts.voice || "alloy",
      response_format: opts.format || "mp3",
    };
    if (opts.instructions) body.instructions = opts.instructions;
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
