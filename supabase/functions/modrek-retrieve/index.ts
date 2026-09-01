// deno-lint-ignore-file no-explicit-any
// Modrek AI Retrieval Engine
// Phase 3 — Intent detection + tiered hybrid search + ranking + citation-ready context.
// NOTE: This function ONLY retrieves. It does NOT generate final answers.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey, resolveOpenRouterApiKey } from "../_shared/aiSettings.ts";

import { aiEmbeddings } from "../_shared/aiProvider.ts";
import { buildScopeFilters, resolveLessonTarget } from "../_shared/lessonTargeting.ts";
import {
  resolveStudentScope,
  resolveLibraryTaxonomyIds,
  retrieveFromLibrary,
  logRagPipeline,
  type LibraryRagResult,
} from "../_shared/modrekLibraryRag.ts";
import { hybridResearch } from "../_shared/modrekWebResearch.ts";

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

const INSTRUCTIONAL_TIERS = ["book", "booklet", "notes", "summary", "teacher_file", "other"];

function tiersForIntent(intent: Intent): string[] {
  // Explanation/search must not mistake an exam sheet or question bank for a
  // lesson. Assessment material is considered only for explicit assessment work.
  if (["generate_exam", "extract_questions", "analyze_exam", "solve_question", "review"].includes(intent)) {
    return TIER_ORDER;
  }
  return INSTRUCTIONAL_TIERS;
}

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
  /** Teacher-platform tenant; null = official platform. Never taken from the body. */
  platform_id: string | null;
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

    // 3b) LIBRARY FIRST — the unified Modrek library RAG runs before anything
    // else and works identically for religious, Arabic, literary and scientific
    // subjects. Its passages always lead the returned context.
    let libraryRag: LibraryRagResult | null = null;
    let libraryResults: any[] = [];
    if (userCtx.user_id) {
      try {
        libraryRag = await retrieveFromLibrary(admin, {
          userId: userCtx.user_id,
          query: effectiveQuery,
          contextSubject: (filters as any)?.subject_name ?? null,
          maxPassages: Math.max(4, Math.min(10, Number(max_results) || 6)),
          surface: "modrek-retrieve",

        });
        logRagPipeline("modrek-retrieve", libraryRag);
        libraryResults = libraryRag.passages.map((p, i) => ({
          chunk_id: `library:${p.book_id}:${p.page_from ?? i}`,
          content: p.text,
          composite_score: Math.max(0.6, Math.min(0.99, p.score)),
          similarity: p.score,
          text_rank: null,
          source_id: p.book_id,
          source_title: p.book_title,
          source_type_code: p.source_type,
          unit_id: null,
          unit_kind: "lesson",
          unit_title: p.lesson_title,
          page_from: p.page_from,
          page_to: p.page_to,
        }));
      } catch (libErr) {
        console.warn("[modrek-retrieve] library rag failed", String(libErr).slice(0, 250));
      }
    }

    // 3b-2) SHIELDED RAG guard: a student without a resolved grade must never be
    // served content from other grades — but only block when the library found nothing.
    if (userCtx.role === "student" && !derivedFilters.grade_id && libraryResults.length === 0) {
      return json({
        intent: intent.intent,
        user_context: userCtx,
        filters_used: derivedFilters,
        results: [],
        results_count: 0,
        below_threshold: true,
        suggest_external: false,
        needs_profile_scope: true,
        library_used: false,
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
    for (const tier of tiersForIntent(intent.intent)) {
      const rows = await hybridSearch(admin, {
        embedding, text: effectiveQuery,
        source_type_code: tier,
        filters: derivedFilters,
        match_count: PER_TIER_LIMIT,
        platform_id: user.platform_id ?? null,
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

    // 8) Assemble citation-ready context — library passages always lead.
    const seenFinal = new Set(libraryResults.map((r) => r.chunk_id));
    const mergedResults = [
      ...libraryResults,
      ...allResults.filter((r) => !seenFinal.has(r.chunk_id)),
    ];
    const context = mergedResults.slice(0, max_results).map((r) => ({
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

    const libraryUsed = libraryResults.length > 0;
    // A source existing is not the same as that source covering the requested
    // lesson. Keep the signal low when lesson lock rejected the library result.
    const effectiveBelowThreshold = libraryRag ? !libraryRag.found : belowThreshold;

    // 8b) Hybrid decision engine — evaluate coverage and, when the platform
    // library is incomplete, attach trusted external research to the payload.
    const research = await hybridResearch({
      admin,
      surface: "modrek-retrieve",
      query: effectiveQuery,
      library: libraryRag,
      scope: libraryRag?.scope ?? null,
      forceRefresh: Boolean(force_refresh),
    }).catch((e) => {
      console.warn("[modrek-retrieve] hybrid research failed", String(e).slice(0, 200));
      return null;
    });

    const payload = {
      intent: intent.intent,
      intent_meta: intent,
      user_context: userCtx,
      filters_used: derivedFilters,
      tier_used: libraryUsed ? "library_first" : selectedTier,
      library_used: libraryUsed,
      library_scope: libraryRag?.scope ?? null,
      library_subject: libraryRag?.understanding?.subject ?? null,
      library_book: libraryRag?.selected_book?.title ?? null,
      library_lesson: libraryRag?.lesson?.title ?? null,
      lesson_target: lessonTarget ? { kind: lessonTarget.kind, number: lessonTarget.number, title: lessonTarget.title } : null,
      confidence_threshold: CONFIDENCE_MIN,
      top_confidence: round(libraryUsed ? Math.max(topConfidence, libraryResults[0]?.composite_score ?? 0) : topConfidence),
      results_count: context.length,
      below_threshold: effectiveBelowThreshold,
      suggest_external: effectiveBelowThreshold,
      research: research
        ? {
            coverage: round(research.evaluation.coverage),
            decision: research.evaluation.decision,
            reasons: research.evaluation.reasons,
            used_web: research.usedWeb,
            engine: research.outcome.engine,
            cached: research.outcome.cached,
            error: research.outcome.error,
            web_results: research.outcome.results,
            web_digest: research.outcome.digest,
            context_block: research.contextBlock || null,
            mandate_block: research.mandateBlock || null,
            citations: research.citations,
            needs_fresh: research.evaluation.needs_fresh,
            needs_verification: research.evaluation.needs_verification,
          }
        : null,
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
    section_id: null, track_id: null, subject_ids: [], platform_id: null,
  };
  if (!user_id) return ctx;

  // FIX: profiles PK is `id` (not `user_id`) and the curriculum columns are
  // text labels (`stage`, `grade`, `section`, `education_type`), never *_id.
  // We resolve them into real library_* taxonomy ids through the shared scope.
  const scope = await resolveStudentScope(admin, user_id, authHeader ?? null);
  ctx.role = scope.role;
  ctx.platform_id = scope.platformId ?? null;
  const ids = await resolveLibraryTaxonomyIds(admin, scope);
  ctx.stage_id = ids.stage_id;
  ctx.grade_id = ids.grade_id;
  ctx.section_id = ids.section_id;
  ctx.track_id = ids.track_id;

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
  return buildScopeFilters(user as any, intent, overrides, ocr);
}

async function hybridSearch(admin: any, args: {
  embedding: number[]; text: string; source_type_code: string;
  filters: any; match_count: number; platform_id: string | null;
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
  const rows = (data ?? []) as any[];
  if (!rows.length) return rows;

  // Tenant isolation: retrieval runs with the service role, so every matched
  // chunk is re-checked against the caller's platform before it can ground an
  // answer. A platform student never sees another platform's (or the official
  // platform's) sources, and vice versa.
  const sourceIds = Array.from(new Set(rows.map((r: any) => r.source_id).filter(Boolean)));
  const { data: sources } = await admin
    .from("knowledge_sources").select("id,platform_id").in("id", sourceIds);
  const allowed = new Set(
    (sources ?? [])
      .filter((s: any) => (s.platform_id ?? null) === (args.platform_id ?? null))
      .map((s: any) => String(s.id)),
  );
  return rows.filter((r: any) => allowed.has(String(r.source_id)));
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
