// deno-lint-ignore-file no-explicit-any
// Modrek AI Knowledge Processing Engine — background worker
// Claims pending jobs one at a time using modrek_claim_next_job (SKIP LOCKED)
// and runs the appropriate pipeline stage. Chains the next stage on success.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { getDocumentProxy } from "npm:unpdf@0.11.0";
import { callGeminiWithFallback, resolveOpenRouterApiKey } from "../_shared/aiSettings.ts";
import { aiEmbeddings, resolveFileApiRoute } from "../_shared/aiProvider.ts";
import {
  classifyPipelineError,
  pageNeedsOcr,
  planPageBatches,
  planPdfParts,
  resolvePdfPageCount,
  tokenBudgetForStage,
} from "./pdfPipeline.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DB_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || SUPABASE_URL;
const DB_SERVICE_ROLE = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || SERVICE_ROLE;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const BUCKET = "modrek-library";
const BUNNY_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
const BUNNY_STORAGE_HOST = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const EMBED_MODEL = "openai/text-embedding-3-small";
const GEMINI_EMBED_MODEL = "text-embedding-004";
const EMBED_DIMS = 768;
// Book upload / OCR / structure extraction MUST use Flash per platform policy
// (see supabase/functions/_shared/aiModels.ts). Pro is reserved for exams.
const VISION_MODEL = "google/gemini-2.5-flash";
const STRUCTURE_MODEL = "google/gemini-2.5-flash";


const MAX_JOBS_PER_INVOCATION = 1;
// Keep the total wall-time safely below the edge runtime cap (~150s) so the
// worker can always return cleanly and requeue instead of crashing with 502.
// Previously STAGE_TIMEOUT_MS=118s + auth/RPC overhead could push a single
// invocation past the platform budget.
const STAGE_TIMEOUT_MS = 135_000;
const AI_REQUEST_TIMEOUT_MS = 60_000;
// PDF OCR through OpenRouter can take longer than a normal text call when a
// page is scanned. Keep this under the edge runtime budget so the worker can
// return cleanly and requeue instead of crashing.
const PDF_PAGE_EXTRACT_TIMEOUT_MS = 110_000;
const FILE_API_TIMEOUT_MS = 80_000;
// Books above this size go through the Gemini File API instead of being sent
// inline as base64. The old 80MB threshold pushed 15-80MB scanned books through
// base64 chat requests, which is what produced the OpenRouter 402
// "requires more credits / requested up to 65536 tokens" storm.
const PDF_LOCAL_FALLBACK_LIMIT_BYTES = 15 * 1024 * 1024;
const DIRECT_AI_FILE_LIMIT_BYTES = 7 * 1024 * 1024;
// Hard ceiling for a single OCR request payload (one page only).
const OCR_SUBSET_MAX_BYTES = 2 * 1024 * 1024;
const FULL_TEXT_CHUNK_SIZE = 3500;
const FULL_TEXT_CHUNK_OVERLAP = 250;
const PDF_TEXT_BATCH_PAGES = 1;
const PDF_AI_BATCH_TARGET_BYTES = 10 * 1024 * 1024;
const GEMINI_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const PDF_EXTRACT_MAX_OUTPUT_TOKENS = 16_384;
const EXTRACT_PAGE_MAX_ATTEMPTS = 5;
// --- Large-book pipeline (local-first) --------------------------------------
// A book is split ONCE into small part files stored next to the original.
// Every extraction job then downloads only its own ~10-page part instead of
// re-downloading and re-parsing the whole 30-100MB book for every page.
const PDF_PART_PAGES = 10;
const PARTS_PER_SPLIT_INVOCATION = 6;
// Above this size the book is always split before extraction.
const PDF_SPLIT_MIN_BYTES = 4 * 1024 * 1024;
const PDF_SPLIT_MIN_PAGES = 24;

/** Output-token budget derived from the real page count, never a flat huge value. */
function outputTokenBudgetForPages(pages: number): number {
  const perPage = 1_800;
  return Math.max(1_024, Math.min(8_192, Math.max(1, pages) * perPage));
}
const RATE_LIMIT_MIN_BACKOFF_MS = 10 * 60_000;
const RATE_LIMIT_MAX_BACKOFF_MS = 60 * 60_000;
const QUOTA_EXHAUSTED_MIN_BACKOFF_MS = 6 * 60 * 60_000;
const QUOTA_EXHAUSTED_MAX_BACKOFF_MS = 12 * 60 * 60_000;

type FailureDiagnostic = {
  category: "insufficient_credits" | "quota_exhausted" | "rate_limit" | "timeout" | "provider" | "storage" | "database" | "unknown";
  userMessage: string;
  rawMessage: string;
  retryable: boolean;
  file: string;
  function: string;
  line: number | null;
  stack: string | null;
};

class RequeueStageError extends Error {
  delayMs: number;
  output: Record<string, unknown>;

  constructor(message: string, delayMs: number, output: Record<string, unknown> = {}) {
    super(message);
    this.name = "RequeueStageError";
    this.delayMs = delayMs;
    this.output = output;
  }
}

const WORKER_SHARED_KEY = (Deno.env.get("MODREK_WORKER_SHARED_KEY") || Deno.env.get("LIBRARY_WORKER_SHARED_KEY") || "").trim();

function resolveGoogleGeminiApiKey(): string {
  return String(Deno.env.get("GEMINI_API_KEY") || GEMINI_API_KEY || Deno.env.get("GOOGLE_API_KEY") || "").trim();
}

