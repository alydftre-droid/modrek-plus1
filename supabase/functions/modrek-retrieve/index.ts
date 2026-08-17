// deno-lint-ignore-file no-explicit-any
// Modrek AI Retrieval Engine
// Phase 3 — Intent detection + tiered hybrid search + ranking + citation-ready context.
// NOTE: This function ONLY retrieves. It does NOT generate final answers.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey, resolveOpenRouterApiKey } from "../_shared/aiSettings.ts";

import { aiEmbeddings } from "../_shared/aiProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
// IMPORTANT: must match modrek-worker embedding config so query & corpus vectors share the same space
const EMBED_MODEL = "openai/text-embedding-3-small";
const GEMINI_EMBED_MODEL = "text-embedding-004";
const EMBED_DIMS = 768;
const INTENT_MODEL = "google/gemini-2.5-flash";
// RAG vision path MUST use Flash (see _shared/aiModels.ts policy).
const VISION_MODEL = "google/gemini-2.5-flash";


// Enforced source-type search order (from knowledge_source_types.sort_order)
const TIER_ORDER = [
  "book", "booklet", "notes", "summary",
  "exam", "ministry_model", "question_bank",
  "worksheet", "teacher_file", "other",
];

const CONFIDENCE_MIN = 0.55;   // composite threshold to accept
const PER_TIER_LIMIT = 8;
const FINAL_CONTEXT_LIMIT = 6;
const CACHE_TTL_SECONDS = 120;

type Intent =
  | "explain_lesson" | "solve_question" | "generate_exam" | "extract_questions"
  | "summarize" | "define" | "formula" | "example" | "translate"
  | "review" | "compare" | "analyze_image" | "analyze_exam" | "other";

interface IntentResult {
  intent: Intent;
  subject_hint?: string | null;
  book_hint?: string | null;
  page_hint?: number | null;
  lesson_hint?: string | null;
  keywords?: string[];
}

