// Voice Answer — library-first Q&A with cached TTS.
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
import {
  getOpenRouterApiKey,
  openRouterChat,
  openRouterTts,
  pcmToWav,
  OPENROUTER_DEFAULT_CHAT_MODEL,
  OPENROUTER_DEFAULT_TTS_MODEL,
} from "../_shared/openrouter.ts";

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
  const claims = getJwtClaimsFromAuthHeader(authHeader);
  if (!claims?.sub) return jsonError(401, "جلسة غير صالحة");

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return jsonError(400, "السؤال مطلوب");
  if (question.length > MAX_INPUT) return jsonError(400, `السؤال طويل جداً. الحد الأقصى ${MAX_INPUT} حرف.`);

  const subjectId  = typeof body?.subject_id === "string" ? body.subject_id : null;
  const subjectName = typeof body?.subject_name === "string" ? body.subject_name : null;
  const stage      = typeof body?.stage === "string" ? body.stage : null;
  const grade      = typeof body?.grade === "string" ? body.grade : null;
  const section    = typeof body?.section === "string" ? body.section : null;
  const lessonHint = typeof body?.lesson === "string" ? body.lesson.slice(0, 200) : null;
  const voice      = typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : "Kore";
  const forceRegen = Boolean(body?.force_regen);

  const normalized = normalizeArabic(question);
  const questionHash = await sha256Hex(`${subjectId ?? ""}|${grade ?? ""}|${lessonHint ?? ""}|${normalized}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1. Exact hash lookup
  if (!forceRegen) {
    const { data: exact } = await supabase
      .from("voice_answers")
      .select("id, answer_text, audio_url, voice, model, source, citations")
      .eq("question_hash", questionHash)
      .maybeSingle();
    if (exact?.audio_url) {
      await supabase.rpc("noop_ignore", {}).catch(() => {});
      await supabase
        .from("voice_answers")
        .update({ usage_count: (undefined as unknown as number), last_used_at: new Date().toISOString() })
        .eq("id", exact.id)
        .then(() => {})
        .catch(() => {});
      // increment atomically via SQL
      await supabase.from("voice_answers").update({ last_used_at: new Date().toISOString() }).eq("id", exact.id);
      await supabase.rpc("increment_voice_usage", { p_id: exact.id }).catch(() => {});
      return jsonOk({
        cached: true,
        match: "exact",
        answer_text: exact.answer_text,
        audio_url: exact.audio_url,
        source: exact.source,
        voice: exact.voice,
        model: exact.model,
        citations: exact.citations ?? null,
      });
    }

    // 2. Fuzzy trigram similarity within same scope
    const { data: fuzzy } = await supabase.rpc("voice_answers_find_similar", {
      p_normalized: normalized,
      p_subject_id: subjectId,
      p_grade: grade,
      p_threshold: SIMILARITY_THRESHOLD,
    }).catch(() => ({ data: null as any }));
    const hit = Array.isArray(fuzzy) && fuzzy.length > 0 ? fuzzy[0] : null;
    if (hit?.audio_url) {
      await supabase.from("voice_answers").update({ last_used_at: new Date().toISOString() }).eq("id", hit.id);
      await supabase.rpc("increment_voice_usage", { p_id: hit.id }).catch(() => {});
      return jsonOk({
        cached: true,
        match: "similar",
        similarity: hit.similarity,
        answer_text: hit.answer_text,
        audio_url: hit.audio_url,
        source: hit.source,
        voice: hit.voice,
        model: hit.model,
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

  const openRouterKey = getOpenRouterApiKey();
  if (!openRouterKey) return jsonError(503, "OPENROUTER_API_KEY غير مضبوط.");

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

  // 5. TTS via OpenRouter (PCM -> WAV)
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) return jsonError(503, "OPENROUTER_API_KEY غير مضبوط.");
  const tts = await openRouterTts({
    apiKey,
    model: OPENROUTER_DEFAULT_TTS_MODEL,
    input: answerText,
    voice,
    format: "pcm",
    timeoutMs: 120_000,
  });
  if (!tts.ok) {
    return jsonError(502, "تعذّر توليد الصوت.", { detail: String((tts as any).lastError).slice(0, 200), status: (tts as any).status });
  }
  const pcm = new Uint8Array(await tts.response.arrayBuffer());
  const wav = pcmToWav(pcm);

  // 6. Upload to Bunny
  const objectPath = `voice-cache/${(subjectId ?? "misc")}/${(grade ?? "any")}/${questionHash}.wav`;
  let audioUrl: string;
  try {
    audioUrl = await uploadToBunny(objectPath, wav, "audio/wav");
  } catch (e) {
    return jsonError(502, "تعذّر رفع الصوت إلى Bunny.", { detail: String(e).slice(0, 200) });
  }

  // 7. Persist
  const insert = await supabase.from("voice_answers").insert({
    question,
    question_normalized: normalized,
    question_hash: questionHash,
    answer_text: answerText,
    audio_url: audioUrl,
    audio_bytes: wav.byteLength,
    voice,
    model: OPENROUTER_DEFAULT_TTS_MODEL,
    subject_id: subjectId,
    stage,
    grade,
    section,
    lesson_hint: lessonHint,
    source,
    citations,
    created_by: claims.sub,
  }).select("id").maybeSingle();

  return jsonOk({
    cached: false,
    match: "generated",
    answer_text: answerText,
    audio_url: audioUrl,
    source,
    voice,
    model: OPENROUTER_DEFAULT_TTS_MODEL,
    chat_provider: chatProvider,
    chat_model: chatModel,
    citations,
    id: insert?.data?.id ?? null,
  });
});
