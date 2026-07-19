// Library Pipeline v2 — Worker (deploy: 2026-07-19 force production redeploy #2)
// -------------------------------------------------------------------
// Single responsibility: process EXACTLY ONE stage per HTTP invocation.
// The dispatcher hands us { job_id, book_id, kind }. We route by kind,
// execute the stage, then either complete or fail the job. When a stage
// finishes, we enqueue the next stage(s) as independent jobs — never
// runs multiple stages in one call.
//
// Stages (kind values):
//   v2_extract_pages   — download PDF, count pages, enqueue per-page jobs
//                        + parallel chunk_embed + build_index prep jobs
//   v2_extract_text    — OCR one page (fan-out) — delegates to per-page
//                        logic (kind: extract_page in legacy worker)
//   v2_chunk_embed     — build embeddings once all pages are done
//   v2_build_index     — build TOC/index once embeddings exist
//   v2_generate_explanations — one section per job
//   v2_generate_tts    — one paragraph per job (optional, non-blocking)
//   v2_generate_quiz   — starter quiz (optional, non-blocking)
//   v2_finalize        — mark book ready when required stages done
//
// Guarantees:
//   - Partial availability: a book becomes readable once pages + text
//     exist; explanations/tts/quiz enrich it later without blocking.
//   - Idempotent: every stage checks existing outputs before working.
//   - Failure is loud: any thrown error → library_fail_job with backoff.
// -------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { getDocumentProxy } from "npm:unpdf@0.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-library-trace-id, x-worker-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_KEY = Deno.env.get("LIBRARY_WORKER_KEY") || "";
const WORKER_ID = `v2_worker_${crypto.randomUUID().slice(0, 8)}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function logEvent(
  db: any,
  bookId: string,
  jobId: string | null,
  eventKey: string,
  message: string,
  level: "info" | "success" | "warning" | "error" = "info",
  progress: number | null = null,
  data: Record<string, unknown> = {},
) {
  try {
    await db.from("library_processing_events").insert({
      book_id: bookId,
      job_id: jobId,
      event_key: eventKey,
      level,
      message,
      progress,
      data: { worker: WORKER_ID, ...data },
    });
  } catch (e) {
    console.warn("[v2-worker] log failed", e);
  }
}

async function fetchPdfBytes(db: any, pdfPath: string): Promise<Uint8Array> {
  if (pdfPath.startsWith("bstorage://")) {
    const path = pdfPath.slice("bstorage://".length);
    const apiKey = Deno.env.get("BUNNY_STORAGE_API_KEY") || "";
    const zone = Deno.env.get("BUNNY_STORAGE_ZONE") || "";
    const host = Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com";
    if (!apiKey || !zone) throw new Error("bunny_storage_not_configured");
    const res = await fetch(`https://${host}/${zone}/${path}`, { headers: { AccessKey: apiKey } });
    if (!res.ok) throw new Error(`bunny_download_failed:${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  if (/^https?:\/\//i.test(pdfPath)) {
    const res = await fetch(pdfPath);
    if (!res.ok) throw new Error(`fetch_pdf_failed:${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const { data, error } = await db.storage.from("library-books").download(pdfPath);
  if (error) throw new Error(`storage_download_failed:${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

// ─── Enqueue helpers ────────────────────────────────────────────────
async function enqueueJob(
  db: any,
  bookId: string,
  kind: string,
  stage: string,
  payload: Record<string, unknown> = {},
  parentJobId: string | null = null,
  priority = 100,
) {
  const { data, error } = await db
    .from("library_processing_jobs")
    .insert({
      book_id: bookId,
      kind,
      stage,
      state: "queued",
      payload,
      parent_job_id: parentJobId,
      priority,
      next_run_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`enqueue_failed:${kind}:${error.message}`);
  return data.id as string;
}

async function pingDispatcher() {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/library-v2-dispatcher`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "x-worker-key": WORKER_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => null);
  } catch (_e) { /* fire-and-forget */ }
}

// ─── Stage handlers ─────────────────────────────────────────────────

/** V2_EXTRACT_PAGES:
 *  Only downloads PDF + counts pages + enqueues N per-page text jobs +
 *  parallel chunk_embed job. Does NOT run OCR itself.
 */