interface UserContext {
  user_id: string | null;
  role: string | null;
  stage_id: string | null;
  grade_id: string | null;
  section_id: string | null;
  track_id: string | null;
  subject_ids: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    // SECURITY: require a verified Supabase user. Prevents unauthenticated
    // access to admin-only knowledge_sources / knowledge_units / content_chunks
    // via the service-role client used below.
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const authClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(
      authHeader.replace(/^Bearer\s+/i, "").trim(),
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "unauthorized" }, 401);
    }
    const verifiedUserId = String(claimsData.claims.sub);

    const body = await req.json().catch(() => ({}));
    const {
      query = "",
      image_base64 = null,           // optional data URL or raw base64
      image_mime = "image/jpeg",
      filters = {},                  // optional overrides: { subject_id, stage_id, book_id, ... }
      max_results = FINAL_CONTEXT_LIMIT,
      force_refresh = false,
    } = body ?? {};
    // SECURITY: user_id comes only from the verified token, never from the body.
    const bodyUserId = verifiedUserId;


    if ((!query || String(query).trim().length === 0) && !image_base64) {
      return json({ error: "empty_query" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const userCtx = await resolveUserContext(admin, req, bodyUserId);

    // 1) If image, OCR to text and append
    let effectiveQuery = String(query || "").trim();
    let imageOcr: { text: string; guessed_book?: string; guessed_page?: number } | null = null;
    if (image_base64) {
      imageOcr = await ocrImage(image_base64, image_mime).catch(() => null);
      if (imageOcr?.text) {
        effectiveQuery = `${effectiveQuery}\n\n[من الصورة]:\n${imageOcr.text}`.trim();
      }
    }

    // 2) Intent detection
    const intent = await detectIntent(effectiveQuery).catch(() => ({
      intent: "other" as Intent, keywords: [],
    }));

    // 3) Build filters from user + intent + explicit overrides
    const derivedFilters = buildFilters(userCtx, intent, filters, imageOcr);

    // 3b) SHIELDED RAG guard: a student without a resolved grade must never be
    // served content from other grades — ask them to complete the profile first.
    if (userCtx.role === "student" && !derivedFilters.grade_id) {
      return json({
        intent: intent.intent,
        user_context: userCtx,
        filters_used: derivedFilters,
        results: [],
        results_count: 0,
        below_threshold: true,
        suggest_external: false,
        needs_profile_scope: true,
        message: "لم يتم تحديد الصف الدراسي في ملفك بعد، لذلك لا يمكن جلب محتوى المنهج. أكمل بيانات الصف ثم أعد المحاولة.",
      }, 200);
    }

    // 3c) Lesson/unit targeting: "اشرح الدرس الخامس" resolves to real units.
    const lessonTarget = await resolveLessonTarget(admin, effectiveQuery, intent, derivedFilters);

    // 4) Cache lookup
    const cacheKey = await hashKey({ q: effectiveQuery, f: derivedFilters, i: intent.intent });
    if (!force_refresh) {
      const cached = await readCache(admin, cacheKey);
      if (cached) {
        await logSearch(admin, {
          user_id: userCtx.user_id, role: userCtx.role, query_text: effectiveQuery,
          intent: intent.intent, filters: derivedFilters, tier_used: cached.tier_used ?? null,
          results_count: (cached.results ?? []).length, top_confidence: cached.top_confidence ?? null,
          cache_hit: true, duration_ms: Date.now() - started, fallback_external: false,
        });
        return json({ ...cached, cache_hit: true });
      }
    }

    // 5) Embed once
    const embedding = await embed(effectiveQuery);

    // 6) Tiered hybrid search — book → booklet → notes → summary → exam → ...
    let selectedTier: string | null = null;
    let allResults: any[] = [];
    for (const tier of TIER_ORDER) {
      const rows = await hybridSearch(admin, {
        embedding, text: effectiveQuery,
        source_type_code: tier,
        filters: derivedFilters,
        match_count: PER_TIER_LIMIT,
      });
      if (rows.length > 0) {
        const top = rows[0].composite_score ?? 0;
        // accept tier only if top result crosses confidence threshold
        if (top >= CONFIDENCE_MIN) {
          selectedTier = tier;
          allResults = rows;
          break;
        }
        // keep best-so-far for graceful fallback
        if (allResults.length === 0) allResults = rows;
      }
    }

    // 7) If nothing crossed threshold, suggest external
    const topConfidence = allResults[0]?.composite_score ?? 0;
    const belowThreshold = topConfidence < CONFIDENCE_MIN;

    // 7b) Lesson-targeted chunks always lead the context for lesson questions.
    if (lessonTarget?.chunks?.length) {
      const seen = new Set(lessonTarget.chunks.map((c: any) => c.chunk_id));
      allResults = [
        ...lessonTarget.chunks,
        ...allResults.filter((r) => !seen.has(r.chunk_id)),
      ];
    }

    // 8) Assemble citation-ready context
    const context = allResults.slice(0, max_results).map((r) => ({
      chunk_id: r.chunk_id,
      text: r.content,
      confidence: round(r.composite_score),
      similarity: round(r.similarity),
      text_rank: round(r.text_rank),
      citation: {
        source_id: r.source_id,
        source_title: r.source_title,
        source_type: r.source_type_code,
        unit_id: r.unit_id,
        unit_kind: r.unit_kind,
        unit_title: r.unit_title,
        page_from: r.page_from,
        page_to: r.page_to,
      },
    }));

    const payload = {
      intent: intent.intent,
      intent_meta: intent,
      user_context: userCtx,
      filters_used: derivedFilters,
      tier_used: selectedTier,
      lesson_target: lessonTarget ? { kind: lessonTarget.kind, number: lessonTarget.number, title: lessonTarget.title } : null,
      confidence_threshold: CONFIDENCE_MIN,
      top_confidence: round(topConfidence),
      results_count: context.length,
      below_threshold: belowThreshold,
      suggest_external: belowThreshold,
      image_ocr: imageOcr,
      results: context,
      generated_at: new Date().toISOString(),
    };

    // 9) Cache + log (only cache useful results)
    if (context.length > 0) await writeCache(admin, cacheKey, effectiveQuery, intent.intent, derivedFilters, payload);
    await logSearch(admin, {
      user_id: userCtx.user_id, role: userCtx.role, query_text: effectiveQuery,
      intent: intent.intent, filters: derivedFilters, tier_used: selectedTier,
      results_count: context.length, top_confidence: topConfidence,
      cache_hit: false, duration_ms: Date.now() - started, fallback_external: belowThreshold,
    });

    return json({ ...payload, cache_hit: false, duration_ms: Date.now() - started });
  } catch (e: any) {
    console.error("modrek-retrieve error", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

// ---------- helpers ----------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function round(n: number | null | undefined) {
  if (n == null) return null;
  return Math.round(n * 10000) / 10000;
}

async function hashKey(obj: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveUserContext(admin: any, req: Request, bodyUserId: string | null): Promise<UserContext> {
  let user_id: string | null = bodyUserId ?? null;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token && !user_id) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      user_id = payload?.sub ?? null;
    } catch { /* ignore */ }
  }
  const ctx: UserContext = {
    user_id, role: null, stage_id: null, grade_id: null,
    section_id: null, track_id: null, subject_ids: [],
  };
  if (!user_id) return ctx;
  const { data: profile } = await admin
    .from("profiles").select("*").eq("user_id", user_id).maybeSingle();
  if (profile) {
    ctx.role = (profile.role as string) ?? null;
    ctx.stage_id = profile.stage_id ?? null;
    ctx.grade_id = profile.grade_id ?? null;
    ctx.section_id = profile.section_id ?? null;
    ctx.track_id = profile.track_id ?? null;
  }
  // Best-effort subject list — depends on existing tables; safe on missing rows.
  try {
    const { data: subs } = await admin
      .from("subscriptions").select("subject_id").eq("user_id", user_id).eq("status", "active");
    if (Array.isArray(subs)) ctx.subject_ids = subs.map((s: any) => s.subject_id).filter(Boolean);
  } catch { /* ignore */ }
  return ctx;
}

async function detectIntent(query: string): Promise<IntentResult> {
  const sys = `أنت مصنّف نوايا لسؤال تعليمي عربي. أعد JSON فقط بالحقول التالية:
{"intent": one of ["explain_lesson","solve_question","generate_exam","extract_questions","summarize","define","formula","example","translate","review","compare","analyze_image","analyze_exam","other"],
 "subject_hint": string|null,
 "book_hint": string|null,
 "page_hint": number|null,
 "lesson_hint": string|null,
 "keywords": string[]  // 3-6 كلمات مفتاحية للبحث}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  const result = await callGeminiWithFallback({
    apiKey: resolved.apiKey,
    models: [INTENT_MODEL.replace(/^google\//, ""), "gemini-2.5-flash-lite"],
    body: {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: query.slice(0, 4000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    },
    timeoutMs: 45_000,
  });
  if (!result.ok) throw new Error(`intent_${result.status}`);
  const data = await result.response.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      intent: (parsed.intent ?? "other") as Intent,
      subject_hint: parsed.subject_hint ?? null,
      book_hint: parsed.book_hint ?? null,
      page_hint: typeof parsed.page_hint === "number" ? parsed.page_hint : null,
      lesson_hint: parsed.lesson_hint ?? null,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
    };
  } catch {
    return { intent: "other", keywords: [] };
  }
}

async function ocrImage(image: string, mime: string): Promise<{ text: string; guessed_book?: string; guessed_page?: number }> {
  const url = image.startsWith("data:") ? image : `data:${mime};base64,${image}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  const result = await callGeminiWithFallback({
    apiKey: resolved.apiKey,
    models: [VISION_MODEL.replace(/^google\//, ""), "gemini-2.5-flash"],
    body: {
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "استخرج النص العربي من الصورة كما هو. إن أمكن حدد اسم الكتاب ورقم الصفحة إن ظهر. أعد JSON: {\"text\": string, \"guessed_book\": string|null, \"guessed_page\": number|null}" },
          { type: "image_url", image_url: { url } },
        ],
      }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    },
    timeoutMs: 60_000,
  });
  if (!result.ok) throw new Error(`ocr_${result.status}`);
  const data = await result.response.json();
  try { return JSON.parse(data?.choices?.[0]?.message?.content ?? "{}"); }
  catch { return { text: "" }; }
}

