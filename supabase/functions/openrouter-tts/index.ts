// Text-to-Speech via OpenRouter's OpenAI-compatible /audio/speech endpoint.
// Uses google/gemini-3.1-flash-tts-preview by default. Streams raw audio
// bytes back to the client — no JSON wrapper — so the browser can pipe the
// response directly into an <audio> element or a MediaSource.
//
// Auth: requires a valid Supabase JWT. Callable by any authenticated user
// (students, teachers, admins). Rate-limited implicitly by OpenRouter.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";
import { getActiveAiApiKey } from "../_shared/aiProvider.ts";
import {
  MODREK_TTS_SETTINGS,
  estimatePcmDurationSeconds,
  openRouterTts,
  pcmToWav,
  OPENROUTER_DEFAULT_TTS_MODEL,
  OPENROUTER_DEFAULT_TTS_VOICE,
  OPENROUTER_TTS_QUALITY,
  preprocessSpeechForTeacher,
} from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Provider, X-Model, X-Voice, X-Cache, X-Audio-Url, X-Audio-Duration, X-Audio-Quality, X-Debug-Id, X-OpenRouter-Status",
};

const MAX_INPUT_LENGTH = 4000; // OpenRouter/Gemini TTS input cap safety margin
const ALLOWED_FORMATS = new Set(["mp3", "opus", "aac", "flac", "wav", "pcm"]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUNNY_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
const BUNNY_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
const BUNNY_HOST = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
const BUNNY_CDN = Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME") || "";

function safeJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function jsonError(status: number, message: string, detail?: unknown, debugId?: string) {
  return new Response(JSON.stringify({ error: message, detail, debug_id: debugId }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(debugId ? { "X-Debug-Id": debugId } : {}) },
  });
}

async function parseRequestBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return await req.json().catch(() => ({} as Record<string, unknown>));
  }
  const raw = await req.text().catch(() => "");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { text: raw };
  }
}

