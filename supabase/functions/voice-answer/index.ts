// Voice Answer — library-first Q&A with cached TTS.
import { sanitizeAiRequestBody } from '../_shared/promptGuard.ts';
//
// Flow:
//  1. Authenticate the caller (any signed-in user).
//  2. Normalize the question and search public.voice_answers for an existing
//     entry scoped by (subject_id, grade, lesson_hint). Exact hash first,
//     then pg_trgm similarity ≥ 0.85. Cache hit -> return the stored audio
//     URL immediately (no OpenRouter call, no Bunny upload).
//  3. Cache miss -> ask the AI (OpenRouter, via callGeminiWithFallback) for
//     a concise Arabic answer using library context when available.
//  4. Synthesize speech via OpenRouter TTS (Gemini) as PCM, wrap in WAV.
//  5. Upload the WAV to the Bunny storage zone under `voice-cache/…` and
//     persist a row in public.voice_answers with metadata for reuse.
//  6. Return { answer_text, audio_url, cached, source, provider, model }.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";
import { enforceAiQuota, aiQuotaResponse } from "../_shared/aiQuota.ts";
import {
  EGYPTIAN_TEACHER_TTS_INSTRUCTIONS,
  estimatePcmDurationSeconds,
  openRouterChat,
  openRouterTts,
  pcmToWav,
  OPENROUTER_DEFAULT_CHAT_MODEL,
  OPENROUTER_DEFAULT_TTS_MODEL,
  OPENROUTER_DEFAULT_TTS_VOICE,
  MODREK_TTS_SETTINGS,
  OPENROUTER_TTS_QUALITY,
  preprocessSpeechForTeacher,
} from "../_shared/openrouter.ts";
import { getActiveAiApiKey } from "../_shared/aiProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUNNY_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
const BUNNY_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
const BUNNY_HOST = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
const BUNNY_CDN  = Deno.env.get("BUNNY_STORAGE_CDN_HOSTNAME") || "";