async function embed(text: string): Promise<number[]> {
  const input = text.slice(0, 8000);
  // Embeddings via the unified AI Provider Layer. Must match modrek-worker so
  // query and corpus vectors share the same embedding space.
  const r = await aiEmbeddings({ model: EMBED_MODEL, input: [input], dimensions: EMBED_DIMS });
  if (!r.ok) throw new Error(`ai_embed_${r.status}: ${String(r.error || "").slice(0, 200)}`);
  const vec = (r.data as any)?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("ai_embed_empty");
  return vec as number[];
}

function buildFilters(user: UserContext, intent: IntentResult, overrides: any, ocr: any) {
  const f: Record<string, any> = {};
  // SHIELDED RAG: for students the curriculum scope comes from the profile and
  // can never be widened by the request body. Only admins/teachers may override.
  const locked = user.role === "student";
  const pick = (key: "stage_id" | "grade_id" | "section_id" | "track_id") => {
    if (locked) return (user as any)[key] ?? null;
    return overrides?.[key] ?? (user as any)[key] ?? null;
  };
  const stage_id = pick("stage_id");
  const grade_id = pick("grade_id");
  const section_id = pick("section_id");
  const track_id = pick("track_id");
  if (stage_id) f.stage_id = stage_id;
  if (grade_id) f.grade_id = grade_id;
  if (section_id) f.section_id = section_id;
  if (track_id) f.track_id = track_id;
  f._scope_locked = locked;
  if (overrides?.subject_id) f.subject_id = overrides.subject_id;
  if (Array.isArray(overrides?.source_ids) && overrides.source_ids.length > 0) f.source_ids = overrides.source_ids;
  // Hints (kept in metadata, useful for future matching)
  if (intent?.book_hint || ocr?.guessed_book) f._book_hint = intent?.book_hint ?? ocr?.guessed_book;
  if (intent?.page_hint || ocr?.guessed_page) f._page_hint = intent?.page_hint ?? ocr?.guessed_page;
  return f;
}