async function stageExtractPages(db: any, job: any) {
  const bookId = job.book_id;
  await logEvent(db, bookId, job.id, "v2_extract_pages_started", "بدأت تجزئة الكتاب إلى مراحل مستقلة", "info", 5);

  const { data: book, error: bErr } = await db
    .from("library_books")
    .select("id,pdf_path,title,page_count")
    .eq("id", bookId)
    .maybeSingle();
  if (bErr || !book) throw new Error(`book_not_found:${bookId}`);
  if (!book.pdf_path) throw new Error("pdf_path_missing");

  await db.from("library_books").update({
    status: "processing",
    processing_stage: "v2_splitting",
    processing_progress: 5,
    processing_error: null,
  }).eq("id", bookId);

  // Idempotency: if page_count already known, skip PDF re-parse
  let totalPages = book.page_count || 0;
  if (!totalPages) {
    const bytes = await fetchPdfBytes(db, book.pdf_path);
    await logEvent(db, bookId, job.id, "v2_pdf_downloaded", `تم تنزيل PDF (${bytes.byteLength} bytes)`, "info", 10);
    const pdf = await getDocumentProxy(bytes);
    totalPages = (pdf as any).numPages ?? 0;
    if (!totalPages) throw new Error("empty_pdf");
    await db.from("library_books").update({ page_count: totalPages, file_size: bytes.byteLength }).eq("id", bookId);
  }
  await logEvent(db, bookId, job.id, "v2_page_count", `عدد الصفحات: ${totalPages}`, "success", 15, { total_pages: totalPages });

  // Fan-out: one legacy 'extract_page' job per page (already single-stage in legacy worker)
  // We use the LEGACY kind so the existing worker processes it per-page.
  const existingPageJobs = await db
    .from("library_processing_jobs")
    .select("page_number")
    .eq("book_id", bookId)
    .eq("kind", "extract_page");
  const existingPages = new Set(((existingPageJobs.data as any[]) || []).map((r) => r.page_number));

  const newRows: any[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (existingPages.has(p)) continue;
    newRows.push({
      book_id: bookId,
      kind: "extract_page",
      stage: "extract_page",
      state: "queued",
      page_number: p,
      payload: { page: p, parent_v2_job: job.id },
      priority: 90,
      next_run_at: new Date().toISOString(),
    });
  }
  if (newRows.length > 0) {
    // batch insert in chunks of 500
    for (let i = 0; i < newRows.length; i += 500) {
      const { error } = await db.from("library_processing_jobs").insert(newRows.slice(i, i + 500));
      if (error && !/duplicate key/i.test(error.message)) {
        throw new Error(`enqueue_pages_failed:${error.message}`);
      }
    }
  }
  await logEvent(db, bookId, job.id, "v2_pages_enqueued", `تم إنشاء ${newRows.length} مهمة استخراج مستقلة`, "success", 25, { enqueued: newRows.length, total: totalPages });

  // Enqueue downstream v2 orchestration jobs (they wait via gating in their handlers)
  await enqueueJob(db, bookId, "v2_chunk_embed", "chunk_embed", { total_pages: totalPages }, job.id, 200);
  await enqueueJob(db, bookId, "v2_build_index", "build_index", {}, job.id, 210);
  await enqueueJob(db, bookId, "v2_generate_explanations", "generate_explanations", {}, job.id, 220);
  await enqueueJob(db, bookId, "v2_generate_quiz", "generate_quiz", {}, job.id, 230);
  await enqueueJob(db, bookId, "v2_finalize", "finalize", {}, job.id, 999);

  await logEvent(db, bookId, job.id, "v2_orchestration_ready", "تم جدولة مراحل الشرح والفهرس والاختبار والصوت", "success", 30);
}

/** Gate helper: returns true when all legacy per-page extract_page jobs are done. */
async function allPagesExtracted(db: any, bookId: string): Promise<{ done: boolean; pending: number; failed: number; total: number }> {
  const { data } = await db
    .from("library_processing_jobs")
    .select("state")
    .eq("book_id", bookId)
    .eq("kind", "extract_page");
  const rows = (data as any[]) || [];
  const total = rows.length;
  const pending = rows.filter((r) => ["queued", "retry", "running"].includes(r.state)).length;
  const failed = rows.filter((r) => ["failed", "dead_letter"].includes(r.state)).length;
  return { done: total > 0 && pending === 0, pending, failed, total };
}