const MAX_INPUT = 2000;
const MAX_ANSWER_CHARS = 1600; // keep TTS latency reasonable
const SIMILARITY_THRESHOLD = 0.85;

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Arabic-friendly normalization: strip tashkeel/tatweel, unify alef forms,
// collapse whitespace, lowercase for latin bits.
function normalizeArabic(text: string): string {
  return String(text || "")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")   // diacritics + tatweel
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
  if (!BUNNY_KEY || !BUNNY_ZONE || !BUNNY_CDN) {
    throw new Error("Bunny storage not configured");
  }
  const res = await fetch(`https://${BUNNY_HOST}/${BUNNY_ZONE}/${pathInZone}`, {
    method: "PUT",
    headers: {
      AccessKey: BUNNY_KEY,
      "Content-Type": contentType,
    },
    body: bytes,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Bunny upload failed ${res.status}: ${t.slice(0, 200)}`);
  }
  return `https://${BUNNY_CDN}/${pathInZone}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Method not allowed");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonError(401, "غير مصرح");
  const claims = await getJwtClaimsFromAuthHeader(authHeader);
  if (!claims?.sub) return jsonError(401, "جلسة غير صالحة");

  // Cost protection: voice answers are the most expensive AI path.
  const voiceQuota = await enforceAiQuota(claims.sub, "voice-answer");
  if (!voiceQuota.allowed) return jsonError(429, voiceQuota.message || "تم تجاوز حد الاستخدام");

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  try { sanitizeAiRequestBody(body); } catch (_e) { /* noop */ }
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return jsonError(400, "السؤال مطلوب");
  if (question.length > MAX_INPUT) return jsonError(400, `السؤال طويل جداً. الحد الأقصى ${MAX_INPUT} حرف.`);

  const subjectId  = typeof body?.subject_id === "string" ? body.subject_id : null;
  const subjectName = typeof body?.subject_name === "string" ? body.subject_name : null;
  const stage      = typeof body?.stage === "string" ? body.stage : null;
  const grade      = typeof body?.grade === "string" ? body.grade : null;
  const section    = typeof body?.section === "string" ? body.section : null;
  const lessonHint = typeof body?.lesson === "string" ? body.lesson.slice(0, 200) : null;
  const voice      = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : OPENROUTER_DEFAULT_TTS_VOICE;
  const forceRegen = Boolean(body?.force_regen);

  const normalized = normalizeArabic(question);
  const questionHash = await sha256Hex(`${subjectId ?? ""}|${grade ?? ""}|${lessonHint ?? ""}|${normalized}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1. Exact hash lookup
  if (!forceRegen) {
    const { data: exact } = await supabase
      .from("voice_answers")
      .select("id, answer_text, speech_text, audio_url, voice, model, source, citations, audio_duration_seconds, audio_quality")
      .eq("question_hash", questionHash)
      .maybeSingle();
    if (exact?.audio_url) {
      try { await supabase.rpc("increment_voice_usage", { p_id: exact.id }); } catch { /* ignore */ }
      return jsonOk({
        cached: true,
        match: "exact",
        answer_text: exact.answer_text,
        speech_text: exact.speech_text ?? exact.answer_text,
        audio_url: exact.audio_url,
        source: exact.source,
        voice: exact.voice,
        model: exact.model,
        audio_duration_seconds: exact.audio_duration_seconds ?? null,
        audio_quality: exact.audio_quality ?? null,
        citations: exact.citations ?? null,
      });
    }

    // 2. Fuzzy trigram similarity within same scope
    let fuzzy: any = null;
    try {
      const fuzzyResult = await supabase.rpc("voice_answers_find_similar", {
        p_normalized: normalized,
        p_subject_id: subjectId,
        p_grade: grade,
        p_threshold: SIMILARITY_THRESHOLD,
      });
      fuzzy = fuzzyResult.data;
    } catch {
      fuzzy = null;
    }
    const hit = Array.isArray(fuzzy) && fuzzy.length > 0 ? fuzzy[0] : null;
    if (hit?.audio_url) {
      await supabase.from("voice_answers").update({ last_used_at: new Date().toISOString() }).eq("id", hit.id);
      try { await supabase.rpc("increment_voice_usage", { p_id: hit.id }); } catch { /* ignore */ }
      return jsonOk({
        cached: true,
        match: "similar",
        similarity: hit.similarity,
        answer_text: hit.answer_text,
        speech_text: hit.speech_text ?? hit.answer_text,
        audio_url: hit.audio_url,
        source: hit.source,
        voice: hit.voice,
        model: hit.model,
        audio_duration_seconds: hit.audio_duration_seconds ?? null,
        audio_quality: hit.audio_quality ?? null,
        citations: hit.citations ?? null,
      });
    }
  }

  // 3. Library-first retrieval (best-effort — non-fatal if missing).
  let libraryContext = "";
  let citations: unknown = null;
  let source: "library" | "general" = "general";
  try {
    const retRes = await fetch(`${SUPABASE_URL}/functions/v1/modrek-retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({
        query: question,
        filters: subjectId ? { subject_id: subjectId } : {},
        max_results: 5,
        user_id: claims.sub,
      }),
    });
    if (retRes.ok) {
      const j = await retRes.json().catch(() => ({} as any));
      const chunks: any[] = Array.isArray(j?.results) ? j.results : Array.isArray(j?.context) ? j.context : [];
      if (chunks.length > 0) {
        source = "library";
        citations = chunks.slice(0, 5).map((c) => ({
          book: c?.book_title ?? c?.source_title ?? c?.title ?? null,
          page: c?.page ?? c?.page_number ?? null,
          score: c?.score ?? null,
        }));
        libraryContext = chunks
          .map((c, i) => `【${i + 1}】${c?.book_title ? `الكتاب: ${c.book_title} — ` : ""}${c?.page ? `صفحة ${c.page} — ` : ""}${(c?.text ?? c?.content ?? "").toString().slice(0, 1200)}`)
          .join("\n\n");
      }
    }
  } catch (_e) {
    // ignore — proceed with general knowledge
  }

  // 4. Ask the model for a concise Arabic answer.
  const scopeLine = [
    subjectName ? `المادة: ${subjectName}` : null,
    stage ? `المرحلة: ${stage}` : null,
    grade ? `الصف: ${grade}` : null,
    section ? `الشعبة: ${section}` : null,
    lessonHint ? `الدرس: ${lessonHint}` : null,
  ].filter(Boolean).join(" • ");

  const systemPrompt = `أنت معلم عربي محترف داخل منصة تعليمية.
- أجب بالعربية الفصحى المبسّطة، بأسلوب معلّم يشرح لطالب.
- إن توفّر سياق من كتب المكتبة فاستخدمه أولاً، واذكر الكتاب والصفحة عند الاقتضاء.
- إن لم يتوفّر سياق مناسب فاعتمد المعرفة العامة الموثوقة ووضّح أن الإجابة ليست من كتب المنصة.
- كن مختصراً ومباشراً: لا تتجاوز ${MAX_ANSWER_CHARS} حرف. لا تضع رموز Markdown.`;
  const userPrompt = [
    scopeLine ? `سياق الطالب: ${scopeLine}` : null,
    libraryContext ? `مقتطفات من المكتبة:\n${libraryContext}\n\n(اعتمد عليها أولاً)` : "لا يوجد سياق من المكتبة. استخدم معرفتك العامة ووضّح ذلك في نهاية الإجابة بجملة قصيرة.",
    `السؤال: ${question}`,
  ].filter(Boolean).join("\n\n");

  // Key of the ACTIVE AI provider (OpenRouter / AgentRouter / ...).
  const openRouterKey = await getActiveAiApiKey();
  if (!openRouterKey) return jsonError(503, "مفتاح المزود النشط للذكاء الاصطناعي غير مضبوط.");

  const ai = await openRouterChat({
    apiKey: openRouterKey,
    model: OPENROUTER_DEFAULT_CHAT_MODEL,
    body: {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
    },
    timeoutMs: 60_000,
  });

  let answerText = "";
  const chatProvider = "openrouter" as const;
  const chatModel = OPENROUTER_DEFAULT_CHAT_MODEL;
  if (ai.ok) {
    const j = await ai.response.json().catch(() => ({} as any));
    answerText = String(j?.choices?.[0]?.message?.content ?? "").trim();
  } else {
    console.error("[voice-answer] chat error", JSON.stringify({ status: (ai as any).status, error: String((ai as any).lastError).slice(0, 300) }));
  }
  if (!answerText) return jsonError(502, "تعذّر توليد الإجابة من الذكاء الاصطناعي.");
  if (answerText.length > MAX_ANSWER_CHARS) answerText = answerText.slice(0, MAX_ANSWER_CHARS);

  // 5. Speech Preprocessor + OpenRouter TTS (PCM -> WAV)
  const speechText = preprocessSpeechForTeacher(answerText);
  const ttsSettings = {
    provider: "openrouter",
    model: OPENROUTER_DEFAULT_TTS_MODEL,
    voice,
    speed: MODREK_TTS_SETTINGS.speed,
    format: "pcm",
    instructions: EGYPTIAN_TEACHER_TTS_INSTRUCTIONS,
    preprocessor: "Speech Preprocessor v1",
  };
  let wav: Uint8Array | null = null;
  let pcmBytes = 0;
  let audioDurationSeconds = 0;
  let ttsLastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const tts = await openRouterTts({
      apiKey: openRouterKey,
      model: OPENROUTER_DEFAULT_TTS_MODEL,
      input: speechText,
      voice,
      format: "pcm",
      // هوية الصوت تُضاف داخل openRouterTts؛ هنا تلميح إعادة المحاولة فقط.
      instructions: attempt === 1
        ? ""
        : "أعد الإلقاء بنطق أوضح ووقفات أفضل وسرعة أهدأ قليلاً، بدون ابتلاع حروف.",
      speed: MODREK_TTS_SETTINGS.speed,
      timeoutMs: 120_000,
    });
    if (!tts.ok) {
      ttsLastError = String((tts as any).lastError || "");
      if ((tts as any).status === 401 || (tts as any).status === 402 || (tts as any).status === 403 || (tts as any).status === 429) {
        return jsonError((tts as any).status === 402 ? 402 : 502, "تعذّر توليد الصوت عبر OpenRouter.", { detail: ttsLastError.slice(0, 200), status: (tts as any).status });
      }
      continue;
    }
    const pcm = new Uint8Array(await tts.response.arrayBuffer());
    const duration = estimatePcmDurationSeconds(pcm.byteLength);
    const minDuration = Math.min(2.2, Math.max(0.45, speechText.length / 85));
    if (pcm.byteLength >= 9000 && duration >= minDuration) {
      wav = pcmToWav(pcm);
      pcmBytes = pcm.byteLength;
      audioDurationSeconds = duration;
      break;
    }
    ttsLastError = `audio_quality_too_short:${duration}s/${pcm.byteLength}b`;
  }
  if (!wav) {
    return jsonError(502, "تعذّر توليد صوت بجودة مناسبة، ولم يتم حفظ نسخة رديئة.", { detail: ttsLastError.slice(0, 200) });
  }

  // 6. Upload to Bunny
  const objectPath = `voice-cache/${(subjectId ?? "misc")}/${(grade ?? "any")}/${questionHash}.wav`;
  let audioUrl: string;
  try {
    audioUrl = await uploadToBunny(objectPath, wav, "audio/wav");
  } catch (e) {
    return jsonError(502, "تعذّر رفع الصوت إلى Bunny.", { detail: String(e).slice(0, 200) });
  }

  // 7. Persist
  const voiceAnswerRow = {
    question,
    question_normalized: normalized,
    question_hash: questionHash,
    answer_text: answerText,
      speech_text: speechText,
    audio_url: audioUrl,
    audio_bytes: wav.byteLength,
      audio_duration_seconds: audioDurationSeconds,
      audio_quality: OPENROUTER_TTS_QUALITY,
      audio_storage_path: objectPath,
    voice,
    model: OPENROUTER_DEFAULT_TTS_MODEL,
      voice_settings: { ...ttsSettings, pcm_bytes: pcmBytes },
    subject_id: subjectId,
    stage,
    grade,
    section,
    lesson_hint: lessonHint,
    source,
      record_type: "voice_answer",
    citations,
    created_by: null,
  };
  const insert = await supabase.from("voice_answers").insert(voiceAnswerRow).select("id").maybeSingle();

  return jsonOk({
    cached: false,
    match: "generated",
    answer_text: answerText,
    speech_text: speechText,
    audio_url: audioUrl,
    source,
    voice,
    model: OPENROUTER_DEFAULT_TTS_MODEL,
    audio_duration_seconds: audioDurationSeconds,
    audio_quality: OPENROUTER_TTS_QUALITY,
    chat_provider: chatProvider,
    chat_model: chatModel,
    citations,
    id: insert?.data?.id ?? null,
  });
});