async function hybridSearch(admin: any, args: {
  embedding: number[]; text: string; source_type_code: string;
  filters: any; match_count: number;
}) {
  // Resolve source_type_id from code
  const { data: type } = await admin
    .from("knowledge_source_types").select("id").eq("code", args.source_type_code).maybeSingle();
  if (!type?.id) return [];
  const { data, error } = await admin.rpc("modrek_hybrid_search", {
    p_query_embedding: args.embedding as any,
    p_query_text: args.text,
    p_source_type_id: type.id,
    p_stage_id: args.filters.stage_id ?? null,
    p_grade_id: args.filters.grade_id ?? null,
    p_section_id: args.filters.section_id ?? null,
    p_track_id: args.filters.track_id ?? null,
    p_subject_id: args.filters.subject_id ?? null,
    p_source_ids: args.filters.source_ids ?? null,
    p_match_count: args.match_count,
    p_min_similarity: 0.30,
  });
  if (error) { console.error("hybrid_search error", error); return []; }
  return (data ?? []) as any[];
}

async function readCache(admin: any, key: string) {
  const { data } = await admin
    .from("modrek_search_cache")
    .select("payload, expires_at")
    .eq("query_hash", key)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  await admin.from("modrek_search_cache")
    .update({ hits: (data as any).hits ? (data as any).hits + 1 : 2 })
    .eq("query_hash", key);
  return data.payload;
}

async function writeCache(admin: any, key: string, query: string, intent: string, filters: any, payload: any) {
  const expires_at = new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString();
  await admin.from("modrek_search_cache").upsert({
    query_hash: key,
    query_text: query.slice(0, 500),
    intent,
    filters,
    payload,
    expires_at,
  }, { onConflict: "query_hash" });
}