function normalizeArabic(text: string): string {
  return String(text || "")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadToBunny(pathInZone: string, bytes: Uint8Array, contentType: string): Promise<string> {
  if (!BUNNY_KEY || !BUNNY_ZONE || !BUNNY_CDN) throw new Error("Bunny storage not configured");
  const res = await fetch(`https://${BUNNY_HOST}/${BUNNY_ZONE}/${pathInZone}`, {
    method: "PUT",
    headers: { AccessKey: BUNNY_KEY, "Content-Type": contentType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Bunny upload failed ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return `https://${BUNNY_CDN}/${pathInZone}`;
}

async function fetchBunnyObject(pathInZone: string): Promise<Response | null> {
  if (!BUNNY_KEY || !BUNNY_ZONE || !pathInZone) return null;
  const res = await fetch(`https://${BUNNY_HOST}/${BUNNY_ZONE}/${pathInZone}`, {
    headers: { AccessKey: BUNNY_KEY },
  }).catch(() => null);
  return res?.ok ? res : null;
}

async function synthesizeTeacherWav(opts: {
  apiKey: string;
  model: string;
  input: string;
  voice: string;
  instructions: string;
  speed?: number;
}): Promise<{ wav: Uint8Array; pcmBytes: number; duration: number }> {
  let lastError = "";
  let lastDebug: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const tts = await openRouterTts({
      apiKey: opts.apiKey,
      model: opts.model,
      input: opts.input,
      voice: opts.voice,
      format: "pcm",
      instructions: attempt === 1 ? opts.instructions : `${opts.instructions} أعد الإلقاء بشكل أوضح وأبطأ قليلاً مع مخارج حروف كاملة ووقفات طبيعية.`.trim(),
      speed: opts.speed,
      timeoutMs: 120_000,
    });
    if (!tts.ok) {
      lastError = String((tts as any).lastError || "");
      lastDebug = (tts as any).debug;
      if ((tts as any).status === 401 || (tts as any).status === 402 || (tts as any).status === 403 || (tts as any).status === 429) {
        throw new Error(JSON.stringify({ status: (tts as any).status, error: lastError, debug: lastDebug }));
      }
      continue;
    }
    const pcm = new Uint8Array(await tts.response.arrayBuffer());
    const duration = estimatePcmDurationSeconds(pcm.byteLength);
    const minDuration = Math.min(2.2, Math.max(0.45, opts.input.length / 85));
    if (pcm.byteLength >= 9000 && duration >= minDuration) {
      return { wav: pcmToWav(pcm, { sampleRate: 24000, channels: 1, bitsPerSample: 16 }), pcmBytes: pcm.byteLength, duration };
    }
    lastError = `audio_quality_too_short:${duration}s/${pcm.byteLength}b`;
    lastDebug = (tts as any).debug;
  }
  throw new Error(JSON.stringify({ status: 502, error: lastError || "audio_quality_failed", debug: lastDebug }));
}

serve(async (req) => {
  const debugId = crypto.randomUUID();
  const startedAt = performance.now();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed", { method: req.method }, debugId);
  }

  console.info("[openrouter-tts][edge-request]", safeJson({
    debugId,
    method: req.method,
    url: req.url,
    headers: {
      authorization: req.headers.get("Authorization") ? "Bearer [REDACTED_JWT]" : null,
      apikey: req.headers.get("apikey") ? "[REDACTED_PUBLISHABLE_KEY]" : null,
      contentType: req.headers.get("Content-Type"),
      xClientInfo: req.headers.get("x-client-info"),
    },
  }));

  // Input validation
  const body = await parseRequestBody(req);
  const bodyAccessToken = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  const authHeader = req.headers.get("Authorization") || (bodyAccessToken ? `Bearer ${bodyAccessToken}` : null);
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(401, "غير مصرح", { auth_header_present: Boolean(req.headers.get("Authorization")), body_token_present: Boolean(bodyAccessToken) }, debugId);
  }
  const claims = await getJwtClaimsFromAuthHeader(authHeader);
  if (!claims?.sub) return jsonError(401, "جلسة غير صالحة", { token_decoded: false }, debugId);

  console.info("[openrouter-tts][edge-body]", safeJson({
    debugId,
    keys: Object.keys(body || {}),
    textLength: typeof body?.text === "string" ? body.text.length : 0,
    voice: body?.voice,
    format: body?.format,
    speed: body?.speed,
    subject_id: body?.subject_id,
    stage: body?.stage,
    grade: body?.grade,
    section: body?.section,
    lesson: body?.lesson,
  }));
  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  const text = preprocessSpeechForTeacher(rawText);
  if (!text) return jsonError(400, "النص مطلوب", { raw_text_length: rawText.length }, debugId);
  if (text.length > MAX_INPUT_LENGTH) {
    return jsonError(400, `النص طويل جداً. الحد الأقصى ${MAX_INPUT_LENGTH} حرف.`, { text_length: text.length }, debugId);
  }

  const voice = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : OPENROUTER_DEFAULT_TTS_VOICE;
  const rawFormat = typeof body?.format === "string" ? body.format.toLowerCase().trim() : "mp3";
  const format = (ALLOWED_FORMATS.has(rawFormat) ? rawFormat : "mp3") as
    | "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  // هوية الصوت الموحّدة تُطبَّق داخل `openRouterTts` نفسها، فنمرر هنا تلميحًا
  // إضافيًا فقط (إن وُجد) بدون أي أسلوب بديل يغيّر شخصية المعلم.
  const instructions = typeof body?.instructions === "string" && body.instructions.trim()
    ? body.instructions.slice(0, 300)
    : "";
  const speed = typeof body?.speed === "number" ? Math.max(0.8, Math.min(1.1, body.speed)) : MODREK_TTS_SETTINGS.speed;

  const model = typeof body?.model === "string" && body.model.trim()
    ? body.model.trim()
    : OPENROUTER_DEFAULT_TTS_MODEL;
  const subjectId = typeof body?.subject_id === "string" ? body.subject_id : null;
  const stage = typeof body?.stage === "string" ? body.stage : null;
  const grade = typeof body?.grade === "string" ? body.grade : null;
  const section = typeof body?.section === "string" ? body.section : null;
  const lessonHint = typeof body?.lesson === "string" ? body.lesson.slice(0, 200) : null;
  const normalized = normalizeArabic(text);
  const questionHash = await sha256Hex(`tts_narration|${model}|${voice}|${speed}|${subjectId ?? ""}|${grade ?? ""}|${lessonHint ?? ""}|${normalized}`);

  // Key from the unified AI Provider Layer (active provider only).
  const apiKey = await getActiveAiApiKey();
  if (!apiKey) {
    return jsonError(503, "خدمة الصوت غير مُعدّة. مفتاح المزود النشط غير موجود.", { AI_PROVIDER_KEY: false }, debugId);
  }

  const supabase = SUPABASE_URL && SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    : null;

  if (supabase) {
    const { data: cached } = await supabase
      .from("voice_answers")
      .select("id, audio_url, audio_storage_path, model, voice, audio_duration_seconds, audio_quality")
      .eq("question_hash", questionHash)
      .maybeSingle();
    if (cached?.audio_url) {
      console.info("[openrouter-tts][cache-candidate]", safeJson({ debugId, id: cached.id, hasStoragePath: Boolean(cached.audio_storage_path), audioUrl: cached.audio_url }));
      const cachedAudio = cached.audio_storage_path
        ? await fetchBunnyObject(cached.audio_storage_path)
        : await fetch(cached.audio_url).catch(() => null);
      if (cachedAudio?.ok && cachedAudio.body) {
        try { await supabase.rpc("increment_voice_usage", { p_id: cached.id }); } catch { /* ignore */ }
        return new Response(cachedAudio.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
            "X-Provider": "openrouter",
            "X-Model": cached.model || model,
            "X-Voice": cached.voice || voice,
            "X-Cache": "hit",
            "X-Audio-Url": cached.audio_url,
            "X-Audio-Duration": String(cached.audio_duration_seconds ?? ""),
            "X-Audio-Quality": String(cached.audio_quality || OPENROUTER_TTS_QUALITY),
            "X-Debug-Id": debugId,
            "X-OpenRouter-Status": "cache-hit",
          },
        });
      }
      console.warn("[openrouter-tts][cache-fetch-miss]", safeJson({ debugId, status: cachedAudio?.status ?? null, hasBody: Boolean(cachedAudio?.body) }));
    }
  }

  let wav: Uint8Array;
  let pcmBytes = 0;
  let duration = 0;
  try {
    const generated = await synthesizeTeacherWav({ apiKey, model, input: text, voice, instructions, speed });
    wav = generated.wav;
    pcmBytes = generated.pcmBytes;
    duration = generated.duration;
  } catch (error) {
    const msg = String((error as Error)?.message || error);
    console.error("[openrouter-tts] error", safeJson({ debugId, error: msg, stack: (error as Error)?.stack }));
    let parsed: any = null;
    try { parsed = JSON.parse(msg); } catch { parsed = { error: msg }; }
    if (msg.includes('"status":401') || msg.includes('"status":403')) return jsonError(502, "مفتاح OpenRouter غير صالح للصوت.", parsed, debugId);
    if (msg.includes('"status":402')) return jsonError(402, "رصيد OpenRouter غير كافٍ لتشغيل الصوت.", parsed, debugId);
    if (msg.includes('"status":429')) return jsonError(429, "تم تجاوز الحد. حاول بعد قليل.", parsed, debugId);
    return jsonError(502, "تعذر توليد صوت بجودة مناسبة الآن. حاول مرة أخرى.", parsed, debugId);
  }

  let audioUrl = "";
  let objectPath = "";
  try {
    objectPath = `voice-cache/tts/${subjectId ?? "general"}/${grade ?? "any"}/${questionHash}.wav`;
    audioUrl = await uploadToBunny(objectPath, wav, "audio/wav");
    console.info("[openrouter-tts][bunny-save-ok]", safeJson({ debugId, objectPath, audioUrl, bytes: wav.byteLength }));
  } catch (error) {
    console.error("[openrouter-tts] Bunny save error", safeJson({ debugId, error: String(error), stack: (error as Error)?.stack }));
  }

  if (supabase && audioUrl) {
    try {
      const voiceAnswerRow = {
        question: rawText,
        question_normalized: normalized,
        question_hash: questionHash,
        answer_text: text,
        speech_text: text,
        audio_url: audioUrl,
        audio_bytes: wav.byteLength,
        audio_duration_seconds: duration,
        audio_quality: OPENROUTER_TTS_QUALITY,
        audio_storage_path: objectPath,
        voice,
        model,
        voice_settings: { speed, format, requested_format: format, instructions, provider: "openrouter", pcm_bytes: pcmBytes },
        record_type: "tts_narration",
        subject_id: subjectId,
        stage,
        grade,
        section,
        lesson_hint: lessonHint,
        source: "tts",
        created_by: null,
      };
      const { error } = await supabase.from("voice_answers").insert(voiceAnswerRow);
      if (error) console.error("[openrouter-tts] cache insert error", safeJson({ debugId, error: error.message || error }));
    } catch (error) {
      console.error("[openrouter-tts] cache insert error", safeJson({ debugId, error: String(error), stack: (error as Error)?.stack }));
    }
  }

  console.info("[openrouter-tts][edge-success]", safeJson({
    debugId,
    durationMs: Math.round(performance.now() - startedAt),
    bytes: wav.byteLength,
    pcmBytes,
    audioDurationSeconds: duration,
    cache: "miss",
    saved: Boolean(audioUrl),
  }));

  return new Response(wav, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Provider": "openrouter",
        "X-Model": model,
        "X-Voice": voice,
        "X-Cache": "miss",
        "X-Audio-Url": audioUrl,
        "X-Audio-Duration": String(duration),
        "X-Audio-Quality": OPENROUTER_TTS_QUALITY,
        "X-Debug-Id": debugId,
        "X-OpenRouter-Status": "generated",
      },
    });
});