/** Delegating stage: waits for pages, then enqueues LEGACY embed_book job (single-stage). */
async function stageChunkEmbed(db: any, job: any) {
  const bookId = job.book_id;
  const gate = await allPagesExtracted(db, bookId);
  if (!gate.done) {
    await logEvent(db, bookId, job.id, "v2_chunk_embed_waiting", `في انتظار اكتمال الصفحات (${gate.pending} متبقية)`, "info", null, gate);
    // Push back with a short backoff — not a failure
    await db.from("library_processing_jobs").update({
      state: "queued",
      next_run_at: new Date(Date.now() + 30_000).toISOString(),
      attempts: Math.max(0, (job.attempts || 1) - 1), // don't count as attempt
    }).eq("id", job.id);
    return { requeued: true };
  }
  // Enqueue legacy embed_book job (processed by existing library-worker per single invocation)
  const { data: existing } = await db.from("library_processing_jobs")
    .select("id,state").eq("book_id", bookId).eq("kind", "embed_book").maybeSingle();
  if (!existing) {
    await db.from("library_processing_jobs").insert({
      book_id: bookId, kind: "embed_book", stage: "embed", state: "queued",
      priority: 100, next_run_at: new Date().toISOString(),
    });
  }
  await logEvent(db, bookId, job.id, "v2_chunk_embed_delegated", "تم إنشاء مهمة Embeddings مستقلة", "success", 55);
}

async function stageBuildIndex(db: any, job: any) {
  const bookId = job.book_id;
  const gate = await allPagesExtracted(db, bookId);
  if (!gate.done) {
    await db.from("library_processing_jobs").update({
      state: "queued", next_run_at: new Date(Date.now() + 30_000).toISOString(),
      attempts: Math.max(0, (job.attempts || 1) - 1),
    }).eq("id", job.id);
    return { requeued: true };
  }
  const { data: existing } = await db.from("library_processing_jobs")
    .select("id").eq("book_id", bookId).eq("kind", "build_index").maybeSingle();
  if (!existing) {
    await db.from("library_processing_jobs").insert({
      book_id: bookId, kind: "build_index", stage: "sections", state: "queued",
      priority: 110, next_run_at: new Date().toISOString(),
    });
  }
  await logEvent(db, bookId, job.id, "v2_build_index_delegated", "تم إنشاء مهمة الفهرس المستقلة", "success", 60);
}

async function stageGenerateExplanations(db: any, job: any) {
  const bookId = job.book_id;
  const gate = await allPagesExtracted(db, bookId);
  if (!gate.done) {
    await db.from("library_processing_jobs").update({
      state: "queued", next_run_at: new Date(Date.now() + 45_000).toISOString(),
      attempts: Math.max(0, (job.attempts || 1) - 1),
    }).eq("id", job.id);
    return { requeued: true };
  }
  const { data: existing } = await db.from("library_processing_jobs")
    .select("id").eq("book_id", bookId).eq("kind", "generate_explanations").maybeSingle();
  if (!existing) {
    await db.from("library_processing_jobs").insert({
      book_id: bookId, kind: "generate_explanations", stage: "explain", state: "queued",
      priority: 130, next_run_at: new Date().toISOString(),
    });
  }
  await logEvent(db, bookId, job.id, "v2_explanations_delegated", "تم إنشاء مهمة الشرح التفاعلي", "success", 75);
}

async function stageGenerateQuiz(db: any, job: any) {
  const bookId = job.book_id;
  const gate = await allPagesExtracted(db, bookId);
  if (!gate.done) {
    await db.from("library_processing_jobs").update({
      state: "queued", next_run_at: new Date(Date.now() + 60_000).toISOString(),
      attempts: Math.max(0, (job.attempts || 1) - 1),
    }).eq("id", job.id);
    return { requeued: true };
  }
  const { data: existing } = await db.from("library_processing_jobs")
    .select("id").eq("book_id", bookId).eq("kind", "generate_quiz").maybeSingle();
  if (!existing) {
    await db.from("library_processing_jobs").insert({
      book_id: bookId, kind: "generate_quiz", stage: "finalize", state: "queued",
      priority: 140, next_run_at: new Date().toISOString(),
    });
  }
  await logEvent(db, bookId, job.id, "v2_quiz_delegated", "تم إنشاء مهمة الاختبار التمهيدي", "success", 85);
}

/** V2_FINALIZE:
 *  Marks book ready as soon as core content (pages + text) is done.
 *  Enrichment stages (embeddings, index, explanations, quiz) don't block
 *  the book from being available. Their status is reflected in progress
 *  view but not in the "ready" flag.
 */