async function logSearch(admin: any, row: any) {
  try { await admin.from("modrek_search_logs").insert(row); }
  catch (e) { console.warn("log_search_failed", e); }
}


// ---------- lesson targeting ----------

const RETRIEVE_ARABIC_ORDINALS: Record<string, number> = {
  "الاول": 1, "الأول": 1, "اول": 1, "الثاني": 2, "الثانى": 2, "الثالث": 3,
  "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8,
  "التاسع": 9, "العاشر": 10, "الحادي عشر": 11, "الثاني عشر": 12,
};

function normalizeAr(value: string): string {
  return String(value || "")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseLessonRequest(query: string, intent: IntentResult): { kind: "lesson" | "unit"; number: number } | null {
  const text = normalizeAr(`${query} ${intent?.lesson_hint ?? ""}`);
  const match = (keyword: string) => {
    const re = new RegExp(`${keyword}\\s*(?:رقم\\s*)?([0-9]{1,2}|[^0-9]{2,14}?)(?=\\s|$|\\.|،|:)`);
    const m = text.match(re);
    if (!m) return null;
    const token = m[1].trim();
    if (/^[0-9]+$/.test(token)) return Number(token);
    return RETRIEVE_ARABIC_ORDINALS[token] ?? RETRIEVE_ARABIC_ORDINALS[`ال${token}`] ?? null;
  };
  const lesson = /درس/.test(text) ? match("الدرس") ?? match("درس") : null;
  if (lesson) return { kind: "lesson", number: lesson };
  const unit = /وحده|باب|فصل/.test(text)
    ? match("الوحده") ?? match("وحده") ?? match("الباب") ?? match("باب") ?? match("الفصل") ?? match("فصل")
    : null;
  if (unit) return { kind: "unit", number: unit };
  return null;
}

/** Resolves "الدرس الخامس" to the real unit inside the student's own curriculum. */
async function resolveLessonTarget(admin: any, query: string, intent: IntentResult, filters: any) {
  const asked = parseLessonRequest(query, intent);
  if (!asked) return null;
  try {
    let sourceQuery = admin.from("knowledge_sources").select("id").eq("status", "ready");
    if (filters.grade_id) sourceQuery = sourceQuery.eq("grade_id", filters.grade_id);
    if (filters.stage_id) sourceQuery = sourceQuery.eq("stage_id", filters.stage_id);
    if (filters.subject_id) sourceQuery = sourceQuery.eq("subject_id", filters.subject_id);
    const { data: sources } = await sourceQuery.limit(50);
    const sourceIds = (sources ?? []).map((r: any) => r.id);
    if (!sourceIds.length) return null;

    let lessonQuery = admin.from("knowledge_lesson_index")
      .select("unit_id, kind, unit_number, lesson_number, title, page_start, page_end, source_id")
      .in("source_id", sourceIds);
    lessonQuery = asked.kind === "lesson"
      ? lessonQuery.eq("lesson_number", asked.number)
      : lessonQuery.eq("unit_number", asked.number).in("kind", ["unit", "chapter"]);
    const { data: lessons } = await lessonQuery.limit(3);
    const lesson = (lessons ?? [])[0];
    if (!lesson?.unit_id) return null;

    const { data: chunks } = await admin.from("content_chunks")
      .select("id, content, unit_id, source_id")
      .eq("unit_id", lesson.unit_id)
      .order("ordinal")
      .limit(4);

    return {
      kind: asked.kind,
      number: asked.number,
      title: lesson.title,
      chunks: (chunks ?? []).map((c: any) => ({
        chunk_id: c.id,
        content: c.content,
        composite_score: 0.99,
        similarity: 0.99,
        text_rank: null,
        source_id: c.source_id,
        source_title: null,
        source_type_code: "book",
        unit_id: lesson.unit_id,
        unit_kind: lesson.kind,
        unit_title: lesson.title,
        page_from: lesson.page_start,
        page_to: lesson.page_end,
      })),
    };
  } catch (e) {
    console.warn("lesson_target_failed", e);
    return null;
  }
}
