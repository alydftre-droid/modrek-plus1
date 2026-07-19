// Library Worker — background processor for library books.
// Invoked periodically by pg_cron (net.http_post). Also invocable manually
// by the admin dashboard to run a single tick immediately after enqueuing.
//
// Job kinds (public.library_processing_jobs.kind):
//   - extract_book: parse PDF → pages + sections
//   - extract_page: re-extract a single page
//   - build_index: LLM-derived TOC (chapters/lessons)
//   - embed_book:  chunk + embed pages/sections/index (RAG)
//   - generate_explanations: pre-cache page explanations so the book opens as interactive content
//   - generate_quiz: pre-generate a starter quiz for the whole book
//
// All AI/embeddings go through OpenRouter exclusively.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getDocumentProxy, extractText } from "https://esm.sh/unpdf@0.11.0";
import {
  loadAiSettings,
  resolveOpenRouterApiKey,
  callGeminiWithFallback,
} from "../_shared/aiSettings.ts";
import {
  openRouterEmbed,
  OPENROUTER_DEFAULT_EMBED_MODEL,
} from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SHARED_KEY = Deno.env.get("LIBRARY_WORKER_KEY") || "";
const WORKER_ID = `worker_${crypto.randomUUID().slice(0, 8)}`;
const EDGE_FUNCTION_NAME = "library-worker";
const EDGE_FILE = "supabase/functions/library-worker/index.ts";

function sanitizeErrorText(value: unknown, max = 3000): string {
  return String(value ?? "").replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]").slice(0, max);
}

function parseStackLocation(stack: string): { file: string; line: number | null } {
  const match = stack.match(/\(([^()]+):(\d+):(\d+)\)|at\s+([^\s()]+):(\d+):(\d+)/);
  const file = match?.[1] || match?.[4] || EDGE_FILE;
  const line = Number(match?.[2] || match?.[5] || 0) || null;
  return { file, line };
}

function errorPayload(err: any, job: any, stage: string, extra: Record<string, unknown> = {}) {
  const stack = sanitizeErrorText(err?.stack || new Error(String(err?.message || err)).stack || "");
  const location = parseStackLocation(stack);
  const attempts = Number(job?.attempts || 0);
  const maxAttempts = Number(job?.max_attempts || 3);
  return {
    edge_function: EDGE_FUNCTION_NAME,
    function: stage,
    file: location.file,
    line: location.line,
    database_function: stage === "claim_library_job" ? "public.claim_library_job" : null,
    error_code: err?.code || err?.name || "processing_error",
    error_message: sanitizeErrorText(err?.message || err),
    stack_trace: stack,
    attempts,
    max_attempts: maxAttempts,
    retry: attempts < maxAttempts,
    worker: WORKER_ID,
    ...extra,
  };
}

function getBunnyStorageConfig() {
  return {
    apiKey: Deno.env.get("BUNNY_STORAGE_API_KEY") || "",
    zone: Deno.env.get("BUNNY_STORAGE_ZONE") || "",
    storageHost: Deno.env.get("BUNNY_STORAGE_HOST") || "storage.bunnycdn.com",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function compactText(value: unknown, max = 2200): string {
  return String(value || "")
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max);
}

function extractJsonObject(raw: string): any | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); }
  catch { return null; }
}

function fallbackExplanation(bookTitle: string, pageNumber: number, text: string): string {
  const clean = compactText(text, 1400);
  if (!clean) {
    return `شرح الصفحة ${pageNumber} من كتاب ${bookTitle}: لم يتم العثور على نص واضح في هذه الصفحة، لذلك يمكن للطالب تكبير الصفحة وقراءة العناصر الظاهرة ثم سؤال المساعد عن أي جزء غير واضح.`;
  }
  return `شرح الصفحة ${pageNumber} من كتاب ${bookTitle}: تتناول هذه الصفحة الأفكار التالية. ${clean}\n\nالخلاصة: اقرأ الفقرة الأساسية أولاً، ثم اربط المصطلحات ببعضها، وإذا ظهر قانون أو تعريف فاحفظ معناه ثم طبقه على مثال بسيط.`;
}

function fallbackQuiz(sourceText: string) {
  const clean = compactText(sourceText, 1600) || "محتوى الكتاب";
  const sentence = clean.split(/[\.؟!\n]/).map((s) => s.trim()).find((s) => s.length > 25) || clean.slice(0, 180);
  return [
    {
      type: "mcq",
      page: 1,
      question: "ما الفكرة الأساسية التي يجب مراجعتها من هذا الجزء؟",
      options: [sentence.slice(0, 120), "معلومة غير مرتبطة بالدرس", "عنوان خارجي عن الكتاب", "إجابة عامة بلا علاقة"],
      correct_index: 0,
      explanation: "الإجابة الصحيحة مأخوذة مباشرة من النص المستخرج من الكتاب.",
    },
  ];
}

async function logLibraryEvent(
  admin: any,
  bookId: string | null | undefined,
  jobId: string | null | undefined,
  eventKey: string,
  message: string,
  level: "debug" | "info" | "warning" | "error" | "success" = "info",
  progress: number | null = null,
  data: Record<string, unknown> = {},
) {
  if (!bookId) return;
  try {
    await admin.rpc("log_library_processing_event", {
      _book_id: bookId,
      _job_id: jobId ?? null,
      _event_key: eventKey,
      _message: message,
      _level: level,
      _progress: progress,
      _data: data,
    });
  } catch (err) {
    console.warn("[library-worker] event log failed", eventKey, err);
  }
}

