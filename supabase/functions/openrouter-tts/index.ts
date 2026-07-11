// Text-to-Speech via OpenRouter's OpenAI-compatible /audio/speech endpoint.
// Uses google/gemini-3.1-flash-tts-preview by default. Streams raw audio
// bytes back to the client — no JSON wrapper — so the browser can pipe the
// response directly into an <audio> element or a MediaSource.
//
// Auth: requires a valid Supabase JWT. Callable by any authenticated user
// (students, teachers, admins). Rate-limited implicitly by OpenRouter.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";
import {
  getOpenRouterApiKey,
  openRouterTts,
  pcmToWav,
  OPENROUTER_DEFAULT_TTS_MODEL,
} from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_INPUT_LENGTH = 4000; // OpenRouter/Gemini TTS input cap safety margin
const ALLOWED_FORMATS = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonError(401, "غير مصرح");
  const claims = getJwtClaimsFromAuthHeader(authHeader);
  if (!claims?.sub) return jsonError(401, "جلسة غير صالحة");

  // Input validation
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return jsonError(400, "النص مطلوب");
  if (text.length > MAX_INPUT_LENGTH) {
    return jsonError(400, `النص طويل جداً. الحد الأقصى ${MAX_INPUT_LENGTH} حرف.`);
  }

  const voice = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : "alloy";
  const rawFormat = typeof body?.format === "string" ? body.format.toLowerCase().trim() : "mp3";
  const format = (ALLOWED_FORMATS.has(rawFormat) ? rawFormat : "mp3") as
    | "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  const instructions = typeof body?.instructions === "string" ? body.instructions.slice(0, 500) : undefined;
  const speed = typeof body?.speed === "number" ? Math.max(0.25, Math.min(4, body.speed)) : undefined;
  const model = typeof body?.model === "string" && body.model.trim()
    ? body.model.trim()
    : OPENROUTER_DEFAULT_TTS_MODEL;

  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    return jsonError(503, "خدمة الصوت غير مُعدّة. أضف OPENROUTER_API_KEY.");
  }

  const result = await openRouterTts({
    apiKey,
    model,
    input: text,
    voice,
    format,
    instructions,
    speed,
    timeoutMs: 90_000,
  });

  if (!result.ok) {
    console.error("[openrouter-tts] error", JSON.stringify({ status: result.status, error: String(result.lastError).slice(0, 400) }));
    if (result.status === 401 || result.status === 403) return jsonError(502, "مفتاح OpenRouter غير صالح للصوت.");
    if (result.status === 402) return jsonError(402, "رصيد OpenRouter غير كافٍ لتشغيل الصوت.");
    if (result.status === 429) return jsonError(429, "تم تجاوز الحد. حاول بعد قليل.");
    return jsonError(502, "تعذر توليد الصوت الآن. حاول مرة أخرى.");
  }

  // Gemini TTS returns raw PCM (24kHz mono s16le). Wrap it in a WAV header
  // so browsers can play the response as `audio/wav` from an <audio> tag.
  const upstreamCT = result.response.headers.get("Content-Type") || "";
  const isPcm = /pcm/i.test(upstreamCT) || model.toLowerCase().includes("gemini");
  if (isPcm) {
    const pcm = new Uint8Array(await result.response.arrayBuffer());
    const wav = pcmToWav(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 });
    return new Response(wav, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Provider": "openrouter",
        "X-Model": model,
      },
    });
  }
  return new Response(result.response.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": upstreamCT || `audio/${format}`,
      "Cache-Control": "no-store",
      "X-Provider": "openrouter",
      "X-Model": model,
    },
  });
});