// Book-file uploads are the ONLY AI service that may fall outside the active
// provider: they need Google's resumable File API (upload + file_uri). The
// unified layer probes the active gateway on every run, so the day a gateway
// ships a real Files endpoint this flips automatically. Until then we log the
// routing decision so the developer dashboard and the job logs agree.
async function describeFileApiRoute(admin: SupabaseClient, jobId?: string, extra: Record<string, unknown> = {}) {
  try {
    const route = await resolveFileApiRoute();
    await log(admin, jobId, "info", "file_api_routing_decision", {
      route: route.route,
      active_provider: route.provider,
      provider_supports_files: route.provider_supported,
      key_env: route.key_env,
      key_present: route.key_present,
      reason: route.reason,
      ...extra,
    });
    return route;
  } catch (_err) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // AUTH GUARD: only accept requests bearing the service-role key or the shared worker secret.
  // Without this, anyone on the internet could trigger paid AI processing jobs.
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const workerKey = (req.headers.get("x-worker-key") || "").trim();
  const admin = createClient(DB_URL, DB_SERVICE_ROLE);
  let allowed = (bearer && (bearer === SERVICE_ROLE || bearer === DB_SERVICE_ROLE))
    || (!!WORKER_SHARED_KEY && workerKey === WORKER_SHARED_KEY);
  if (!allowed) {
    try {
      const { data } = await admin
        .from("platform_settings")
        .select("value")
        .eq("key", "modrek_worker_shared_key")
        .maybeSingle();
      const stored = (typeof data?.value === "string"
        ? data.value
        : typeof (data?.value as any)?.key === "string"
          ? (data!.value as any).key
          : "").trim();
      allowed = !!stored && workerKey === stored;
    } catch { /* ignore */ }
  }
  // Allow admin users to manually kick the worker from the browser (JWT-based).
  if (!allowed && bearer) {
    try {
      const { data: claimData } = await admin.auth.getClaims(bearer);
      const uid = claimData?.claims?.sub as string | undefined;
      if (uid) {
        const { data: role } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", uid)
          .in("role", ["admin", "super_admin"])
          .maybeSingle();
        if (role) allowed = true;
      }
    } catch { /* ignore */ }
  }
  if (!allowed) {
    return json({ error: "unauthorized_worker" }, 401);
  }

  const results: any[] = [];
  try {
    await recoverTransientModrekJobs(admin);
    for (let i = 0; i < MAX_JOBS_PER_INVOCATION; i++) {
      const job = await claimNextJob(admin);
      if (!job) break;
      try {
        await withTimeout(
          runStage(admin, job),
          STAGE_TIMEOUT_MS,
          `انتهت مهلة مرحلة ${job.kind} بعد ${Math.round(STAGE_TIMEOUT_MS / 1000)} ثانية؛ تمت إعادة الجدولة تلقائياً بدل بقاء الملف معلقاً`,
        );
        results.push({ job_id: job.id, kind: job.kind, ok: true });
      } catch (e: any) {
        if (e instanceof RequeueStageError) {
          await requeueJob(admin, job, e.delayMs, e.output);
          results.push({ job_id: job.id, kind: job.kind, ok: true, requeued: true, reason: e.message });
          continue;
        }
        await failJob(admin, job, e);
        results.push({ job_id: job.id, kind: job.kind, ok: false, error: e?.message });
      }
    }
    if (results.length > 0) {
      scheduleNextWorkerRun();
    }
    return json({ processed: results.length, results });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function claimNextJob(admin: SupabaseClient): Promise<any | null> {
  const rpc = await admin.rpc("modrek_claim_next_job");
  if (!rpc.error) {
    const rows = rpc.data;
    return Array.isArray(rows) ? rows[0] ?? null : rows ?? null;
  }

  const errorMessage = String(rpc.error.message || "");
  const canFallback = errorMessage.includes("FOR UPDATE cannot be applied")
    || errorMessage.includes("modrek_claim_next_job")
    || errorMessage.includes("schema cache")
    || errorMessage.includes("Could not find");
  if (!canFallback) throw new Error(errorMessage);

  console.warn("modrek_claim_next_job failed; using direct claim fallback", errorMessage);
  await recoverStaleRunningJobs(admin);

  const nowIso = new Date().toISOString();
  const { data: candidates, error: listError } = await admin
    .from("processing_jobs")
    .select("*")
    .in("status", ["pending", "retrying"] as any)
    .lte("next_run_at", nowIso)
    .order("stage_order", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(25);
  if (listError) throw new Error(`fallback claim list failed: ${listError.message}`);

  for (const candidate of candidates ?? []) {
    if (Number(candidate.attempts ?? 0) >= Number(candidate.max_attempts ?? 3)) continue;
    if (candidate.kind === "merge_text") {
      const { data: incompleteExtraction } = await admin
        .from("processing_jobs")
        .select("id")
        .eq("version_id", candidate.version_id)
        .in("kind", ["extract_text", "extract_page"] as any)
        .in("status", ["pending", "running", "retrying"] as any)
        .limit(1)
        .maybeSingle();
      if (incompleteExtraction?.id) continue;
    }
    if (candidate.kind === "extract_page") {
      const { data: runningPage } = await admin
        .from("processing_jobs")
        .select("id")
        .eq("kind", "extract_page")
        .eq("status", "running")
        .gt("updated_at", new Date(Date.now() - 3 * 60_000).toISOString())
        .limit(1)
        .maybeSingle();
      if (runningPage?.id) continue;
    }

    const { data: claimed, error: claimError } = await admin
      .from("processing_jobs")
      .update({
        status: "running",
        started_at: nowIso,
        finished_at: null,
        attempts: Number(candidate.attempts ?? 0) + 1,
        error: null,
        updated_at: nowIso,
      })
      .eq("id", candidate.id)
      .in("status", ["pending", "retrying"] as any)
      .select("*")
      .maybeSingle();
    if (claimError) throw new Error(`fallback claim update failed: ${claimError.message}`);
    if (claimed?.id) {
      await log(admin, claimed.id, "warn", "worker used direct claim fallback", { original_error: errorMessage.slice(0, 500) });
      return claimed;
    }
  }

  return null;
}

async function recoverStaleRunningJobs(admin: SupabaseClient) {
  const staleBefore = new Date(Date.now() - 3 * 60_000).toISOString();
  await admin
    .from("processing_jobs")
    .update({
      status: "retrying",
      error: "انقطع نبض العامل أو انتهت مهلة المرحلة؛ تمت إعادة الجدولة تلقائياً",
      finished_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + 30_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("updated_at", staleBefore);
}

async function runStage(admin: SupabaseClient, job: any) {
  await admin.from("processing_jobs").update({
    progress_pct: Math.max(1, Number(job.progress_pct ?? 0)),
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  await log(admin, job.id, "info", `stage started: ${job.kind}`);

  // Credit circuit breaker: never spend another provider request on a version
  // that was already frozen for insufficient credits.
  if (await isVersionCreditBlocked(admin, job.version_id)) {
    await admin.from("processing_jobs").update({
      status: "cancelled",
      error: "تم الإيقاف تلقائياً: رصيد مزود الذكاء غير كافٍ",
      finished_at: new Date().toISOString(),
      next_run_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    await log(admin, job.id, "warn", "stage skipped: version frozen by credit circuit breaker", { kind: job.kind });
    return;
  }

  switch (job.kind) {
    case "detect": return await stageDetect(admin, job);
    case "extract_text": return await stageExtractText(admin, job);
    case "upload_pdf_chunk": return await stageUploadPdfChunk(admin, job);
    case "extract_page": return await stageExtractPage(admin, job);
    case "split_pdf": return await stageSplitPdf(admin, job);
    case "merge_text": return await stageMergeText(admin, job);
    case "ocr": return await stageOcr(admin, job);
    case "structure": return await stageStructure(admin, job);
    case "chunk": return await stageChunk(admin, job);
    case "embed": return await stageEmbed(admin, job);
    case "index": return await stageIndex(admin, job);
    default:
      throw new Error(`unknown stage kind: ${job.kind}`);
  }
}

// -------- Stage 1: detect ----------------------------------------------------
async function stageDetect(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "detecting", 10);
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for detect stage");
  const mime = (asset?.mime_type ?? "").toLowerCase();
  let nextKind: string = "extract_text";
  if (mime.startsWith("image/") || (mime === "application/pdf" && asset?.metadata?.is_scanned)) {
    nextKind = "ocr";
  }
  await succeedJob(admin, job, { detected_mime: mime, next: nextKind });
  await enqueue(admin, job.version_id, nextKind, 20, { asset_id: job.asset_id, mime }, job.asset_id);
}

// -------- Stage 2a: extract_text via Gemini multimodal ----------------------
async function stageExtractText(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "text_extraction", 25);
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for text extraction");
  const mime = asset?.mime_type ?? "application/octet-stream";

  if (mime === "application/pdf") {
    await queuePdfTextBatches(admin, job, asset);
    return;
  }

  const text = await extractTextForAsset(admin, job, asset, mime);
  if (!text.trim()) throw new Error("text extraction returned empty text");
  await admin.from("knowledge_source_versions").update({
    extracted_text: text, extracted_language: guessLang(text), progress_pct: 40,
  }).eq("id", job.version_id);
  await succeedJob(admin, job, { chars: text.length });
  await enqueue(admin, job.version_id, "structure", 30, { chars: text.length }, job.asset_id);
}

// -------- Stage 2a.1: PDF page/batch extraction -----------------------------
async function stageExtractPage(admin: SupabaseClient, job: any) {
  const input = job.input ?? {};
  const pageFrom = Math.max(1, Number(input.page_from ?? input.page_no ?? 1));
  const pageTo = Math.max(pageFrom, Number(input.page_to ?? pageFrom));
  const pageCount = Math.max(pageTo, Number(input.page_count ?? pageTo));
  const partPath = typeof input.part_path === "string" && input.part_path ? String(input.part_path) : null;
  const partPageFrom = Math.max(1, Number(input.part_page_from ?? pageFrom));

  await setVersionStage(admin, job.version_id, "text_extraction", Math.min(39, 25 + Math.floor((pageFrom / Math.max(1, pageCount)) * 14)));
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for PDF page extraction");

  await markPagesState(admin, job.version_id, pageFrom, pageTo, {
    extraction_status: "running",
    extractor: partPath ? "local_pdfjs_part" : "local_pdfjs",
  });

  // 1) LOCAL text-layer extraction. Never an LLM call, whatever the book size.
  //    When the book was split, only the small part file is downloaded.
  let bytes: Uint8Array;
  let localFrom = pageFrom;
  let localTo = pageTo;
  if (partPath) {
    bytes = await fetchBunnyObject(partPath);
    localFrom = pageFrom - partPageFrom + 1;
    localTo = pageTo - partPageFrom + 1;
  } else {
    bytes = await fetchAssetBytes(admin, asset);
  }

  const pages = await extractPdfPagesFromBytes(bytes, localFrom, localTo, async (donePage) => {
    const pct = 5 + Math.floor(((donePage - localFrom + 1) / Math.max(1, localTo - localFrom + 1)) * 70);
    await updateJobProgress(admin, job, Math.min(95, pct), {
      stage: partPath ? "local_pdf_part_text_layer" : "local_pdf_text_layer",
      current_page: donePage + (partPath ? partPageFrom - 1 : 0),
      page_from: pageFrom,
      page_to: pageTo,
    });
  });

  const absolute = pages.map((p) => ({
    pageNo: partPath ? p.pageNo + partPageFrom - 1 : p.pageNo,
    text: p.text,
  }));

  // 2) OCR ONLY for pages that genuinely have no usable text layer. One page per
  //    request, tiny payload, small token budget — this is the only paid step.
  let ocrStatus = "not_needed";
  const needOcr = absolute.filter((p) => pageNeedsOcr(p.text));
  if (needOcr.length) {
    if (absolute.length > 1) {
      // Split so each OCR request stays a single page and one bad page can
      // never fail (or inflate) the rest of the batch.
      for (const p of needOcr) {
        await enqueue(admin, job.version_id, "extract_page", 21, {
          ...input,
          extractor: "local_pdfjs",
          gemini_file: null,
          page_from: p.pageNo,
          page_to: p.pageNo,
          __split_depth: Number(input.__split_depth ?? 0) + 1,
        }, job.asset_id, EXTRACT_PAGE_MAX_ATTEMPTS);
      }
      const goodPages = absolute.filter((p) => !pageNeedsOcr(p.text));
      if (goodPages.length) {
        await persistPageUnits(admin, job, goodPages, pageCount, "text_layer");
      }
      await log(admin, job.id, "info", "queued single-page OCR for pages without a text layer", {
        page_from: pageFrom,
        page_to: pageTo,
        ocr_pages: needOcr.map((p) => p.pageNo),
        text_pages: goodPages.length,
      });
      await succeedJob(admin, job, {
        mode: "split_for_single_page_ocr",
        page_from: pageFrom,
        page_to: pageTo,
        ocr_pages: needOcr.length,
      });
      return;
    }

    // Single page with no text layer -> real OCR.
    try {
      const subset = await withTimeout(
        partPath
          ? createPdfPageSubset(bytes, localFrom, localTo)
          : createPdfPageSubset(bytes, pageFrom, pageTo),
        25_000,
        `تعذر تجهيز صفحة OCR ${pageFrom} خلال المهلة`,
      );
      if (subset.byteLength > OCR_SUBSET_MAX_BYTES) {
        ocrStatus = "skipped_too_large";
        await log(admin, job.id, "warn", "OCR skipped: single-page payload above the provider budget", {
          page_from: pageFrom,
          subset_bytes: subset.byteLength,
          limit_bytes: OCR_SUBSET_MAX_BYTES,
        });
      } else {
        const ocrText = await geminiExtractFromBytes(
          admin,
          subset,
          "application/pdf",
          `${asset.original_filename || "document"}-page-${pageFrom}.pdf`,
          true,
          tokenBudgetForStage("ocr_page", 1),
        );
        if (ocrText.trim().length > (absolute[0]?.text?.length ?? 0)) {
          absolute[0] = { pageNo: pageFrom, text: ocrText.trim() };
          ocrStatus = "done";
        } else {
          ocrStatus = "low_yield";
        }
      }
    } catch (err: any) {
      const diag = classifyPipelineError(err, "ocr");
      await log(admin, job.id, "warn", "single-page OCR failed", {
        page_from: pageFrom,
        category: diag.category,
        error: diag.message,
        retryable: diag.retryable,
      });
      if (diag.freezesPaidWork || diag.category === "RATE_LIMIT") throw err;
      ocrStatus = `failed_${diag.category.toLowerCase()}`;
      if (!absolute[0]?.text?.trim()) {
        absolute[0] = { pageNo: pageFrom, text: `--- صفحة ${pageFrom} ---\n(لم يتم استخراج نص من هذه الصفحة)` };
      }
    }
  }

  const batchText = absolute
    .map((p) => `--- صفحة ${p.pageNo} ---\n${p.text}`)
    .join("\n\n")
    .trim();
  if (!batchText) throw new Error(`لم يتم استخراج أي نص من الصفحات ${pageFrom}-${pageTo}`);

  await persistPageUnits(admin, job, absolute, pageCount, ocrStatus);

  const versionPct = 28 + Math.floor((Math.min(pageTo, pageCount) / Math.max(1, pageCount)) * 12);
  await admin.from("knowledge_source_versions").update({
    progress_pct: Math.min(40, versionPct),
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.version_id);
  await refreshVersionPageCounters(admin, job.version_id);

  await succeedJob(admin, job, {
    page_from: pageFrom,
    page_to: pageTo,
    chars: batchText.length,
    mode: partPath ? "pdf_part_page_batch" : "pdf_page_batch",
    ocr_status: ocrStatus,
  });
}

/** Persist extracted page text (idempotent per page) and mark the page state. */
async function persistPageUnits(
  admin: SupabaseClient,
  job: any,
  pages: { pageNo: number; text: string }[],
  pageCount: number,
  ocrStatus: string,
) {
  for (const page of pages) {
    const text = `--- صفحة ${page.pageNo} ---\n${String(page.text ?? "").trim()}`;
    await admin.from("knowledge_units")
      .delete()
      .eq("version_id", job.version_id)
      .eq("kind", "page")
      .eq("metadata->>extraction_stage", "pdf_page_text")
      .eq("metadata->>page_from", String(page.pageNo));

    const { error } = await admin.from("knowledge_units").insert({
      version_id: job.version_id,
      parent_id: null,
      kind: "page",
      title: `صفحة ${page.pageNo}`,
      ordinal: page.pageNo,
      page_from: page.pageNo,
      page_to: page.pageNo,
      content_text: text,
      language: guessLang(text),
      word_count: text.split(/\s+/).filter(Boolean).length,
      confidence: 0.95,
      metadata: {
        extraction_stage: "pdf_page_text",
        page_from: String(page.pageNo),
        page_to: String(page.pageNo),
        page_count: pageCount,
        chars: text.length,
        ocr_status: ocrStatus,
      },
    });
    if (error) throw error;

    await markPagesState(admin, job.version_id, page.pageNo, page.pageNo, {
      extraction_status: "done",
      ocr_status: ocrStatus,
      char_count: text.length,
      error_category: null,
      error_message: null,
    });
  }
}

/** Cache the developer-facing progress counters on the version row. */
async function refreshVersionPageCounters(admin: SupabaseClient, versionId: string) {
  try {
    const [{ count: done }, { count: failed }] = await Promise.all([
      admin.from("knowledge_page_state").select("page_number", { count: "exact", head: true })
        .eq("version_id", versionId).eq("extraction_status", "done"),
      admin.from("knowledge_page_state").select("page_number", { count: "exact", head: true })
        .eq("version_id", versionId).eq("extraction_status", "failed"),
    ]);
    await admin.from("knowledge_source_versions").update({
      pages_processed: Number(done ?? 0),
      pages_failed: Number(failed ?? 0),
      updated_at: new Date().toISOString(),
    }).eq("id", versionId);
  } catch (_err) { /* counters are a UI convenience, never fail a stage on them */ }
}


// -------- Stage 2a.0: chunked upload of large PDFs to Gemini File API --------
async function stageUploadPdfChunk(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "text_extraction", 25);
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for chunked Gemini upload");

  const metadata = asset.metadata ?? {};
  const uploadState = metadata.gemini_upload ?? null;
  if (metadata.gemini_file?.uri && metadata.gemini_file?.name) {
    await log(admin, job.id, "info", "Gemini file already uploaded; continuing PDF page extraction", {
      asset_id: asset.id,
      file_name: metadata.gemini_file.name,
    });
    await queuePdfTextBatches(admin, job, asset);
    return;
  }
  if (!uploadState?.upload_url) {
    throw new Error("Gemini chunked upload state is missing; restart text extraction for this source");
  }

  const apiKey = resolveGoogleGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING_FOR_FILE_PROCESSING");

  if (uploadState.file?.name) {
    await updateJobProgress(admin, job, 90, { stage: "gemini_file_finalize_wait", file_name: uploadState.file.name });
    const active = await waitForGeminiFileActiveSlice(apiKey, uploadState.file, 55_000);
    if (!active) {
      await succeedJob(admin, job, { mode: "gemini_file_still_processing", file_name: uploadState.file.name });
      await enqueue(admin, job.version_id, "upload_pdf_chunk", 20, {
        asset_id: asset.id,
        offset: Number(uploadState.offset ?? asset.byte_size ?? 0),
        size: Number(uploadState.size ?? asset.byte_size ?? 0),
        status: "finalizing",
      }, asset.id);
      return;
    }
    const geminiFile = buildGeminiFileRef(active, asset.mime_type || "application/pdf");
    await storeGeminiFileRef(admin, asset, geminiFile);
    await succeedJob(admin, job, { mode: "gemini_file_ready", file_name: geminiFile.name, state: geminiFile.state });
    await enqueue(admin, job.version_id, "extract_text", 20, {
      asset_id: asset.id,
      mime: asset.mime_type || "application/pdf",
      resumed_from_gemini_file: true,
    }, asset.id);
    return;
  }

  const size = Number(uploadState.size ?? asset.byte_size ?? 0);
  const offset = Math.max(0, Number(uploadState.offset ?? 0));
  const chunkSize = Math.max(1024 * 1024, Number(uploadState.chunk_size ?? GEMINI_UPLOAD_CHUNK_BYTES));
  if (!size || offset >= size) throw new Error("Invalid Gemini upload offset/size; restart text extraction");

  const end = Math.min(size - 1, offset + chunkSize - 1);
  const chunk = await fetchBunnyRange(asset, offset, end);
  const uploadBody = new ArrayBuffer(chunk.byteLength);
  new Uint8Array(uploadBody).set(chunk);
  const isFinal = end + 1 >= size;
  const pct = 25 + Math.floor((Math.min(size, end + 1) / Math.max(1, size)) * 10);
  await updateJobProgress(admin, job, pct, {
    stage: "gemini_file_chunk_upload",
    offset,
    end,
    size,
    chunk_bytes: chunk.byteLength,
    final: isFinal,
  });

  const upload = await fetchWithTimeout(uploadState.upload_url, {
    method: "POST",
    headers: {
      "Content-Length": String(chunk.byteLength),
      "X-Goog-Upload-Offset": String(offset),
      "X-Goog-Upload-Command": isFinal ? "upload, finalize" : "upload",
    },
    body: uploadBody,
  }, FILE_API_TIMEOUT_MS);
  if (!upload.ok) throw new Error(`Gemini chunk upload failed ${upload.status}: ${(await upload.text()).slice(0, 300)}`);

  if (!isFinal) {
    const nextOffset = end + 1;
    await admin.from("storage_assets").update({
      metadata: {
        ...metadata,
        gemini_upload: {
          ...uploadState,
          offset: nextOffset,
          last_chunk_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    }).eq("id", asset.id);
    await succeedJob(admin, job, { mode: "gemini_chunk_uploaded", offset, next_offset: nextOffset, size });
    await enqueue(admin, job.version_id, "upload_pdf_chunk", 20, { asset_id: asset.id, offset: nextOffset, size }, asset.id);
    return;
  }

  const uploaded = await upload.json();
  const file = uploaded.file ?? uploaded;
  if (!file?.name) throw new Error("Gemini final upload response missing file name");
  await admin.from("storage_assets").update({
    metadata: {
      ...metadata,
      gemini_upload: {
        ...uploadState,
        offset: size,
        status: "finalizing",
        file,
        finalized_at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  }).eq("id", asset.id);

  await succeedJob(admin, job, { mode: "gemini_upload_finalized", size, file_name: file.name });
  await enqueue(admin, job.version_id, "upload_pdf_chunk", 20, {
    asset_id: asset.id,
    offset: size,
    size,
    status: "finalizing",
  }, asset.id);
}

// -------- Stage 2a.2: merge all PDF text batches ----------------------------
async function stageMergeText(admin: SupabaseClient, job: any) {
  const input = job.input ?? {};
  const expectedPages = Number(input.page_count ?? 0);
  const mergeAttempt = Number(input.__merge_attempt ?? 0);

  const [{ data: failedPages }, { data: waitingPages }, { data: units }] = await Promise.all([
    admin.from("processing_jobs")
      .select("id, error, input, attempts, max_attempts")
      .eq("version_id", job.version_id)
      .eq("kind", "extract_page")
      .eq("status", "failed"),
    admin.from("processing_jobs")
      .select("id, status, attempts, max_attempts, updated_at, next_run_at, input")
      .eq("version_id", job.version_id)
      .eq("kind", "extract_page")
      .in("status", ["pending", "running", "retrying"]),
    admin.from("knowledge_units")
      .select("id, ordinal, page_from, page_to, content_text")
      .eq("version_id", job.version_id)
      .eq("kind", "page")
      .eq("metadata->>extraction_stage", "pdf_page_text")
      .order("ordinal"),
  ]);

  if (waitingPages?.length) {
    const now = Date.now();
    const staleRunning = waitingPages.filter((page: any) =>
      page.status === "running" && Date.parse(String(page.updated_at ?? page.next_run_at ?? "")) < now - 3 * 60_000
    );
    if (staleRunning.length) {
      const staleIds = staleRunning.map((page: any) => page.id).filter(Boolean);
      await admin.from("processing_jobs").update({
        status: "retrying",
        error: "انقطع نبض استخراج صفحة PDF؛ تمت إعادة الجدولة تلقائياً",
        finished_at: new Date().toISOString(),
        next_run_at: new Date(now + 15_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).in("id", staleIds);
    }
    throw new RequeueStageError("merge_text waiting for page extraction", 20_000, {
      waiting: waitingPages.length,
      stale_requeued: staleRunning.length,
      extracted_batches: units?.length ?? 0,
    });
  }

  // Auto-recover once before hard-failing the whole book. Never switch medium
  // PDFs back to Gemini File API here; that was the loop that kept reintroducing
  // quota failures after the OpenRouter migration.
  if (failedPages?.length && mergeAttempt < 1) {
    for (const fp of failedPages) {
      const fpInput = (fp as any).input ?? {};
      const wasGemini = fpInput.extractor === "gemini_file" || !!fpInput.gemini_file?.uri;
        await enqueue(admin, job.version_id, "extract_page", 21, {
        ...fpInput,
        extractor: "local_pdfjs",
        gemini_file: null,
        __retry_of: (fp as any).id,
        __retry_extractor_before: wasGemini ? "gemini_file" : String(fpInput.extractor ?? "local_pdfjs"),
      }, job.asset_id, EXTRACT_PAGE_MAX_ATTEMPTS);
    }
    await log(admin, job.id, "warn", "merge_text auto-retrying failed page batches with alternate extractor", {
      retried: failedPages.length,
    });
    await admin.from("processing_jobs").update({
      status: "pending",
      input: { ...input, __merge_attempt: mergeAttempt + 1 },
      attempts: Math.max(0, Number(job.attempts ?? 1) - 1),
      next_run_at: new Date(Date.now() + 20_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    return;
  }

  // Partial success is a success: never drop a whole book because a few pages
  // failed. Record the failed pages and continue with everything extracted.
  const failedPageRanges = (failedPages ?? []).map((fp: any) => {
    const fpInput = fp?.input ?? {};
    return {
      job_id: fp?.id ?? null,
      page_from: Number(fpInput.page_from ?? fpInput.page_no ?? 0) || null,
      page_to: Number(fpInput.page_to ?? fpInput.page_from ?? 0) || null,
      error: String(fp?.error ?? "").slice(0, 400),
    };
  });

  if (failedPageRanges.length) {
    await log(admin, job.id, "warn", "merge_text continuing with partial extraction", {
      failed_batches: failedPageRanges.length,
      extracted_batches: units?.length ?? 0,
    });
  }

  await admin.from("knowledge_source_versions").update({
    failed_pages: failedPageRanges,
    pipeline_health: failedPageRanges.length ? "partial" : "ready",
    updated_at: new Date().toISOString(),
  }).eq("id", job.version_id);
  await refreshVersionPageCounters(admin, job.version_id);

  const text = (units ?? [])
    .map((u: any) => String(u.content_text ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (text.length < 200) {
    throw new Error("تعذر تجميع نص PDF كامل بعد استخراج الصفحات؛ النص الناتج فارغ أو قصير جداً.");
  }

  await admin.from("knowledge_source_versions").update({
    extracted_text: text,
    extracted_language: guessLang(text),
    page_count: expectedPages || null,
    progress_pct: 40,
    error_message: null,
  }).eq("id", job.version_id);


  await succeedJob(admin, job, { chars: text.length, page_count: expectedPages, batches: units?.length ?? 0, mode: "pdf_merged_full_text" });
  await enqueue(admin, job.version_id, "structure", 30, { chars: text.length, page_count: expectedPages }, job.asset_id);
}

// -------- Stage 2b: OCR --------------------------------------------------------
async function stageOcr(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "ocr", 25);
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for OCR");
  const mime = asset?.mime_type ?? "application/octet-stream";
  if (mime === "application/pdf") {
    await queuePdfTextBatches(admin, job, asset);
    return;
  }
  const text = await ocrAsset(admin, asset, mime);
  await admin.from("knowledge_source_versions").update({
    extracted_text: text, extracted_language: guessLang(text), progress_pct: 40,
  }).eq("id", job.version_id);
  await succeedJob(admin, job, { chars: text.length, source: "ocr" });
  await enqueue(admin, job.version_id, "structure", 30, { chars: text.length }, job.asset_id);
}

// -------- Stage 3: structure analysis via LLM -------------------------------
async function stageStructure(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "structure_analysis", 55);
  const { data: version } = await admin.from("knowledge_source_versions")
    .select("id, source_id, extracted_text").eq("id", job.version_id).single();
  const text = version?.extracted_text ?? "";
  if (!text.trim()) throw new Error("no extracted text");

  const units = await analyzeStructure(admin, text);
  await admin.from("knowledge_units")
    .delete()
    .eq("version_id", job.version_id)
    .neq("kind", "page");
  const rows = units.map((u: any, idx: number) => ({
    version_id: job.version_id,
    parent_id: null,
    kind: normalizeUnitKind(u.kind),
    title: u.title ?? null,
    ordinal: idx,
    page_from: u.page_from ?? null,
    page_to: u.page_to ?? null,
    content_text: u.content ?? null,
    language: u.language ?? guessLang(u.content ?? ""),
    word_count: (u.content ?? "").split(/\s+/).filter(Boolean).length,
    confidence: u.confidence ?? 0.85,
    metadata: { source_type: u.metadata?.source_type ?? null, full_text_chunk: u.metadata?.full_text_chunk ?? false },
  }));
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("knowledge_units").insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  }
  const lessons = await rebuildLessonIndex(admin, job.version_id, version!.source_id);
  await succeedJob(admin, job, { units: rows.length, preserved_full_text: true, lesson_index: lessons });
  await enqueue(admin, job.version_id, "chunk", 40, {}, job.asset_id);
}


// -------- Lesson index (query understanding: "اشرح الدرس الخامس") -----------
const ARABIC_ORDINALS: Record<string, number> = {
  "الاول": 1, "الأول": 1, "اول": 1, "أول": 1,
  "الثاني": 2, "الثانى": 2, "ثاني": 2,
  "الثالث": 3, "ثالث": 3,
  "الرابع": 4, "رابع": 4,
  "الخامس": 5, "خامس": 5,
  "السادس": 6, "سادس": 6,
  "السابع": 7, "سابع": 7,
  "الثامن": 8, "ثامن": 8,
  "التاسع": 9, "تاسع": 9,
  "العاشر": 10, "عاشر": 10,
  "الحادي عشر": 11, "الحادى عشر": 11,
  "الثاني عشر": 12, "الثانى عشر": 12,
  "الثالث عشر": 13,
  "الرابع عشر": 14,
  "الخامس عشر": 15,
};

function normalizeArabicText(value: string): string {
  return String(value || "")
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads "الدرس الخامس" / "الوحدة 3" / "الفصل الثاني" out of a title. */
function parseCurriculumTitle(rawTitle: string): { kind: string; lessonNumber: number | null; unitNumber: number | null } {
  const title = normalizeArabicText(rawTitle);
  const numberAfter = (keyword: string): number | null => {
    const re = new RegExp(`${keyword}\\s*(?:رقم\\s*)?([0-9]{1,2}|[^0-9]{2,14}?)(?=\\s|:|-|$)`);
    const match = title.match(re);
    if (!match) return null;
    const token = match[1].trim();
    if (/^[0-9]+$/.test(token)) return Number(token);
    const ordinal = ARABIC_ORDINALS[token] ?? ARABIC_ORDINALS[token.replace(/^ال/, "")] ?? null;
    return ordinal ?? null;
  };

  const lessonNumber = /درس/.test(title) ? numberAfter("الدرس") ?? numberAfter("درس") : null;
  const unitNumber = /وحده|وحدة|باب|فصل/.test(title)
    ? numberAfter("الوحده") ?? numberAfter("وحده") ?? numberAfter("الباب") ?? numberAfter("باب") ?? numberAfter("الفصل") ?? numberAfter("فصل")
    : null;

  const kind = lessonNumber !== null || /درس/.test(title)
    ? "lesson"
    : /وحده|وحدة/.test(title)
      ? "unit"
      : /باب|فصل/.test(title)
        ? "chapter"
        : "section";

  return { kind, lessonNumber, unitNumber };
}

/**
 * Builds the lesson/unit index for a version straight from the detected unit
 * titles — no extra AI call, no extra credits.
 */
async function rebuildLessonIndex(admin: SupabaseClient, versionId: string, sourceId: string): Promise<number> {
  const { data: units } = await admin.from("knowledge_units")
    .select("id, kind, title, ordinal, page_from, page_to")
    .eq("version_id", versionId)
    .neq("kind", "page")
    .order("ordinal");

  await admin.from("knowledge_lesson_index").delete().eq("version_id", versionId);

  const rows: any[] = [];
  let currentUnitNumber: number | null = null;
  let lessonCounter = 0;

  for (const unit of units ?? []) {
    const title = String(unit.title || "").trim();
    if (!title || title.startsWith("مقطع نصي")) continue;
    const parsed = parseCurriculumTitle(title);
    if (parsed.unitNumber !== null) currentUnitNumber = parsed.unitNumber;
    let lessonNumber = parsed.lessonNumber;
    if (parsed.kind === "lesson") {
      lessonCounter = lessonNumber ?? lessonCounter + 1;
      lessonNumber = lessonCounter;
    }
    rows.push({
      source_id: sourceId,
      version_id: versionId,
      unit_id: unit.id,
      kind: parsed.kind,
      unit_number: currentUnitNumber,
      lesson_number: lessonNumber,
      title,
      normalized_title: normalizeArabicText(title),
      page_start: unit.page_from ?? null,
      page_end: unit.page_to ?? null,
      ordinal: Number(unit.ordinal ?? rows.length),
    });
  }

  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("knowledge_lesson_index").insert(rows.slice(i, i + 200));
    if (error) {
      console.warn("[modrek:warn] lesson index insert failed", error.message);
      return 0;
    }
  }
  return rows.length;
}

// -------- Stage 4: chunk (units -> content_chunks) --------------------------
async function stageChunk(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "knowledge_extraction", 70);
  const { data: units } = await admin.from("knowledge_units")
    .select("id, content_text, page_from, page_to").eq("version_id", job.version_id).order("ordinal");
  await admin.from("content_chunks").delete().eq("version_id", job.version_id);
  const { data: version } = await admin.from("knowledge_source_versions")
    .select("source_id").eq("id", job.version_id).single();
  // Curriculum scope + lesson coordinates travel with every chunk so retrieval
  // can filter strictly by the student's grade / track / section / subject.
  const { data: source } = await admin.from("knowledge_sources")
    .select("id, stage_id, grade_id, section_id, track_id, subject_id, sub_subject_id, term, title")
    .eq("id", version!.source_id).maybeSingle();
  const { data: lessonIndex } = await admin.from("knowledge_lesson_index")
    .select("unit_id, kind, unit_number, lesson_number, title, page_start, page_end")
    .eq("version_id", job.version_id);
  const lessonByUnit = new Map<string, any>();
  for (const row of lessonIndex ?? []) {
    if (row.unit_id) lessonByUnit.set(String(row.unit_id), row);
  }
  const scopeMetadata = {
    stage_id: source?.stage_id ?? null,
    grade_id: source?.grade_id ?? null,
    section_id: source?.section_id ?? null,
    track_id: source?.track_id ?? null,
    subject_id: source?.subject_id ?? null,
    sub_subject_id: source?.sub_subject_id ?? null,
    term: source?.term ?? null,
    source_title: source?.title ?? null,
  };
  const chunks: any[] = [];
  let ord = 0;
  for (const u of units ?? []) {
    const pieces = splitText(u.content_text ?? "", 900, 100);
    const lesson = lessonByUnit.get(String(u.id));
    for (const p of pieces) {
      chunks.push({
        source_id: version!.source_id, version_id: job.version_id, unit_id: u.id,
        ordinal: ord++, content: p, token_count: Math.ceil(p.length / 4),
        metadata: {
          ...scopeMetadata,
          unit_number: lesson?.unit_number ?? null,
          lesson_number: lesson?.lesson_number ?? null,
          lesson_title: lesson?.title ?? null,
          page_from: u.page_from ?? lesson?.page_start ?? null,
          page_to: u.page_to ?? lesson?.page_end ?? null,
        },
      });
    }
    if (ord > 0 && ord % 250 === 0) {
      await updateJobProgress(admin, job, Math.min(95, 20 + Math.floor((ord / Math.max(1, ord + 250)) * 70)), {
        stage: "chunking",
        chunks_created: ord,
      });
    }
  }
  if (chunks.length) {
    // batch insert
    for (let i = 0; i < chunks.length; i += 500) {
      const batch = chunks.slice(i, i + 500);
      const { error } = await admin.from("content_chunks").insert(batch);
      if (error) throw error;
    }
  }
  await succeedJob(admin, job, { chunks: chunks.length });
  await enqueue(admin, job.version_id, "embed", 50, {}, job.asset_id);
}

// -------- Stage 5: embed via Lovable AI ------------------------------------
async function stageEmbed(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "embedding", 85);
  const { data: chunks } = await admin.from("content_chunks")
    .select("id, content").eq("version_id", job.version_id).is("embedding", null).order("ordinal");
  if (!chunks?.length) {
    await succeedJob(admin, job, { embedded: 0 });
    await enqueue(admin, job.version_id, "index", 60, {}, job.asset_id);
    return;
  }
  const { data: model } = await admin.from("ai_models").select("id").eq("code", EMBED_MODEL).maybeSingle();
  const modelId = model?.id ?? null;
  const BATCH = 48;
  let done = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const inputs = batch.map((c) => c.content.slice(0, 8000));
    const embeddings = await embedTexts(admin, inputs);
    const rows = batch
      .map((chunk, k) => ({ id: chunk.id, embedding: embeddings[k] }))
      .filter((row) => Array.isArray(row.embedding) && row.embedding.length > 0);
    if (rows.length) {
      const { data: updated, error } = await admin.rpc("modrek_bulk_set_embeddings", {
        p_rows: rows,
        p_model_id: modelId,
      });
      if (error) throw error;
      done += Number(updated ?? rows.length);
    }
    const pct = 85 + Math.floor((10 * (i + batch.length)) / chunks.length);
    await updateJobProgress(admin, job, Math.min(95, pct), { stage: "embedding", embedded: done, total: chunks.length });
    await admin.from("knowledge_source_versions").update({ progress_pct: Math.min(95, pct), updated_at: new Date().toISOString() }).eq("id", job.version_id);
  }
  await succeedJob(admin, job, { embedded: done, total: chunks.length });
  await enqueue(admin, job.version_id, "index", 60, {}, job.asset_id);
}

// -------- Stage 6: index (finalize) ----------------------------------------
async function stageIndex(admin: SupabaseClient, job: any) {
  await admin.from("knowledge_source_versions").update({
    pipeline_stage: "completed", progress_pct: 100,
    pipeline_completed_at: new Date().toISOString(), error_message: null,
  }).eq("id", job.version_id);
  const { data: version } = await admin.from("knowledge_source_versions")
    .select("source_id").eq("id", job.version_id).single();
  await admin.from("knowledge_sources").update({ status: "ready" }).eq("id", version!.source_id);
  await succeedJob(admin, job, { finalized: true });
}

// ---------- helpers ---------------------------------------------------------

async function fetchAssetBytes(admin: SupabaseClient, asset: any): Promise<Uint8Array> {
  const provider = (asset?.storage_provider ?? "").toLowerCase();
  if (provider !== "bunny") {
    throw new Error(`Modrek library only supports Bunny storage. Got provider='${provider}' for asset ${asset?.id}`);
  }
  if (!BUNNY_API_KEY || !BUNNY_ZONE) throw new Error("bunny storage env missing on worker");
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${asset.object_path}`;
  const r = await fetchWithTimeout(url, { headers: { AccessKey: BUNNY_API_KEY } }, AI_REQUEST_TIMEOUT_MS);
  if (!r.ok) throw new Error(`bunny download failed ${r.status} for ${asset.object_path}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function extractTextForAsset(admin: SupabaseClient, job: any, asset: any, mime: string) {
  const bytes = await fetchAssetBytes(admin, asset);
  if (mime === "text/plain") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth: any = await import("npm:mammoth@1.7.2");
    const res = await mammoth.extractRawText({ buffer: bytes });
    return res.value ?? "";
  }
  if (mime === "application/pdf") {
    const localText = await extractTextFromPdfBytes(bytes);
    if (localText.trim().length >= 200) return localText;

    const byteSize = Number(asset.byte_size ?? bytes.byteLength ?? 0);
    if (byteSize > DIRECT_AI_FILE_LIMIT_BYTES) {
      await log(admin, job.id, "error", "PDF text extraction requires OCR/source text; refusing placeholder completion", {
        bytes: byteSize,
        limit: DIRECT_AI_FILE_LIMIT_BYTES,
      });
      throw new Error("تعذر استخراج النص الكامل من ملف PDF كبير داخل المهلة الحالية. لن يتم وضع نص مختصر بدل الكتاب؛ أعد رفع نسخة PDF نصية أو شغّل OCR خارجي ثم أعد المحاولة.");
    }

    try {
      const aiText = await geminiExtractFromBytes(admin, bytes, mime, asset.original_filename);
      if (aiText.trim().length >= 200) return aiText;
      await log(admin, job.id, "warn", "AI PDF extraction returned too little text", { chars: aiText.trim().length });
    } catch (e: any) {
      await log(admin, job.id, "warn", "AI PDF extraction failed", { error: e?.message ?? String(e) });
    }
    throw new Error("تعذر استخراج النص الكامل من ملف PDF. لن يتم اعتماد نص مختصر أو بديل؛ يرجى رفع ملف PDF نصي واضح أو صورة/ملف أصغر ثم إعادة المرحلة.");
  }
  if (mime.startsWith("image/") || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    try {
      const aiText = await geminiExtractFromBytes(admin, bytes, mime, asset.original_filename);
      if (aiText.trim().length >= 20) return aiText;
    } catch (e: any) {
      await log(admin, job.id, "warn", "AI file extraction failed", { error: e?.message ?? String(e) });
    }
    throw new Error("تعذر استخراج نص كامل من هذا الملف. لم يتم إنشاء نص بديل مختصر حتى لا تفقد الدروس.");
  }
  try { return new TextDecoder("utf-8").decode(bytes); } catch { return ""; }
}

// ---------------------------------------------------------------------------
// PDF planning — LOCAL FIRST, for every book size.
//
// Old behaviour (root cause of the 402 storm): books above 15MB skipped local
// parsing entirely and were pushed to the paid Gemini File API, and every page
// job re-downloaded the whole book. Now:
//   1. page count is resolved locally through unpdf -> pdf-lib -> raw byte scan
//   2. big books are split ONCE into ~10-page part files in Bunny
//   3. each extraction job reads only its own part, locally, with no LLM call
//   4. OCR (the only paid step) runs per single page, and only for pages that
//      genuinely have no text layer
// ---------------------------------------------------------------------------
async function queuePdfTextBatches(admin: SupabaseClient, job: any, asset: any) {
  const byteSize = Number(asset.byte_size ?? 0);
  const scanned = !!asset?.metadata?.is_scanned;

  const bytes = await fetchAssetBytes(admin, asset);
  const parserAttempts: any[] = [];
  const { pageCount, parser } = await resolvePdfPageCount(
    bytes,
    [
      { name: "unpdf", run: (b) => withTimeout(getPdfPageCount(b), 35_000, "unpdf page-count timeout") },
      { name: "pdf-lib", run: (b) => withTimeout(getPdfPageCountWithPdfLib(b), 35_000, "pdf-lib page-count timeout") },
    ],
    (info) => {
      parserAttempts.push(info);
    },
  );

  await log(admin, job.id, "info", "pdf_page_count_resolved", {
    bytes: byteSize,
    page_count: pageCount,
    parser,
    attempts: parserAttempts,
  });

  await admin.from("knowledge_units")
    .delete()
    .eq("version_id", job.version_id)
    .eq("kind", "page")
    .eq("metadata->>extraction_stage", "pdf_page_text");

  await admin.from("knowledge_source_versions").update({
    page_count: pageCount,
    pages_total: pageCount,
    pages_processed: 0,
    pages_failed: 0,
    pipeline_health: "processing",
    extracted_text: null,
    extracted_language: null,
    progress_pct: 28,
    error_message: null,
  }).eq("id", job.version_id);

  const shouldSplit = pageCount > PDF_SPLIT_MIN_PAGES || byteSize > PDF_SPLIT_MIN_BYTES;

  if (shouldSplit) {
    const parts = planPdfParts(pageCount, PDF_PART_PAGES);
    await admin.from("knowledge_pdf_parts").upsert(
      parts.map((p) => ({
        version_id: job.version_id,
        asset_id: asset.id,
        part_index: p.partIndex,
        page_from: p.pageFrom,
        page_to: p.pageTo,
        status: "pending",
      })),
      { onConflict: "version_id,part_index" },
    );
    await enqueue(admin, job.version_id, "split_pdf", 20, {
      asset_id: asset.id,
      page_count: pageCount,
      next_part: 0,
      total_parts: parts.length,
      scanned,
    }, asset.id, 4);
    await succeedJob(admin, job, {
      mode: "pdf_split_planned",
      page_count: pageCount,
      parts: parts.length,
      part_pages: PDF_PART_PAGES,
      parser,
      bytes: byteSize,
    });
    return;
  }

  // Small books: extract directly from the original file, still fully local.
  const batches = planPageBatches(pageCount, { scanned, maxPagesPerBatch: PDF_PART_PAGES });
  for (const batch of batches) {
    await enqueue(admin, job.version_id, "extract_page", 21, {
      asset_id: asset.id,
      page_from: batch.pageFrom,
      page_to: batch.pageTo,
      page_count: pageCount,
      extractor: "local_pdfjs",
      gemini_file: null,
      filename: asset.original_filename,
    }, asset.id, EXTRACT_PAGE_MAX_ATTEMPTS);
  }
  await enqueue(admin, job.version_id, "merge_text", 29, {
    asset_id: asset.id,
    page_count: pageCount,
    batches: batches.length,
  }, asset.id);
  await succeedJob(admin, job, {
    mode: "pdf_paged_extraction",
    page_count: pageCount,
    batches: batches.length,
    parser,
    bytes: byteSize,
  });
}

// -------- Stage 2a.2: split a large PDF into small part files ---------------
// Loads the source once per invocation, writes up to PARTS_PER_SPLIT_INVOCATION
// part files to Bunny, then requeues itself for the remaining parts. Resumable:
// progress lives in knowledge_pdf_parts, so a crash/reload continues where it
// stopped instead of restarting the book.
async function stageSplitPdf(admin: SupabaseClient, job: any) {
  const input = job.input ?? {};
  const pageCount = Number(input.page_count ?? 0);
  const scanned = !!input.scanned;
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for PDF split");

  const { data: parts } = await admin.from("knowledge_pdf_parts")
    .select("id, part_index, page_from, page_to, status, object_path")
    .eq("version_id", job.version_id)
    .order("part_index");

  const pending = (parts ?? []).filter((p: any) => p.status !== "ready" || !p.object_path);
  await setVersionStage(
    admin,
    job.version_id,
    "text_extraction",
    Math.min(30, 25 + Math.floor((((parts?.length ?? 1) - pending.length) / Math.max(1, parts?.length ?? 1)) * 5)),
  );

  if (!pending.length) {
    await enqueue(admin, job.version_id, "merge_text", 29, {
      asset_id: asset.id,
      page_count: pageCount,
      batches: parts?.length ?? 0,
    }, asset.id);
    await succeedJob(admin, job, { mode: "pdf_split_completed", parts: parts?.length ?? 0 });
    return;
  }

  const bytes = await fetchAssetBytes(admin, asset);
  const slice = pending.slice(0, PARTS_PER_SPLIT_INVOCATION);
  let created = 0;

  for (const part of slice) {
    try {
      const partBytes = await withTimeout(
        createPdfPageSubset(bytes, part.page_from, part.page_to),
        45_000,
        `تعذر تجهيز جزء الكتاب ${part.page_from}-${part.page_to} خلال المهلة`,
      );
      const objectPath = `${asset.object_path}.parts/part-${String(part.part_index).padStart(4, "0")}.pdf`;
      await uploadBytesToBunny(objectPath, partBytes);
      await admin.from("knowledge_pdf_parts").update({
        object_path: objectPath,
        byte_size: partBytes.byteLength,
        status: "ready",
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("id", part.id);

      await enqueue(admin, job.version_id, "extract_page", 21, {
        asset_id: asset.id,
        page_from: part.page_from,
        page_to: part.page_to,
        page_count: pageCount,
        extractor: "local_pdfjs",
        gemini_file: null,
        part_path: objectPath,
        part_page_from: part.page_from,
        scanned,
        filename: asset.original_filename,
      }, asset.id, EXTRACT_PAGE_MAX_ATTEMPTS);
      created++;
    } catch (err: any) {
      const diag = classifyPipelineError(err, "pdf_split");
      await admin.from("knowledge_pdf_parts").update({
        status: "failed",
        error_message: `${diag.category}: ${diag.message}`.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", part.id);
      await log(admin, job.id, "warn", "pdf_part_split_failed", {
        part_index: part.part_index,
        page_from: part.page_from,
        page_to: part.page_to,
        category: diag.category,
        error: diag.message,
      });
      // A failed part must never kill the book: extract it straight from the
      // original file instead, and keep going.
      await enqueue(admin, job.version_id, "extract_page", 21, {
        asset_id: asset.id,
        page_from: part.page_from,
        page_to: part.page_to,
        page_count: pageCount,
        extractor: "local_pdfjs",
        gemini_file: null,
        scanned,
        filename: asset.original_filename,
      }, asset.id, EXTRACT_PAGE_MAX_ATTEMPTS);
    }
  }

  const remaining = pending.length - slice.length;
  if (remaining > 0) {
    await admin.from("processing_jobs").update({
      status: "pending",
      input: { ...input, next_part: Number(input.next_part ?? 0) + slice.length },
      attempts: Math.max(0, Number(job.attempts ?? 1) - 1),
      next_run_at: new Date(Date.now() + 3_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    await log(admin, job.id, "info", "pdf_split_progress", {
      created_parts: created,
      remaining_parts: remaining,
    });
    return;
  }

  await enqueue(admin, job.version_id, "merge_text", 29, {
    asset_id: asset.id,
    page_count: pageCount,
    batches: parts?.length ?? 0,
  }, asset.id);
  await succeedJob(admin, job, { mode: "pdf_split_completed", parts: parts?.length ?? 0, created_parts: created });
}

async function uploadBytesToBunny(objectPath: string, bytes: Uint8Array) {
  if (!BUNNY_API_KEY || !BUNNY_ZONE) throw new Error("bunny storage env missing on worker");
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${objectPath}`;
  const r = await fetchWithTimeout(url, {
    method: "PUT",
    headers: { AccessKey: BUNNY_API_KEY, "Content-Type": "application/pdf" },
    body: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!r.ok && r.status !== 201) {
    throw new Error(`bunny part upload failed ${r.status} for ${objectPath}`);
  }
}

async function fetchBunnyObject(objectPath: string): Promise<Uint8Array> {
  if (!BUNNY_API_KEY || !BUNNY_ZONE) throw new Error("bunny storage env missing on worker");
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${objectPath}`;
  const r = await fetchWithTimeout(url, { headers: { AccessKey: BUNNY_API_KEY } }, AI_REQUEST_TIMEOUT_MS);
  if (!r.ok) throw new Error(`bunny download failed ${r.status} for ${objectPath}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function getPdfPageCountWithPdfLib(bytes: Uint8Array): Promise<number> {
  const { PDFDocument }: any = await import("npm:pdf-lib@1.17.1");
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return Number(doc.getPageCount() ?? 0);
}


async function ocrAsset(admin: SupabaseClient, asset: any, mime: string) {
  const bytes = await fetchAssetBytes(admin, asset);
  return await geminiExtractFromBytes(admin, bytes, mime, asset.original_filename, /*ocr*/ true);
}

async function geminiExtractFromBytes(admin: SupabaseClient, bin: Uint8Array, mime: string, filename: string, ocr = false, maxOutputTokens?: number): Promise<string> {
  const b64 = base64Encode(bin);
  const prompt = ocr
    ? "قم بتنفيذ OCR كامل لهذا الملف مع الحفاظ على ترتيب الصفحات والجداول والمعادلات والأسئلة متعددة الاختيار. أعد النص فقط بدون تعليق."
    : "استخرج كل النص من هذا الملف مع الحفاظ على ترتيب الصفحات والفقرات والعناوين والجداول والمعادلات. أعد النص الخام فقط.";
  const content: any[] = [{ type: "text", text: prompt }];
  if (mime.startsWith("image/")) {
    content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
  } else {
    content.push({ type: "file", file: { filename, file_data: `data:${mime};base64,${b64}` } });
  }
  const jr = await runChatCompletion(admin, {
    model: ocr ? VISION_MODEL : STRUCTURE_MODEL,
    messages: [{ role: "user", content }],
    // Always send an explicit, small output budget. Providers price the request
    // as (input + max_tokens); an implicit 65k default is what triggered 402.
    max_tokens: maxOutputTokens ?? outputTokenBudgetForPages(1),
  });
  return jr.choices?.[0]?.message?.content ?? "";
}

type GeminiFileRef = { name?: string; uri: string; mime_type?: string; state?: string; uploaded_at?: string };

async function startGeminiChunkedUpload(admin: SupabaseClient, job: any, asset: any) {
  const existingUpload = asset?.metadata?.gemini_upload;
  if (existingUpload?.upload_url && Number(existingUpload?.offset ?? 0) < Number(asset.byte_size ?? 0)) {
    await log(admin, job.id, "info", "resuming existing Gemini chunked upload", {
      asset_id: asset.id,
      offset: existingUpload.offset ?? 0,
      size: asset.byte_size,
    });
    return;
  }

  const apiKey = resolveGoogleGeminiApiKey();
  if (!apiKey) {
    throw new Error("لا يوجد مفتاح Gemini مفعّل في الخادم لمعالجة ملفات PDF الكبيرة/المصورة دون تحميلها بالكامل في الذاكرة");
  }
  if (!BUNNY_API_KEY || !BUNNY_ZONE) throw new Error("bunny storage env missing on worker");

  const mime = asset.mime_type || "application/pdf";
  const size = Number(asset.byte_size ?? 0);
  const start = await fetchWithTimeout(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mime,
    },
    body: JSON.stringify({ file: { display_name: asset.original_filename || `modrek-${asset.id}` } }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!start.ok) throw new Error(`Gemini file upload start failed ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return an upload URL");

  await admin.from("storage_assets").update({
    metadata: {
      ...(asset.metadata ?? {}),
      gemini_upload: {
        upload_url: uploadUrl,
        offset: 0,
        size,
        chunk_size: GEMINI_UPLOAD_CHUNK_BYTES,
        mime,
        status: "uploading",
        started_at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  }).eq("id", asset.id);
  await log(admin, job.id, "info", "Gemini chunked upload session started", {
    asset_id: asset.id,
    filename: asset.original_filename,
    bytes: size,
    chunk_bytes: GEMINI_UPLOAD_CHUNK_BYTES,
  });
}

async function ensureGeminiFileForAsset(admin: SupabaseClient, asset: any, jobId?: string): Promise<GeminiFileRef> {
  const existing = asset?.metadata?.gemini_file;
  if (existing?.uri && existing?.name) return existing;

  const apiKey = resolveGoogleGeminiApiKey();
  if (!apiKey) {
    throw new Error("لا يوجد مفتاح Gemini مفعّل في الخادم لمعالجة ملفات PDF الكبيرة/المصورة دون تحميلها بالكامل في الذاكرة");
  }
  if (!BUNNY_API_KEY || !BUNNY_ZONE) throw new Error("bunny storage env missing on worker");

  await describeFileApiRoute(admin, jobId, { asset_id: asset.id });
  await log(admin, jobId, "info", "starting Gemini File API upload", {
    asset_id: asset.id,
    filename: asset.original_filename,
    bytes: Number(asset.byte_size ?? 0),
    mime: asset.mime_type,
  });

  const mime = asset.mime_type || "application/pdf";
  const size = Number(asset.byte_size ?? 0);
  const start = await fetchWithTimeout(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mime,
    },
    body: JSON.stringify({ file: { display_name: asset.original_filename || `modrek-${asset.id}` } }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!start.ok) throw new Error(`Gemini file upload start failed ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini did not return an upload URL");

  const bunnyUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${asset.object_path}`;
  const source = await fetchWithTimeout(bunnyUrl, { headers: { AccessKey: BUNNY_API_KEY } }, AI_REQUEST_TIMEOUT_MS);
  if (!source.ok || !source.body) throw new Error(`bunny download stream failed ${source.status} for Gemini upload`);

  const upload = await fetchWithTimeout(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: source.body,
  }, FILE_API_TIMEOUT_MS);
  if (!upload.ok) throw new Error(`Gemini file upload failed ${upload.status}: ${(await upload.text()).slice(0, 300)}`);
  const uploaded = await upload.json();
  const file = uploaded.file ?? uploaded;
  const active = await waitForGeminiFileActive(apiKey, file);
  const geminiFile = buildGeminiFileRef(active, mime);

  await storeGeminiFileRef(admin, asset, geminiFile);
  await log(admin, jobId, "info", "Gemini File API upload ready", { asset_id: asset.id, file_name: geminiFile.name, state: geminiFile.state });
  return geminiFile;
}

function buildGeminiFileRef(file: any, fallbackMime: string): GeminiFileRef {
  return {
    name: file.name,
    uri: file.uri,
    mime_type: file.mimeType ?? fallbackMime,
    state: file.state,
    uploaded_at: new Date().toISOString(),
  };
}

async function storeGeminiFileRef(admin: SupabaseClient, asset: any, geminiFile: GeminiFileRef) {
  const { gemini_upload: _upload, ...restMetadata } = asset.metadata ?? {};
  const { data, error } = await admin.from("storage_assets").update({
    metadata: { ...restMetadata, gemini_file: geminiFile },
    updated_at: new Date().toISOString(),
  }).eq("id", asset.id).select("*").single();
  if (error) throw error;
  return data;
}

async function waitForGeminiFileActive(apiKey: string, file: any): Promise<any> {
  const active = await waitForGeminiFileActiveSlice(apiKey, file, 95_000);
  if (active) return active;
  throw new Error("انتهت مهلة تجهيز ملف PDF لدى Gemini File API");
}

async function waitForGeminiFileActiveSlice(apiKey: string, file: any, timeoutMs: number): Promise<any | null> {
  let current = file;
  const name = String(file?.name ?? "");
  if (!name) throw new Error("Gemini file response missing name");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (current.state === "ACTIVE" || !current.state) return current;
    if (current.state === "FAILED") throw new Error("Gemini failed to process uploaded PDF file");
    await delay(2500);
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`, { method: "GET" }, AI_REQUEST_TIMEOUT_MS);
    if (!res.ok) throw new Error(`Gemini file status failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    current = await res.json();
  }
  return null;
}

async function getPdfPageCountFromGeminiFile(admin: SupabaseClient, file: GeminiFileRef, asset: any): Promise<number> {
  let raw: any;
  try {
    raw = await generateWithGeminiFile(admin, file, asset, "أعد JSON فقط بالشكل {\"page_count\": number}. المطلوب: عدد صفحات ملف PDF فقط بدون أي شرح.", true, 512);
  } catch {
    raw = await generateWithGeminiFile(admin, file, asset, "ما عدد صفحات ملف PDF؟ أعد رقماً واحداً فقط بدون أي كلمات.", false, 64);
  }
  const n = Number(raw?.page_count ?? raw?.pages ?? String(raw ?? "").match(/\d{1,5}/)?.[0] ?? 0);
  if (!Number.isFinite(n) || n < 1) throw new Error("Gemini did not return a valid PDF page count");
  return Math.floor(n);
}

async function extractPdfPageRangeWithGeminiFile(admin: SupabaseClient, file: GeminiFileRef, asset: any, pageFrom: number, pageTo: number): Promise<string> {
  const prompt = `استخرج النص الكامل حرفياً من ملف PDF للصفحات من ${pageFrom} إلى ${pageTo} فقط.
لا تختصر، لا تلخص، لا تضف شرحاً، لا تتخطى الجداول أو الأسئلة أو الاختيارات أو المعادلات.
إذا كانت الصفحات صوراً، نفّذ OCR كامل. أعد النص الخام فقط مع فواصل صفحات واضحة.`;
  const text = await generateWithGeminiFile(admin, file, asset, prompt, false, PDF_EXTRACT_MAX_OUTPUT_TOKENS, PDF_PAGE_EXTRACT_TIMEOUT_MS);
  const out = String(text ?? "").trim();
  if (out.length < Math.max(20, (pageTo - pageFrom + 1) * 10)) {
    throw new Error(`Gemini OCR/text extraction returned too little text for pages ${pageFrom}-${pageTo}`);
  }
  return out;
}

async function generateWithGeminiFile(admin: SupabaseClient, file: GeminiFileRef, asset: any, prompt: string, jsonMode: boolean, maxOutputTokens: number, timeoutMs: number = AI_REQUEST_TIMEOUT_MS): Promise<any> {
  const apiKey = resolveGoogleGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING_FOR_FILE_PROCESSING");
  const model = STRUCTURE_MODEL.replace(/^google\//, "");
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { fileData: { mimeType: file.mime_type ?? asset.mime_type ?? "application/pdf", fileUri: file.uri } },
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  }, timeoutMs);
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const errorText = await response.text().catch(() => "");
    const message = `Gemini file generation failed ${response.status}${retryAfter ? ` retry-after=${retryAfter}` : ""}: ${errorText.slice(0, 1200)}`;
    throw new Error(message);
  }
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  if (!jsonMode) return text;
  try { return JSON.parse(text || "{}"); } catch { throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`); }
}

async function analyzeStructure(admin: SupabaseClient, text: string): Promise<any[]> {
  const chunks = splitText(text, FULL_TEXT_CHUNK_SIZE, FULL_TEXT_CHUNK_OVERLAP);
  const titleUnits = await detectOutlineUnits(admin, text).catch((e) => {
    console.warn("outline detection failed; preserving full text chunks only", e?.message ?? e);
    return [];
  });
  const fullTextUnits = chunks.map((content, idx) => ({
    kind: "paragraph",
    title: `مقطع نصي ${idx + 1}`,
    content,
    page_from: null,
    page_to: null,
    language: guessLang(content),
    confidence: 0.9,
    metadata: { full_text_chunk: true },
  }));
  return [...titleUnits, ...fullTextUnits];
}

async function detectOutlineUnits(admin: SupabaseClient, text: string): Promise<any[]> {
  const excerpt = text.slice(0, 45000);
  const prompt = `حلل فهرس/عناوين المصدر التعليمي فقط من النص التالي، ولا تُعد صياغة محتوى الدروس ولا تختصرها.
أعد JSON فقط بهذا الشكل:
{"units": [{"kind":"chapter|unit|lesson|section|heading","title":"...","content":"...","page_from":null,"page_to":null,"language":"ar|en","confidence":0.0-1.0}]}
النص:
"""${excerpt}"""`;
  const jr = await runChatCompletion(admin, {
    model: STRUCTURE_MODEL,
    messages: [
      { role: "system", content: "أعد JSON صالحًا فقط بدون شرح. استخرج العناوين الهيكلية فقط." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const raw = jr.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.units) ? parsed.units.slice(0, 80) : [];
}

async function runChatCompletion(admin: SupabaseClient, body: Record<string, unknown>) {
  const requestedModel = String(body.model ?? STRUCTURE_MODEL);
  // Key comes ONLY from the unified AI Provider Layer (active provider).
  const { apiKey: providerKey } = await resolveOpenRouterApiKey(admin);
  if (!providerKey) {
    throw new Error("AI_PROVIDER_KEY_MISSING: لا يوجد مفتاح للمزود النشط لمعالجة مكتبة Modrek AI");
  }

  const orModel = requestedModel.includes("/") ? requestedModel : `google/${requestedModel.replace(/^google\//, "")}`;
  const orBody = { ...body, model: orModel };
  const orResult = await callGeminiWithFallback({
    apiKey: providerKey,
    models: [orModel, STRUCTURE_MODEL, "google/gemini-2.5-flash-lite"],
    body: orBody,
    timeoutMs: 90_000,
  });
  if (orResult.ok) return await orResult.response.json();

  throw new Error(`openrouter failed ${orResult.status}: ${(orResult.lastError ?? "").slice(0, 700)}`);
}

async function embedTexts(admin: SupabaseClient, inputs: string[]): Promise<number[][]> {
  // Embeddings go through the unified AI Provider Layer (active provider only).
  const r = await aiEmbeddings({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS, timeoutMs: AI_REQUEST_TIMEOUT_MS });
  if (!r.ok) throw new Error(`ai_embed_failed ${r.status}: ${String(r.error || "").slice(0, 300)}`);
  return ((r.data as any)?.data ?? []).map((item: any) => item.embedding).filter(Boolean);
}

function splitText(t: string, size = 900, overlap = 100): string[] {
  const clean = (t ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}


function normalizeUnitKind(kind: string): string {
  const allowed = new Set(["unit", "chapter", "lesson", "section", "page", "question", "model_answer", "glossary", "other", "part", "paragraph", "heading", "definition", "formula", "example", "exercise", "note", "objective", "table", "figure", "image", "equation", "answer"]);
  return allowed.has(kind) ? kind : "paragraph";
}

async function loadPdfProxy(bytes: Uint8Array): Promise<any> {
  return await getDocumentProxy(bytes.slice());
}

async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  try {
    const pdf: any = await withTimeout(loadPdfProxy(bytes), 30_000, "pdf document load timeout");
    const pages: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page: any = await withTimeout(pdf.getPage(pageNo), 12_000, `pdf page ${pageNo} load timeout`);
      const content: any = await withTimeout(page.getTextContent({ includeMarkedContent: false }), 12_000, `pdf page ${pageNo} text timeout`);
      const lines = (content.items ?? [])
        .map((item: any) => String(item?.str ?? "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (lines) pages.push(`--- صفحة ${pageNo} ---\n${lines}`);
      page.cleanup?.();
    }
    await pdf.destroy?.();
    const parsed = pages.join("\n\n").trim();
    if (parsed.length >= 200) return parsed;
  } catch (e: any) {
    console.warn("pdf extraction failed; trying literal PDF text", e?.message ?? e);
  }

  const raw = new TextDecoder("latin1").decode(bytes);
  const parts: string[] = [];
  const literalTextPattern = /\((?:\\.|[^\\()])*\)\s*T[jJ]/g;
  const arrayTextPattern = /\[(.*?)\]\s*TJ/gs;
  for (const match of raw.matchAll(literalTextPattern)) {
    const token = match[0].replace(/\s*T[jJ]\s*$/, "");
    parts.push(decodePdfLiteral(token));
  }
  for (const match of raw.matchAll(arrayTextPattern)) {
    const inner = match[1] ?? "";
    for (const textMatch of inner.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
      parts.push(decodePdfLiteral(textMatch[0]));
    }
  }
  return parts
    .join("\n")
    .split("")
    .map((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) ? " " : char;
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf: any = await withTimeout(loadPdfProxy(bytes), 30_000, "pdf page-count timeout");
  const count = Number(pdf.numPages ?? 0);
  await pdf.destroy?.();
  return count;
}

async function extractPdfPagesFromBytes(
  bytes: Uint8Array,
  pageFrom: number,
  pageTo: number,
  onPage?: (pageNo: number) => Promise<void>,
): Promise<{ pageNo: number; text: string }[]> {
  const pdf: any = await withTimeout(loadPdfProxy(bytes), 30_000, "pdf page-range load timeout");
  const pages: { pageNo: number; text: string }[] = [];
  const lastPage = Math.min(Number(pdf.numPages ?? pageTo), pageTo);
  for (let pageNo = pageFrom; pageNo <= lastPage; pageNo += 1) {
    const page: any = await withTimeout(pdf.getPage(pageNo), 12_000, `pdf page ${pageNo} load timeout`);
    const content: any = await withTimeout(page.getTextContent({ includeMarkedContent: false }), 12_000, `pdf page ${pageNo} text timeout`);
    const text = (content.items ?? [])
      .map((item: any) => String(item?.str ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ pageNo, text });
    page.cleanup?.();
    await onPage?.(pageNo);
  }
  await pdf.destroy?.();
  return pages;
}

async function createPdfPageSubset(bytes: Uint8Array, pageFrom: number, pageTo: number): Promise<Uint8Array> {
  const { PDFDocument }: any = await import("npm:pdf-lib@1.17.1");
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const indices: number[] = [];
  const total = src.getPageCount();
  for (let pageNo = pageFrom; pageNo <= Math.min(pageTo, total); pageNo += 1) {
    indices.push(pageNo - 1);
  }
  const copied = await out.copyPages(src, indices);
  copied.forEach((page: any) => out.addPage(page));
  return await out.save({ useObjectStreams: false });
}

function decodePdfLiteral(token: string): string {
  const body = token.startsWith("(") && token.endsWith(")") ? token.slice(1, -1) : token;
  const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
  return body
    .replace(/\\([nrtbf()\\])/g, (_m, ch: string) => escapes[ch] ?? ch)
    .replace(/\\([0-7]{1,3})/g, (_m, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\\r?\n/g, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    const message = String(e?.message ?? e ?? "");
    if (message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout")) {
      throw new Error(`request timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function recoverTransientModrekJobs(admin: SupabaseClient) {
  const { data: jobs } = await admin
    .from("processing_jobs")
    .select("id, source_id, version_id, error, kind")
    .in("status", ["failed", "retrying"] as any)
    .or("error.ilike.%modrek_enqueue_stage%,error.ilike.%تعذر تحديد عدد صفحات PDF الكبير%,error.ilike.%Module not found%,error.ilike.%unpdf@0.11.0%,error.ilike.%esm.sh/unpdf%")
    .order("updated_at", { ascending: false })
    .limit(50);

  const ids = (jobs ?? []).map((job: any) => job.id).filter(Boolean);
  if (!ids.length) return;

  const now = new Date().toISOString();
  await admin.from("processing_jobs").update({
    status: "pending",
    error: null,
    attempts: 0,
    next_run_at: now,
    started_at: null,
    finished_at: null,
    updated_at: now,
  }).in("id", ids);

  const versionIds = Array.from(new Set((jobs ?? []).map((job: any) => job.version_id).filter(Boolean)));
  const sourceIds = Array.from(new Set((jobs ?? []).map((job: any) => job.source_id).filter(Boolean)));
  if (versionIds.length) {
    await admin.from("knowledge_source_versions").update({
      pipeline_stage: "queued",
      error_message: null,
      updated_at: now,
    }).in("id", versionIds);
  }
  if (sourceIds.length) {
    await admin.from("knowledge_sources").update({ status: "processing" }).in("id", sourceIds);
  }

  await admin.rpc("modrek_log_event", {
    p_job_id: ids[0],
    p_level: "warn",
    p_message: "auto-recovered transient Modrek processing jobs",
    p_data: {
      recovered_jobs: ids.length,
      reason: "function signature/page-count/PDF parser transient failure after deployment",
      job_ids: ids.slice(0, 20),
      memory: memorySnapshot(),
      at: now,
    },
  });
}

/**
 * Provider says the account cannot pay for the request (HTTP 402). This is a
 * TERMINAL error: retrying burns nothing but time and keeps failing, so we stop
 * the whole version instead of hammering the gateway 30 times per page.
 */
function isInsufficientCreditsError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "402",
    "requires more credits",
    "more credits",
    "can only afford",
    "insufficient credit",
    "insufficient_credits",
    "payment required",
    "add credits",
  ].some((token) => msg.includes(token));
}

function isRateLimitError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "429",
    "quota",
    "rate limit",
    "rate-limit",
    "resource_exhausted",
    "resource exhausted",
    "too many requests",
    "too many",
    "requests per minute",
    "requests per day",
    "quota exceeded",
  ].some((token) => msg.includes(token));
}

function isQuotaExhaustedError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "exceeded your current quota",
    "check your plan and billing",
    "quota exhausted",
    "quota_exceeded",
    "resource_exhausted",
    "resource exhausted",
    "billing details",
    "quota exceeded",
    "quotaexceeded",
    "requests per day",
    "free quota",
    "daily quota",
    "current quota",
  ].some((token) => msg.includes(token));
}

function buildFailureDiagnostic(error: unknown, job: any): FailureDiagnostic {
  const err = error instanceof Error ? error : new Error(String(error ?? "unknown error"));
  const rawMessage = String(err.message || "unknown error");
  const lower = rawMessage.toLowerCase();
  const stack = String(err.stack || "");
  const frame = stack.split("\n").find((line) => line.includes("index.ts:")) || "";
  const lineMatch = frame.match(/index\.ts:(\d+):(\d+)/);
  const fnMatch = frame.match(/at\s+([^\s(]+)/);
  const functionName = fnMatch?.[1]?.replace(/^async\s+/, "") || String(job?.kind || "modrek-worker");
  const lineNumber = lineMatch?.[1] ? Number(lineMatch[1]) : null;

  let category: FailureDiagnostic["category"] = "unknown";
  if (isInsufficientCreditsError(err)) category = "insufficient_credits";
  else if (isQuotaExhaustedError(err)) category = "quota_exhausted";
  else if (isRateLimitError(err)) category = "rate_limit";
  else if (lower.includes("timeout") || lower.includes("مهلة")) category = "timeout";
  else if (lower.includes("gemini") || lower.includes("openrouter") || lower.includes("ai gateway") || lower.includes("generation failed")) category = "provider";
  else if (lower.includes("bunny") || lower.includes("storage")) category = "storage";
  else if (lower.includes("database") || lower.includes("violates") || lower.includes("sql") || lower.includes("rpc")) category = "database";

  const input = job?.input ?? {};
  const file = String(input.filename || input.file_name || input.asset_id || job?.asset_id || "unknown-file");
  const pageRange = input.page_from ? ` — الصفحات ${input.page_from}-${input.page_to ?? input.page_from}` : "";
  const retryable = category === "quota_exhausted" || category === "rate_limit" || category === "timeout" || category === "provider";
  const userMessage = category === "insufficient_credits"
    ? `رصيد مزود الذكاء غير كافٍ لإكمال معالجة ${file}${pageRange}. تم إيقاف المعالجة فوراً لحفظ ما تم إنجازه ومنع استهلاك المزيد من الطلبات الفاشلة. أضف رصيداً ثم اضغط «إعادة معالجة الصفحات الفاشلة فقط».`
    : category === "quota_exhausted"
    ? `تم استهلاك الحصة اليومية/الحالية لمزود الذكاء أثناء معالجة ${file}${pageRange}. لن يتم إسقاط الكتاب أو تكرار الفشل على باقي الصفحات؛ تم إيقاف استخراج الصفحات مؤقتاً وسيستأنف تلقائياً بعد عودة الحصة.`
    : category === "rate_limit"
    ? `تم الوصول لحد الحصة/الطلبات لمزود الذكاء أثناء معالجة ${file}${pageRange}. لن يتم إسقاط الكتاب؛ ستتم إعادة المحاولة تلقائياً بتهدئة أبطأ.`
    : category === "timeout"
      ? `انتهت مهلة المعالجة أثناء معالجة ${file}${pageRange}. سيحاول النظام مرة أخرى تلقائياً إذا كانت هناك محاولات متبقية.`
      : category === "provider"
        ? `فشل مزود الذكاء أثناء معالجة ${file}${pageRange}. السبب الخام ظاهر أدناه لتحديد المشكلة بدقة.`
        : category === "storage"
          ? `تعذر قراءة الملف من التخزين أثناء معالجة ${file}${pageRange}. تحقق من وجود الملف ومساره.`
          : category === "database"
            ? `تعذر حفظ نتيجة المعالجة في قاعدة البيانات أثناء معالجة ${file}${pageRange}.`
            : `فشلت مرحلة ${job?.kind ?? "غير معروفة"} أثناء معالجة ${file}${pageRange}.`;

  return {
    category,
    userMessage,
    rawMessage,
    retryable,
    file,
    function: functionName,
    line: lineNumber,
    stack: stack || null,
  };
}

function failureMessage(diagnostic: FailureDiagnostic): string {
  const location = diagnostic.line ? `${diagnostic.file} | ${diagnostic.function}:${diagnostic.line}` : `${diagnostic.file} | ${diagnostic.function}`;
  return `${diagnostic.userMessage}\n\nالسبب الخام: ${diagnostic.rawMessage}\nالموقع: ${location}`;
}

function retryDelayMs(diagnostic: FailureDiagnostic, attempts: number): number {
  if (diagnostic.category === "quota_exhausted") {
    const exponent = Math.min(3, Math.max(0, attempts - 1));
    const base = QUOTA_EXHAUSTED_MIN_BACKOFF_MS * (2 ** exponent);
    return Math.min(QUOTA_EXHAUSTED_MAX_BACKOFF_MS, base) + Math.floor(Math.random() * 5 * 60_000);
  }
  if (diagnostic.category === "rate_limit") {
    const exponent = Math.min(4, Math.max(0, attempts - 1));
    const base = RATE_LIMIT_MIN_BACKOFF_MS * (2 ** exponent);
    return Math.min(RATE_LIMIT_MAX_BACKOFF_MS, base) + Math.floor(Math.random() * 20_000);
  }
  if (diagnostic.category === "timeout" || diagnostic.category === "provider") {
    return Math.min(10 * 60_000, Math.max(30_000, 45_000 * Math.max(1, attempts)));
  }
  return Math.max(5_000, 20_000 * Math.max(1, attempts));
}

function parseTimestamp(value: unknown): number | null {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : null;
}

async function respectProviderCooldown(admin: SupabaseClient, job: any) {
  const { data } = await admin
    .from("processing_events")
    .select("data, created_at")
    .eq("data->>provider", "gemini_file_api")
    .in("data->>category", ["quota_exhausted", "rate_limit"] as any)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const until = parseTimestamp((data as any)?.data?.global_cooldown_until);
  if (until && until > Date.now()) {
    const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
    await updateJobProgress(admin, job, Math.max(1, Number(job.progress_pct ?? 1)), {
      stage: "provider_cooldown",
      provider: "gemini_file_api",
      cooldown_until: new Date(until).toISOString(),
      remaining_minutes: minutes,
    });
    throw new Error(`Gemini provider cooldown active until ${new Date(until).toISOString()} (${minutes} minutes remaining)`);
  }
}

async function applyProviderCooldown(admin: SupabaseClient, job: any, diagnostic: FailureDiagnostic, cooldownUntil: string, effectiveMaxAttempts: number, message: string) {
  if (diagnostic.category !== "quota_exhausted" && diagnostic.category !== "rate_limit") return;
  await admin
    .from("processing_jobs")
    .update({
      next_run_at: cooldownUntil,
      max_attempts: effectiveMaxAttempts,
      updated_at: new Date().toISOString(),
      error: message,
    })
    .eq("kind", "extract_page")
    .in("status", ["pending", "retrying"] as any);

  await admin.rpc("modrek_log_event", {
    p_job_id: job.id,
    p_level: "warn",
    p_message: diagnostic.category === "quota_exhausted"
      ? "global Gemini File API quota cooldown activated"
      : "global Gemini File API rate-limit cooldown activated",
    p_data: {
      ...diagnostic,
      provider: "gemini_file_api",
      global_cooldown_until: cooldownUntil,
      max_attempts: effectiveMaxAttempts,
      memory: memorySnapshot(),
      at: new Date().toISOString(),
    },
  });
}

async function fetchBunnyRange(asset: any, start: number, end: number): Promise<Uint8Array> {
  if (!BUNNY_API_KEY || !BUNNY_ZONE) throw new Error("bunny storage env missing on worker");
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${asset.object_path}`;
  const r = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      AccessKey: BUNNY_API_KEY,
      Range: `bytes=${start}-${end}`,
    },
  }, AI_REQUEST_TIMEOUT_MS);
  if (!(r.ok || r.status === 206)) throw new Error(`bunny range download failed ${r.status} for ${asset.object_path}`);
  return new Uint8Array(await r.arrayBuffer());
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function memorySnapshot() {
  try {
    const m = (Deno as any).memoryUsage?.();
    if (!m) return null;
    return {
      rss_mb: Math.round((m.rss ?? 0) / 1024 / 1024),
      heap_used_mb: Math.round((m.heapUsed ?? 0) / 1024 / 1024),
      heap_total_mb: Math.round((m.heapTotal ?? 0) / 1024 / 1024),
      external_mb: Math.round((m.external ?? 0) / 1024 / 1024),
    };
  } catch { return null; }
}

function guessLang(t: string): string {
  const s = t.slice(0, 2000);
  const ar = (s.match(/[\u0600-\u06FF]/g) ?? []).length;
  const en = (s.match(/[A-Za-z]/g) ?? []).length;
  return ar >= en ? "ar" : "en";
}


function base64Encode(bytes: Uint8Array): string {
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

async function enqueue(admin: SupabaseClient, versionId: string, kind: string, stageOrder: number, input: any, assetId?: string, maxAttempts?: number) {
  const params: Record<string, any> = {
    p_version_id: versionId, p_kind: kind, p_stage_order: stageOrder,
    p_input: input, p_asset_id: assetId ?? null,
  };
  const primary = await admin.rpc("modrek_enqueue_stage", params);
  if (!primary.error) {
    if (primary.data && maxAttempts) {
      await admin.from("processing_jobs").update({
        max_attempts: maxAttempts,
        updated_at: new Date().toISOString(),
      }).eq("id", primary.data);
    }
    return primary.data;
  }

  const errorMessage = String(primary.error.message || "");
  const canUseExtendedSignature = (
    errorMessage.includes("modrek_enqueue_stage") ||
    errorMessage.includes("function") ||
    errorMessage.includes("schema cache") ||
    errorMessage.includes("Could not find") ||
    errorMessage.includes("not found")
  );

  if (canUseExtendedSignature) {
    const fallback = await admin.rpc("modrek_enqueue_stage", {
      ...params,
      p_max_attempts: maxAttempts ?? null,
    });
    if (!fallback.error) {
      if (fallback.data && maxAttempts) {
        await admin.from("processing_jobs").update({
          max_attempts: maxAttempts,
          updated_at: new Date().toISOString(),
        }).eq("id", fallback.data);
      }
      await log(admin, fallback.data ?? null, "warn", "modrek_enqueue_stage extended signature fallback used", {
        kind,
        version_id: versionId,
        original_error: errorMessage.slice(0, 500),
        max_attempts: maxAttempts ?? null,
      });
      return fallback.data;
    }
  }

  {
    throw new Error(`failed to enqueue ${kind}: ${primary.error.message}`);
  }
}

async function succeedJob(admin: SupabaseClient, job: any, output: any) {
  await admin.from("processing_jobs").update({
    status: "succeeded", finished_at: new Date().toISOString(), output, progress_pct: 100, updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  await log(admin, job.id, "info", `stage succeeded: ${job.kind}`, output);
}

async function requeueJob(admin: SupabaseClient, job: any, delayMs: number, output: Record<string, unknown> = {}) {
  const delay = Math.max(5_000, Math.min(5 * 60_000, delayMs));
  await admin.from("processing_jobs").update({
    status: "pending",
    attempts: Math.max(0, Number(job.attempts ?? 1) - 1),
    next_run_at: new Date(Date.now() + delay).toISOString(),
    finished_at: null,
    output: { ...(job.output ?? {}), waiting: { ...output, at: new Date().toISOString(), memory: memorySnapshot() } },
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  await log(admin, job.id, "info", `stage requeued: ${job.kind}`, { delay_ms: delay, ...output });
}

async function failJob(admin: SupabaseClient, job: any, err: unknown) {
  const attempts = (job.attempts ?? 0);
  const diagnostic = buildFailureDiagnostic(err, job);
  const effectiveMaxAttempts = job.kind === "extract_page"
    ? Math.max(Number(job.max_attempts ?? 0), EXTRACT_PAGE_MAX_ATTEMPTS)
    : Number(job.max_attempts ?? 3);
  const canRetry = diagnostic.retryable && attempts < effectiveMaxAttempts;
  const nextRunAt = canRetry ? new Date(Date.now() + retryDelayMs(diagnostic, attempts)).toISOString() : null;
  const message = failureMessage(diagnostic);
  if (canRetry && nextRunAt) {
    await applyProviderCooldown(admin, job, diagnostic, nextRunAt, effectiveMaxAttempts, message);
  }
  await admin.from("processing_jobs").update({
    status: canRetry ? "retrying" : "failed",
    finished_at: new Date().toISOString(), error: message,
    max_attempts: effectiveMaxAttempts,
    next_run_at: nextRunAt,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  await log(admin, job.id, canRetry ? "warn" : "error", `stage failed: ${job.kind} (attempt ${attempts})`, {
    ...diagnostic,
    attempts,
    max_attempts: effectiveMaxAttempts,
    next_run_at: nextRunAt,
  });

  const structured = classifyPipelineError(err, job.kind);

  if (job.kind === "extract_page") {
    const input = job.input ?? {};
    const pageFrom = Number(input.page_from ?? input.page_no ?? 0);
    const pageTo = Number(input.page_to ?? pageFrom);
    if (pageFrom > 0) {
      await markPagesState(admin, job.version_id, pageFrom, pageTo, {
        extraction_status: canRetry ? "pending" : "failed",
        error_category: structured.category,
        error_message: `${structured.category}: ${structured.message}`.slice(0, 500),
      }, /*bumpRetry*/ true);
      await refreshVersionPageCounters(admin, job.version_id);
    }
  }

  if (diagnostic.category === "insufficient_credits") {
    await applyCreditBlock(admin, job, message);
    return;
  }

  if (canRetry) {
    await admin.from("knowledge_source_versions").update({
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq("id", job.version_id);
    return;
  }

  // A single exhausted page (or one failed part) must NEVER fail the whole
  // book: merge_text records it in failed_pages and finishes the rest. Only
  // whole-book stages can mark the version as failed.
  if (job.kind === "extract_page" || job.kind === "split_pdf") {
    await admin.from("knowledge_source_versions").update({
      pipeline_health: "partial",
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq("id", job.version_id);
    await log(admin, job.id, "warn", "page-level failure recorded; book continues", {
      category: structured.category,
      page_from: (job.input ?? {}).page_from ?? null,
      page_to: (job.input ?? {}).page_to ?? null,
      retry_count: attempts,
    });
    return;
  }

  await admin.from("knowledge_source_versions").update({
    pipeline_stage: "failed", error_message: message, pipeline_health: "failed",
  }).eq("id", job.version_id);
  const { data: v } = await admin.from("knowledge_source_versions")
    .select("source_id").eq("id", job.version_id).single();
  if (v) await admin.from("knowledge_sources").update({ status: "failed" }).eq("id", v.source_id);
}


/**
 * Circuit breaker for provider credit exhaustion: freeze the whole version,
 * cancel every queued job for it, and keep all work already done. One 402 must
 * never turn into hundreds of paid-but-failing retries.
 */
async function applyCreditBlock(admin: SupabaseClient, job: any, message: string) {
  const nowIso = new Date().toISOString();
  await admin.from("knowledge_source_versions").update({
    credits_blocked_at: nowIso,
    credits_blocked_reason: message.slice(0, 1000),
    error_message: message,
    updated_at: nowIso,
  }).eq("id", job.version_id);

  const { data: cancelled } = await admin.from("processing_jobs")
    .update({
      status: "cancelled",
      error: "تم الإيقاف تلقائياً: رصيد مزود الذكاء غير كافٍ",
      finished_at: nowIso,
      next_run_at: null,
      updated_at: nowIso,
    })
    .eq("version_id", job.version_id)
    .in("status", ["pending", "running", "retrying"] as any)
    .neq("id", job.id)
    .select("id");

  await log(admin, job.id, "error", "processing paused: insufficient AI provider credits", {
    cancelled_jobs: cancelled?.length ?? 0,
    version_id: job.version_id,
  });
}

/** Is this version frozen by the credit circuit breaker? */
async function isVersionCreditBlocked(admin: SupabaseClient, versionId: string): Promise<boolean> {
  if (!versionId) return false;
  const { data } = await admin.from("knowledge_source_versions")
    .select("credits_blocked_at").eq("id", versionId).maybeSingle();
  return !!data?.credits_blocked_at;
}

/** Per-page pipeline state so the developer can resume / retry failed pages only. */
async function markPagesState(
  admin: SupabaseClient,
  versionId: string,
  pageFrom: number,
  pageTo: number,
  patch: Record<string, unknown>,
  _bumpRetry = false,
) {
  if (!versionId || !pageFrom) return;
  const rows: any[] = [];
  const last = Math.max(pageFrom, pageTo || pageFrom);
  for (let page = pageFrom; page <= last && page - pageFrom < 64; page++) {
    rows.push({ version_id: versionId, page_number: page, page_to: last, ...patch });
  }
  if (!rows.length) return;
  const { error } = await admin
    .from("knowledge_page_state")
    .upsert(rows, { onConflict: "version_id,page_number" });
  if (error) {
    console.warn("[modrek:warn] page state upsert failed", error.message);
    return;
  }
}

async function setVersionStage(admin: SupabaseClient, versionId: string, stage: string, pct: number) {
  await admin.from("knowledge_source_versions").update({
    pipeline_stage: stage, progress_pct: pct, updated_at: new Date().toISOString(),
  }).eq("id", versionId);
}

async function updateJobProgress(admin: SupabaseClient, job: any, pct: number, data: any = {}) {
  await admin.from("processing_jobs").update({
    progress_pct: Math.max(0, Math.min(99, Math.round(pct))),
    updated_at: new Date().toISOString(),
    output: { ...(job.output ?? {}), heartbeat: { ...data, memory: memorySnapshot(), at: new Date().toISOString() } },
  }).eq("id", job.id);
}

async function log(admin: SupabaseClient, jobId: string | null | undefined, level: string, message: string, data: any = {}) {
  if (!jobId) {
    console.warn(`[modrek:${level}] ${message}`, data);
    return;
  }
  await admin.rpc("modrek_log_event", { p_job_id: jobId, p_level: level, p_message: message, p_data: { ...data, memory: memorySnapshot(), at: new Date().toISOString() } });
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function scheduleNextWorkerRun() {
  const run = fetch(`${SUPABASE_URL}/functions/v1/modrek-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: "{}",
  }).catch((e) => console.warn("modrek worker chain failed", e?.message ?? e));
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(run);
}