async function fetchPdfBytes(admin: any, pdfPath: string): Promise<Uint8Array> {
  if (pdfPath.startsWith("bstorage://")) {
    const path = pdfPath.slice("bstorage://".length);
    if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
      throw new Error("invalid_bstorage_path");
    }
    const bunny = getBunnyStorageConfig();
    if (!bunny.apiKey || !bunny.zone) throw new Error("bunny_storage_not_configured");
    const res = await fetch(`https://${bunny.storageHost}/${bunny.zone}/${path}`, {
      headers: { AccessKey: bunny.apiKey },
    });
    if (!res.ok) throw new Error(`bunny_download_failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  if (/^https?:\/\//i.test(pdfPath)) {
    const res = await fetch(pdfPath);
    if (!res.ok) throw new Error(`fetch_pdf_failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  const { data, error } = await admin.storage.from("library-books").download(pdfPath);
  if (error) throw new Error(`storage_download_failed: ${error.message}`);
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

function paragraphSections(pageText: string): string[] {
  return String(pageText || "")
    .split(/\n{2,}|\r\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

// Chunk long page text into ~700-char pieces on sentence/paragraph boundaries.
function chunkPageText(text: string, target = 700, overlap = 80): string[] {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= target * 1.4) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + target);
    if (end < clean.length) {
      const slice = clean.slice(i, end + 200);
      const brk = slice.search(/[\.!\?،]\s/);
      if (brk > target * 0.5) end = i + brk + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks.filter((c) => c.length >= 40);
}

async function processExtractBook(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  const startedAt = Date.now();
  await logLibraryEvent(admin, bookId, job.id, "worker_picked_job", "العامل استلم مهمة معالجة الكتاب", "info", 1, { worker: WORKER_ID, edge_function: EDGE_FUNCTION_NAME, kind: job.kind, attempt: job.attempts });
  await logLibraryEvent(admin, bookId, job.id, "extract_book_started", "بدأت معالجة ملف PDF", "info", 1, { worker: WORKER_ID, edge_function: EDGE_FUNCTION_NAME });
  const { data: book, error: bErr } = await admin
    .from("library_books")
    .select("id,pdf_path,title")
    .eq("id", bookId)
    .maybeSingle();
  if (bErr || !book) throw new Error(`book_not_found:${bookId}`);
  if (!book.pdf_path) throw new Error("pdf_path_missing");

  await admin
    .from("library_books")
    .update({ status: "processing", processing_stage: "processing", processing_progress: 2, processing_error: null })
    .eq("id", bookId);

  await logLibraryEvent(admin, bookId, job.id, "pdf_download_started", "بدأ تنزيل ملف PDF من التخزين", "info", 3, { pdf_path_type: String(book.pdf_path).startsWith("bstorage://") ? "bunny_storage" : "url_or_bucket" });
  const downloadStarted = Date.now();
  const bytes = await fetchPdfBytes(admin, book.pdf_path);
  await logLibraryEvent(admin, bookId, job.id, "pdf_downloaded", "تم تنزيل ملف PDF بنجاح", "info", 5, { bytes: bytes.byteLength, elapsed_ms: Date.now() - downloadStarted });

  await admin
    .from("library_books")
    .update({ processing_stage: "parsing", processing_progress: 5, file_size: bytes.byteLength })
    .eq("id", bookId);

  await logLibraryEvent(admin, bookId, job.id, "pdf_open_started", "بدأ فتح وتحليل ملف PDF", "info", 6, { bytes: bytes.byteLength });
  const parseStarted = Date.now();
  const pdf = await getDocumentProxy(bytes);
  const totalPages: number = (pdf as any).numPages ?? 0;
  if (!totalPages) throw new Error("empty_pdf");
  await logLibraryEvent(admin, bookId, job.id, "page_count_detected", `تم اكتشاف ${totalPages} صفحة داخل الكتاب`, "info", 8, { total_pages: totalPages, elapsed_ms: Date.now() - parseStarted });

  await admin
    .from("library_books")
    .update({ page_count: totalPages, processing_stage: "extracting_text", processing_progress: 8 })
    .eq("id", bookId);

  await logLibraryEvent(admin, bookId, job.id, "ocr_started", "بدأ استخراج النصوص من صفحات PDF", "info", 9, { total_pages: totalPages, engine: "unpdf_text_extract" });
  const ocrStarted = Date.now();
  const { text: perPage } = await extractText(pdf as any, { mergePages: false });
  const pages: string[] = Array.isArray(perPage) ? perPage : [String(perPage || "")];
  await logLibraryEvent(admin, bookId, job.id, "ocr_finished", "انتهى استخراج النصوص من صفحات الكتاب", "success", 10, { extracted_pages: pages.length, total_pages: totalPages, elapsed_ms: Date.now() - ocrStarted });

  const BATCH = 20;
  for (let start = 0; start < totalPages; start += BATCH) {
    const end = Math.min(start + BATCH, totalPages);
    await logLibraryEvent(admin, bookId, job.id, "page_batch_started", `بدأ حفظ الصفحات ${start + 1} إلى ${end}`, "info", Math.min(98, 10 + Math.round((start / totalPages) * 88)), { pages_from: start + 1, pages_to: end, pages_total: totalPages });
    const pageRows = [];
    for (let i = start; i < end; i++) {
      const raw = (pages[i] || "").slice(0, 30000);
      const conf = raw.length >= 40 ? 1 : (raw.length >= 10 ? 0.5 : 0.1);
      const pageNumber = i + 1;
      if (totalPages <= 200 || pageNumber === 1 || pageNumber === totalPages || pageNumber % 5 === 0) {
        await logLibraryEvent(admin, bookId, job.id, "page_extraction_progress", `استخراج الصفحة ${pageNumber} / ${totalPages}`, "info", Math.min(98, 10 + Math.round((pageNumber / totalPages) * 88)), {
          current_page: pageNumber,
          pages_done: pageNumber,
          pages_total: totalPages,
          text_chars: raw.length,
          elapsed_ms: Date.now() - startedAt,
        });
      }
      pageRows.push({
        book_id: bookId,
        page_number: pageNumber,
        ocr_text: raw,
        ocr_confidence: conf,
      });
    }
    const { data: upserted, error: pErr } = await admin
      .from("library_book_pages")
      .upsert(pageRows, { onConflict: "book_id,page_number" })
      .select("id,page_number");
    if (pErr) throw new Error(`page_upsert_failed: ${pErr.message}`);

    const pageIds = (upserted ?? []).map((r: any) => r.id);
    if (pageIds.length) {
      await admin.from("library_book_sections").delete().in("page_id", pageIds);
      const sectionRows: any[] = [];
      for (const row of upserted ?? []) {
        const paras = paragraphSections(pages[(row.page_number as number) - 1] || "");
        paras.forEach((raw, idx) => {
          sectionRows.push({
            book_id: bookId,
            page_id: row.id,
            kind: "paragraph",
            bbox: {},
            order_index: idx,
            raw_text: raw.slice(0, 8000),
          });
        });
      }
      if (sectionRows.length) {
        await admin.from("library_book_sections").insert(sectionRows);
      }
    }

    const progress = Math.min(99, 10 + Math.round((end / totalPages) * 88));
    await Promise.all([
      admin.from("library_books").update({ processing_progress: progress, processing_stage: `page_${end}/${totalPages}` }).eq("id", bookId),
      admin.from("library_processing_jobs").update({ progress, updated_at: new Date().toISOString() }).eq("id", job.id),
    ]);
    await logLibraryEvent(admin, bookId, job.id, "pages_batch_saved", "تم حفظ دفعة من صفحات الكتاب", "info", progress, { pages_done: end, pages_total: totalPages, elapsed_ms: Date.now() - startedAt });
  }

  await admin
    .from("library_books")
    .update({
      status: "processing",
      processing_progress: 92,
      processing_stage: "generating_interactive_content",
      processing_error: null,
    })
    .eq("id", bookId);

  await logLibraryEvent(admin, bookId, job.id, "extraction_completed", "اكتمل استخراج الصفحات وبدأ إنشاء المحتوى التفاعلي", "success", 92, { total_pages: totalPages, elapsed_ms: Date.now() - startedAt });

  // Enqueue follow-up jobs (idempotent — dedup handled by unique/state filters at scheduling time).
  const { error: followupErr } = await admin.from("library_processing_jobs").insert([
    { book_id: bookId, stage: "sections", kind: "build_index", state: "queued", progress: 0 },
    { book_id: bookId, stage: "embed", kind: "embed_book",  state: "queued", progress: 0 },
  ]);
  if (followupErr) throw new Error(`followup_jobs_insert_failed:${followupErr.message}`);
  await logLibraryEvent(admin, bookId, job.id, "interactive_jobs_queued", "تم إنشاء مهام الفهرسة والبحث الذكي", "info", 93, { jobs: ["build_index", "embed_book"], queue_count: 2 });
}

async function processBuildIndex(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  await Promise.all([
    admin.from("library_books").update({ processing_stage: "generating_interactive_content", processing_progress: 94, processing_error: null }).eq("id", bookId),
    logLibraryEvent(admin, bookId, job.id, "ai_processing_started", "بدأت مرحلة الذكاء الاصطناعي للكتاب", "info", 94, { worker: WORKER_ID, edge_function: EDGE_FUNCTION_NAME }),
    logLibraryEvent(admin, bookId, job.id, "build_index_started", "بدأ إنشاء فهرس الكتاب الذكي", "info", 94, { worker: WORKER_ID }),
  ]);
  const { data: book } = await admin
    .from("library_books")
    .select("title,subject_name_ar,page_count")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) throw new Error("book_not_found");

  const { data: pages } = await admin
    .from("library_book_pages")
    .select("page_number,ocr_text")
    .eq("book_id", bookId)
    .order("page_number");
  const total = (pages || []).length;
  if (!total) {
    await logLibraryEvent(admin, bookId, job.id, "build_index_failed_no_pages", "فشل إنشاء الفهرس لأن الكتاب لا يحتوي على صفحات مستخرجة", "error", 94, { reason: "no_pages_for_build_index" });
    throw new Error("no_pages_for_build_index");
  }

  const heads = (pages || []).map((p: any) => {
    const first = String(p.ocr_text || "").split(/\n/).map((s) => s.trim()).find((s) => s.length >= 3 && s.length <= 120) || "";
    return { page: p.page_number, head: first };
  });

  const { apiKey } = await resolveOpenRouterApiKey(admin);
  if (!apiKey) throw new Error("openrouter_key_missing");
  const settings = await loadAiSettings(admin, "library-index");

  const prompt = `فيما يلي أول سطر من كل صفحة في كتاب "${book.title}" (مادة "${book.subject_name_ar || ""}"). استخرج فهرساً منظماً على شكل JSON فقط بدون أي شرح:
{"index":[{"title":"...","kind":"chapter|lesson|section","page_start":N,"page_end":N,"summary":"..."}]}
- اعتبر العناوين المكررة أو الطويلة جزءاً من نفس الفصل.
- summary سطر واحد قصير.
- اجعل النطاقات متتابعة ومغطية للصفحات 1..${total}.

الرؤوس:\n${heads.map((h: { page: number; head: string }) => `${h.page}: ${h.head}`).join("\n").slice(0, 12000)}`;

  const res = await callGeminiWithFallback({
    apiKey,
    models: settings.models_to_try,
    body: {
      messages: [
        { role: "system", content: "أنت مساعد يبني فهارس منظمة للكتب المدرسية العربية. أخرج JSON صالحاً فقط." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    },
    fallbackDelayMs: settings.fallback_delay_ms,
    timeoutMs: 60_000,
  });
  if (!res.ok) throw new Error(`ai_failed:${res.status}:${(res.lastError || "").slice(0, 200)}`);
  const data = await res.response.json().catch(() => ({}));
  const raw: string = data?.choices?.[0]?.message?.content?.trim() || "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("no_json_in_index");
  let parsed: any;
  try { parsed = JSON.parse(jsonMatch[0]); }
  catch (e) { throw new Error(`index_parse_failed:${(e as Error).message}`); }
  const entries = Array.isArray(parsed?.index) ? parsed.index : [];

  await admin.from("library_book_index").delete().eq("book_id", bookId);
  if (entries.length) {
    const rows = entries.map((e: any, i: number) => ({
      book_id: bookId,
      kind: ["chapter", "lesson", "section", "heading", "note"].includes(e?.kind) ? e.kind : "section",
      title: String(e?.title || `قسم ${i + 1}`).slice(0, 300),
      summary: e?.summary ? String(e.summary).slice(0, 500) : null,
      page_start: Math.max(1, Number(e?.page_start) || 1),
      page_end: Math.min(total, Number(e?.page_end) || total),
      order_index: i,
    }));
    await admin.from("library_book_index").insert(rows);
  }
  await logLibraryEvent(admin, bookId, job.id, "interactive_lessons_generated", "تم إنشاء الفهرس والهيكل التفاعلي للكتاب", "success", 96, { entries: entries.length });
  await logLibraryEvent(admin, bookId, job.id, "build_index_completed", "اكتمل إنشاء فهرس الكتاب الذكي", "success", 96, { entries: entries.length });
}

async function enqueueInteractiveFinalizeJobs(admin: any, bookId: string, jobId: string | null, meta: Record<string, unknown> = {}) {
  const finalKinds = ["generate_explanations", "generate_quiz"];
  const { data: existing } = await admin
    .from("library_processing_jobs")
    .select("kind,state")
    .eq("book_id", bookId)
    .in("kind", finalKinds)
    .neq("state", "cancelled");

  const existingKinds = new Set((existing || []).map((row: any) => row.kind));
  const rows = [
    !existingKinds.has("generate_explanations") ? { book_id: bookId, stage: "explain", kind: "generate_explanations", state: "queued", progress: 0 } : null,
    !existingKinds.has("generate_quiz") ? { book_id: bookId, stage: "finalize", kind: "generate_quiz", state: "queued", progress: 0 } : null,
  ].filter(Boolean);

  if (rows.length) {
    const { error } = await admin.from("library_processing_jobs").insert(rows);
    if (error) throw new Error(`interactive_finalize_jobs_insert_failed:${error.message}`);
  }

  await admin
    .from("library_books")
    .update({ status: "processing", processing_progress: 98, processing_stage: "generating_page_explanations", processing_error: null })
    .eq("id", bookId);

  await logLibraryEvent(admin, bookId, jobId, "interactive_finalize_jobs_queued", "تم إنشاء مهام الشرح التفاعلي والاختبار التمهيدي", "info", 98, { jobs: finalKinds, inserted: rows.length, reused: finalKinds.length - rows.length, ...meta });
}

async function processEmbedBook(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  await Promise.all([
    admin.from("library_books").update({ processing_stage: "generating_interactive_content", processing_progress: 96, processing_error: null }).eq("id", bookId),
    logLibraryEvent(admin, bookId, job.id, "embed_book_started", "بدأ إنشاء البحث التفاعلي للكتاب", "info", 96, { worker: WORKER_ID }),
  ]);
  const { apiKey } = await resolveOpenRouterApiKey(admin);
  if (!apiKey) throw new Error("openrouter_key_missing");

  const { data: pages } = await admin
    .from("library_book_pages")
    .select("id,page_number,ocr_text")
    .eq("book_id", bookId)
    .order("page_number");
  if (!pages?.length) throw new Error("no_pages_to_embed");

  // Wipe old chunks so re-embed is deterministic.
  await admin.from("library_book_chunks").delete().eq("book_id", bookId);

  // Build chunks
  await logLibraryEvent(admin, bookId, job.id, "chunking_started", "بدأ تقسيم محتوى الكتاب إلى مقاطع قابلة للبحث", "info", 96, { pages: pages.length });
  type ChunkRow = { book_id: string; page_number: number; chunk_index: number; content: string; token_count: number | null };
  const allChunks: ChunkRow[] = [];
  for (const p of pages) {
    const parts = chunkPageText(String(p.ocr_text || ""));
    parts.forEach((content, idx) => {
      allChunks.push({
        book_id: bookId,
        page_number: p.page_number,
        chunk_index: idx,
        content,
        token_count: Math.round(content.length / 4),
      });
    });
  }
  if (!allChunks.length) {
    await logLibraryEvent(admin, bookId, job.id, "embedding_skipped_no_chunks", "لم يتم العثور على مقاطع نصية كافية للبحث، وسيستمر النظام في تجهيز الشرح والاختبار الاحتياطي", "warning", 97, { pages: pages.length });
    await enqueueInteractiveFinalizeJobs(admin, bookId, job.id, { chunks: 0, pages: pages.length, search_chunks_available: false });
    return;
  }
  await logLibraryEvent(admin, bookId, job.id, "chunking_finished", "انتهى تقسيم المحتوى", "success", 96, { chunks_total: allChunks.length, pages: pages.length });
  await logLibraryEvent(admin, bookId, job.id, "embeddings_started", "بدأ إنشاء Embeddings للبحث التفاعلي", "info", 97, { chunks_total: allChunks.length, model: OPENROUTER_DEFAULT_EMBED_MODEL });

  const BATCH = 64;
  const total = allChunks.length;
  let done = 0;
  for (let i = 0; i < total; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const emb = await openRouterEmbed({
      apiKey,
      model: OPENROUTER_DEFAULT_EMBED_MODEL,
      inputs: batch.map((c) => c.content),
      timeoutMs: 60_000,
    });
    if (!emb.ok) throw new Error(`embed_failed:${emb.status}:${(emb.lastError || "").slice(0, 200)}`);
    const rows = batch.map((c, k) => ({ ...c, embedding: emb.vectors[k] }));
    const { error } = await admin.from("library_book_chunks").insert(rows);
    if (error) throw new Error(`chunk_insert_failed:${error.message}`);
    done += batch.length;
    const progress = Math.min(90, Math.round((done / total) * 90));
    await admin.from("library_processing_jobs").update({ progress, updated_at: new Date().toISOString() }).eq("id", job.id);
    await logLibraryEvent(admin, bookId, job.id, "embedding_batch_saved", "تم حفظ دفعة من بيانات البحث التفاعلي", "info", Math.min(99, 96 + Math.round((done / total) * 3)), { chunks_done: done, chunks_total: total, audio_completed: 0, audio_remaining: 0 });
  }

  // Also embed page-level summaries (concatenate first 800 chars of each page) for coarse search.
  const pageInputs = pages.map((p: any) => String(p.ocr_text || "").replace(/\s+/g, " ").slice(0, 800));
  const nonEmpty = pages
    .map((p: any, i: number) => ({ p, text: pageInputs[i] }))
    .filter((r: any) => r.text.length >= 20);
  if (nonEmpty.length) {
    const PBATCH = 64;
    for (let i = 0; i < nonEmpty.length; i += PBATCH) {
      const slice = nonEmpty.slice(i, i + PBATCH);
      const emb = await openRouterEmbed({
        apiKey,
        model: OPENROUTER_DEFAULT_EMBED_MODEL,
        inputs: slice.map((r: any) => r.text),
        timeoutMs: 60_000,
      });
      if (!emb.ok) break; // best-effort
      await Promise.all(slice.map((r: any, k: number) =>
        admin.from("library_book_pages")
          .update({ embedding: emb.vectors[k] })
          .eq("id", r.p.id)
      ));
    }
  }

  // Embed index entries too
  const { data: idxRows } = await admin
    .from("library_book_index")
    .select("id,title,summary")
    .eq("book_id", bookId);
  if (idxRows?.length) {
    const inputs = idxRows.map((r: any) => `${r.title || ""}. ${r.summary || ""}`.trim());
    const emb = await openRouterEmbed({ apiKey, model: OPENROUTER_DEFAULT_EMBED_MODEL, inputs, timeoutMs: 60_000 });
    if (emb.ok) {
      await Promise.all(idxRows.map((r: any, k: number) =>
        admin.from("library_book_index").update({ embedding: emb.vectors[k] }).eq("id", r.id)
      ));
    }
  }

  await enqueueInteractiveFinalizeJobs(admin, bookId, job.id, { chunks: total, pages: pages.length, search_chunks_available: true });
}

async function processGenerateExplanations(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  await Promise.all([
    admin.from("library_books").update({ processing_stage: "generating_page_explanations", processing_progress: 98, processing_error: null }).eq("id", bookId),
    logLibraryEvent(admin, bookId, job.id, "page_explanations_started", "بدأ تجهيز شروح الصفحات للعرض التفاعلي", "info", 98, { worker: WORKER_ID }),
  ]);

  const { data: book } = await admin.from("library_books").select("title,subject_name_ar").eq("id", bookId).maybeSingle();
  const { data: pages } = await admin
    .from("library_book_pages")
    .select("id,page_number,ocr_text")
    .eq("book_id", bookId)
    .order("page_number");
  if (!pages?.length) throw new Error("no_pages_for_explanations");

  const { apiKey } = await resolveOpenRouterApiKey(admin);
  const settings = apiKey ? await loadAiSettings(admin, "library-explain") : null;
  let generated = 0;
  let fallback = 0;

  for (const page of pages) {
    const cacheKey = await sha256Hex(JSON.stringify({ source: "explain", bookId, pageNumber: page.page_number, sectionId: null, variant: "default", q: "" }));
    const { data: existing } = await admin
      .from("library_section_explanations")
      .select("id")
      .eq("book_id", bookId)
      .eq("prompt_hash", cacheKey)
      .eq("variant", "default")
      .maybeSingle();
    if (existing?.id) {
      generated++;
      continue;
    }

    const context = compactText(page.ocr_text, 3500);
    let text = fallbackExplanation(book?.title || "الكتاب", page.page_number, context);
    let tokensInput: number | null = null;
    let tokensOutput: number | null = null;

    if (apiKey && settings && context.length >= 30) {
      try {
        const res = await callGeminiWithFallback({
          apiKey,
          models: settings.models_to_try,
          body: {
            messages: [
              { role: "system", content: "أنت معلم عربي متمكن. اشرح صفحة من كتاب مدرسي عربي بلغة مبسطة ومباشرة بدون Markdown." },
              { role: "user", content: `كتاب: ${book?.title || ""}\nمادة: ${book?.subject_name_ar || ""}\nصفحة: ${page.page_number}\n\nالمحتوى:\n${context}\n\nاكتب شرحاً موجزاً واضحاً للطالب مع خلاصة قصيرة.` },
            ],
            temperature: 0.45,
          },
          fallbackDelayMs: settings.fallback_delay_ms,
          timeoutMs: 45_000,
        });
        if (res.ok) {
          const data = await res.response.json().catch(() => ({}));
          const aiText = compactText(data?.choices?.[0]?.message?.content, 4500);
          if (aiText) {
            text = aiText;
            tokensInput = data?.usage?.prompt_tokens ?? null;
            tokensOutput = data?.usage?.completion_tokens ?? null;
          } else {
            fallback++;
          }
        } else {
          fallback++;
        }
      } catch {
        fallback++;
      }
    } else {
      fallback++;
    }

    const { error } = await admin.from("library_section_explanations").insert({
      book_id: bookId,
      page_id: page.id,
      section_id: null,
      variant: "default",
      prompt_hash: cacheKey,
      text_ar: text,
      voice: null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      hit_count: 0,
    });
    if (error) throw new Error(`explanation_insert_failed:${error.message}`);

    generated++;
    const progress = Math.min(99, 98 + Math.floor((generated / pages.length) * 1));
    await admin.from("library_processing_jobs").update({ progress: Math.round((generated / pages.length) * 100), updated_at: new Date().toISOString() }).eq("id", job.id);
    if (generated === pages.length || generated === 1 || generated % 5 === 0) {
      await logLibraryEvent(admin, bookId, job.id, "page_explanation_saved", `تم تجهيز شرح الصفحة ${page.page_number}`, "info", progress, { pages_done: generated, pages_total: pages.length, fallback_count: fallback });
    }
  }

  await logLibraryEvent(admin, bookId, job.id, "page_explanations_completed", "اكتمل تجهيز شروح الصفحات التفاعلية", "success", 99, { pages_total: pages.length, fallback_count: fallback });
}

async function processGenerateQuiz(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  await Promise.all([
    admin.from("library_books").update({ processing_stage: "generating_quiz", processing_progress: 99, processing_error: null }).eq("id", bookId),
    logLibraryEvent(admin, bookId, job.id, "quiz_generation_started", "بدأ توليد اختبار تمهيدي للكتاب", "info", 99, { worker: WORKER_ID }),
  ]);

  const { data: book } = await admin.from("library_books").select("title,subject_name_ar,page_count").eq("id", bookId).maybeSingle();
  const promptHash = await sha256Hex(JSON.stringify({ bookId, scope: "book", scopeRef: { scope: "book", starter: true }, questionCount: 5, types: ["mcq"] }));
  const { data: existing } = await admin.from("library_generated_quizzes").select("id").eq("book_id", bookId).eq("prompt_hash", promptHash).maybeSingle();
  if (!existing?.id) {
    const { data: chunks } = await admin
      .from("library_book_chunks")
      .select("page_number,content")
      .eq("book_id", bookId)
      .order("page_number")
      .order("chunk_index")
      .limit(24);
    const sourceText = (chunks || []).map((c: any) => `[صفحة ${c.page_number}] ${c.content}`).join("\n\n").slice(0, 12000);
    const { apiKey } = await resolveOpenRouterApiKey(admin);
    const settings = apiKey ? await loadAiSettings(admin, "library-quiz") : null;
    let questions = fallbackQuiz(sourceText);
    let usedFallback = true;

    if (apiKey && settings && sourceText.trim().length >= 50) {
      try {
        const res = await callGeminiWithFallback({
          apiKey,
          models: settings.models_to_try,
          body: {
            messages: [
              { role: "system", content: "أنت معلم عربي ينشئ أسئلة دقيقة من كتاب. أخرج JSON صالحاً فقط بدون شرح خارجي." },
              { role: "user", content: `أنشئ 5 أسئلة اختيار من متعدد من كتاب "${book?.title || ""}" مادة "${book?.subject_name_ar || ""}".\nكل سؤال يحتوي page وquestion و4 options وcorrect_index وexplanation.\nالشكل: {"questions":[...]}\n\nالمحتوى:\n${sourceText}` },
            ],
            temperature: 0.45,
          },
          fallbackDelayMs: settings.fallback_delay_ms,
          timeoutMs: 60_000,
        });
        if (res.ok) {
          const data = await res.response.json().catch(() => ({}));
          const raw = String(data?.choices?.[0]?.message?.content || "");
          const parsed = extractJsonObject(raw);
          if (Array.isArray(parsed?.questions) && parsed.questions.length) {
            questions = parsed.questions.slice(0, 8);
            usedFallback = false;
          }
        }
      } catch { /* fallback below */ }
    }

    const { error } = await admin.from("library_generated_quizzes").insert({
      book_id: bookId,
      scope: "book",
      scope_ref: { scope: "book", starter: true, page_count: book?.page_count ?? null },
      prompt_hash: promptHash,
      questions,
      question_count: questions.length,
      hit_count: 0,
    });
    if (error) throw new Error(`quiz_insert_failed:${error.message}`);
    await logLibraryEvent(admin, bookId, job.id, "quiz_generation_completed", "اكتمل توليد الاختبار التمهيدي للكتاب", "success", 99, { questions: questions.length, fallback: usedFallback });
  } else {
    await logLibraryEvent(admin, bookId, job.id, "quiz_generation_reused", "الاختبار التمهيدي موجود مسبقاً وتمت إعادة استخدامه", "success", 99, { quiz_id: existing.id });
  }

  await admin
    .from("library_books")
    .update({
      status: "ready",
      processing_progress: 100,
      processing_stage: "completed",
      processing_error: null,
      published_at: new Date().toISOString(),
    })
    .eq("id", bookId);
  await logLibraryEvent(admin, bookId, job.id, "saving_results", "تم حفظ نتائج المعالجة النهائية", "info", 100, {});
  await logLibraryEvent(admin, bookId, job.id, "book_completed", "اكتملت معالجة الكتاب كشرح تفاعلي كامل وأصبح جاهزاً للطلاب", "success", 100, { completed_stage: "interactive_book_ready" });
}

async function processExtractPage(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  const pageNum: number = Number(job.page_number || 0);
  if (!pageNum) throw new Error("page_number_missing");
  await logLibraryEvent(admin, bookId, job.id, "extract_page_started", "بدأت إعادة معالجة صفحة واحدة", "info", null, { page_number: pageNum });

  const { data: book } = await admin
    .from("library_books")
    .select("pdf_path")
    .eq("id", bookId)
    .maybeSingle();
  if (!book?.pdf_path) throw new Error("pdf_path_missing");

  const bytes = await fetchPdfBytes(admin, book.pdf_path);
  const pdf = await getDocumentProxy(bytes);
  const { text: perPage } = await extractText(pdf as any, { mergePages: false });
  const pages: string[] = Array.isArray(perPage) ? perPage : [String(perPage || "")];
  const text = (pages[pageNum - 1] || "").slice(0, 30000);

  const { data: upsertedPage, error: pErr } = await admin
    .from("library_book_pages")
    .upsert({ book_id: bookId, page_number: pageNum, ocr_text: text }, { onConflict: "book_id,page_number" })
    .select("id")
    .single();
  if (pErr) throw new Error(pErr.message);

  await admin.from("library_book_sections").delete().eq("page_id", upsertedPage.id);
  const paras = paragraphSections(text);
  if (paras.length) {
    await admin.from("library_book_sections").insert(
      paras.map((raw, idx) => ({
        book_id: bookId,
        page_id: upsertedPage.id,
        kind: "paragraph",
        bbox: {},
        order_index: idx,
        raw_text: raw.slice(0, 8000),
      })),
    );
  }

  await admin.from("library_section_explanations").delete().eq("book_id", bookId).eq("page_id", upsertedPage.id);
  await admin.from("library_book_chunks").delete().eq("book_id", bookId).eq("page_number", pageNum);

  // Re-embed just this page's chunks
  const { apiKey } = await resolveOpenRouterApiKey(admin);
  if (apiKey) {
    const parts = chunkPageText(text);
    if (parts.length) {
      const emb = await openRouterEmbed({ apiKey, model: OPENROUTER_DEFAULT_EMBED_MODEL, inputs: parts, timeoutMs: 60_000 });
      if (emb.ok) {
        await admin.from("library_book_chunks").insert(parts.map((content, idx) => ({
          book_id: bookId,
          page_number: pageNum,
          chunk_index: idx,
          content,
          token_count: Math.round(content.length / 4),
          embedding: emb.vectors[idx],
        })));
      }
    }
  }
  await logLibraryEvent(admin, bookId, job.id, "extract_page_completed", "اكتملت إعادة معالجة الصفحة", "success", 100, { page_number: pageNum });
}

async function runOneJob(admin: any): Promise<{ ran: boolean; jobId?: string; error?: string }> {
  const { data: claimed, error: claimErr } = await admin.rpc("claim_library_job", { _worker: WORKER_ID });
  if (claimErr) return { ran: false, error: claimErr.message };
  const job = Array.isArray(claimed) && claimed[0] ? claimed[0] : null;
  if (!job) return { ran: false };

  try {
    if (job.kind === "extract_book") await processExtractBook(admin, job);
    else if (job.kind === "extract_page") await processExtractPage(admin, job);
    else if (job.kind === "build_index") await processBuildIndex(admin, job);
    else if (job.kind === "embed_book") await processEmbedBook(admin, job);
    else if (job.kind === "generate_explanations") await processGenerateExplanations(admin, job);
    else if (job.kind === "generate_quiz") await processGenerateQuiz(admin, job);
    else throw new Error(`unknown_kind:${job.kind}`);

    await admin
      .from("library_processing_jobs")
      .update({
        state: "completed",
        progress: 100,
        finished_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
        last_error: null,
      })
      .eq("id", job.id);

    await logLibraryEvent(admin, job.book_id, job.id, `job_completed_${job.kind}`, "اكتملت مهمة معالجة في طابور المكتبة", "success", 100, { kind: job.kind });

    return { ran: true, jobId: job.id };
  } catch (err: any) {
    const msg = String(err?.message || err).slice(0, 1000);
    console.error("[library-worker] job failed", job.id, msg);
    const nextState = (job.attempts || 0) >= (job.max_attempts || 3) ? "failed" : "queued";
    const details = errorPayload(err, job, String(job.kind || "unknown_processing_stage"), { next_state: nextState });
    await admin
      .from("library_processing_jobs")
      .update({
        state: nextState,
        last_error: msg,
        locked_by: null,
        locked_at: null,
        finished_at: nextState === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", job.id);
    await logLibraryEvent(admin, job.book_id, job.id, nextState === "failed" ? "job_failed" : "job_retry_queued", nextState === "failed" ? "فشلت مهمة معالجة الكتاب بعد كل المحاولات" : "تعطلت مهمة المعالجة وسيتم إعادة المحاولة", nextState === "failed" ? "error" : "warning", null, { kind: job.kind, error: msg, ...details });
    await admin
      .from("library_books")
      .update({
        status: nextState === "failed" ? "failed" : "processing",
        processing_stage: nextState === "failed" ? `${job.kind}_failed` : `${job.kind}_retry_waiting`,
        processing_error: msg,
      })
      .eq("id", job.book_id);
    return { ran: true, jobId: job.id, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const workerKey = (req.headers.get("x-worker-key") || "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let stored = "";
  let allowed = bearer === SERVICE_KEY || (!!WORKER_SHARED_KEY.trim() && workerKey === WORKER_SHARED_KEY.trim());
  if (!allowed) {
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "library_worker_shared_key")
      .maybeSingle();
    stored = (typeof data?.value === "string"
      ? data.value
      : typeof data?.value?.key === "string"
        ? data.value.key
        : "").trim();
    allowed = !!stored && workerKey === stored;
  }
  if (!allowed) {
    const { data: pending } = await admin
      .from("library_processing_jobs")
      .select("id,book_id,kind,state,attempts")
      .in("state", ["queued", "running"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pending?.book_id) {
      await logLibraryEvent(
        admin,
        pending.book_id,
        pending.id,
        "worker_auth_failed",
        "فشل استلام العامل للمهمة بسبب رفض المصادقة بين Cron و Edge Function",
        "error",
        0,
        {
          file: EDGE_FILE,
          line: 859,
          function: "Deno.serve auth guard",
          reason: "unauthorized_worker",
          has_bearer: !!bearer,
          bearer_is_service_role: bearer === SERVICE_KEY,
          has_worker_key_header: !!workerKey,
          has_env_worker_key: !!WORKER_SHARED_KEY.trim(),
          has_db_worker_key: !!stored,
          worker_key_header_length: workerKey.length,
          db_worker_key_length: stored.length,
          env_worker_key_length: WORKER_SHARED_KEY.trim().length,
          pending_job_kind: pending.kind,
          pending_job_state: pending.state,
          pending_job_attempts: pending.attempts,
        }
      );
    }

    return json({ error: "unauthorized_worker" }, 401);
  }

  const results = [];
  for (let i = 0; i < 8; i++) {
    const r = await runOneJob(admin);
    results.push(r);
    if (!r.ran) break;
  }

  return json({ worker: WORKER_ID, ran: results.filter((r) => r.ran).length, results });
});