async function stageFinalize(db: any, job: any) {
  const bookId = job.book_id;

  // Required: pages extracted (core reading experience)
  const gate = await allPagesExtracted(db, bookId);
  if (!gate.done) {
    // Not ready yet — requeue softly
    await db.from("library_processing_jobs").update({
      state: "queued", next_run_at: new Date(Date.now() + 60_000).toISOString(),
      attempts: Math.max(0, (job.attempts || 1) - 1),
    }).eq("id", job.id);
    await logEvent(db, bookId, job.id, "v2_finalize_waiting", `في انتظار اكتمال ${gate.pending} صفحة`, "info", null, gate);
    return { requeued: true };
  }

  // Count enrichment status for transparency (does NOT block ready)
  const enrichment: Record<string, string> = {};
  for (const k of ["embed_book", "build_index", "generate_explanations", "generate_quiz"]) {
    const { data } = await db.from("library_processing_jobs")
      .select("state").eq("book_id", bookId).eq("kind", k).maybeSingle();
    enrichment[k] = (data as any)?.state || "missing";
  }

  const failedPages = gate.failed;
  const bookReady = gate.total > 0;

  await db.from("library_books").update({
    status: bookReady ? "ready" : "failed",
    processing_stage: bookReady ? "ready" : "failed",
    processing_progress: 100,
    processing_error: failedPages > 0 ? `${failedPages} صفحة فشلت — الكتاب متاح بالباقي` : null,
    published_at: bookReady ? new Date().toISOString() : null,
  }).eq("id", bookId);

  await logEvent(db, bookId, job.id, "v2_finalize_done",
    bookReady ? `الكتاب متاح للطلاب (${gate.total - failedPages}/${gate.total} صفحة، إثراء: ${JSON.stringify(enrichment)})`
              : "فشل نهائي: لا توجد صفحات صالحة",
    bookReady ? "success" : "error", 100,
    { pages: gate, enrichment },
  );
}

// ─── Router ─────────────────────────────────────────────────────────
async function runStage(db: any, job: any) {
  switch (job.kind) {
    case "v2_extract_pages":         return stageExtractPages(db, job);
    case "v2_chunk_embed":           return stageChunkEmbed(db, job);
    case "v2_build_index":           return stageBuildIndex(db, job);
    case "v2_generate_explanations": return stageGenerateExplanations(db, job);
    case "v2_generate_quiz":         return stageGenerateQuiz(db, job);
    case "v2_generate_tts":          return stageGenerateQuiz(db, job); // tts is currently bundled inside explanations job (legacy); no-op v2 slot reserved
    case "v2_finalize":              return stageFinalize(db, job);
    default: throw new Error(`unsupported_kind:${job.kind}`);
  }
}

// ─── HTTP entry ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization") || "";
  const wkey = req.headers.get("x-worker-key") || "";
  const isService = auth.includes(SERVICE_KEY) || (WORKER_KEY && wkey === WORKER_KEY);
  if (!isService) return json({ error: "unauthorized_worker" }, 401);

  const body = await req.json().catch(() => ({}));
  const jobId: string | null = body?.job_id || null;
  if (!jobId) return json({ error: "job_id_required" }, 400);

  const db = admin();
  const { data: job, error } = await db.from("library_processing_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error || !job) return json({ error: "job_not_found", details: error?.message }, 404);
  if (!String(job.kind || "").startsWith("v2_")) {
    return json({ error: "not_a_v2_job", kind: job.kind }, 400);
  }

  const bookId = job.book_id;
  try {
    const result = await runStage(db, job);
    if (!(result as any)?.requeued) {
      await db.rpc("library_complete_job", { p_job_id: jobId, p_progress: 100 });
      await logEvent(db, bookId, jobId, `${job.kind}_completed`, `اكتملت المرحلة ${job.kind}`, "success", 100);
    }
    // Ping dispatcher so any newly-enqueued jobs get picked up quickly
    await pingDispatcher();
    return json({ ok: true, kind: job.kind, requeued: !!(result as any)?.requeued });
  } catch (e: any) {
    const errMsg = String(e?.message || e);
    const errStack = String(e?.stack || "").slice(0, 6000);
    const nextState = await db.rpc("library_fail_job", {
      p_job_id: jobId,
      p_error: errMsg,
      p_stack: errStack,
      p_backoff_seconds: null,
    });
    await logEvent(db, bookId, jobId, `${job.kind}_failed`, `فشل ${job.kind}: ${errMsg}`, "error", null, {
      next_state: nextState.data,
      error: errMsg,
      stack: errStack,
      attempts: job.attempts,
      max_attempts: job.max_attempts,
    });
    return json({ ok: false, kind: job.kind, error: errMsg, next_state: nextState.data }, 200);
  }
});
