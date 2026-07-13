// Library Worker — background processor for library books.
// Invoked periodically by pg_cron (net.http_post). Also invocable manually
// by the admin dashboard to run a single tick immediately after enqueuing.
//
// Job model (public.library_processing_jobs):
//   kind='extract_book' (stage='prepare') — reads the PDF from Bunny once,
//     writes one row per page into library_book_pages with ocr_text, and
//     updates library_books.processing_progress live. On completion the book
//     is marked status='ready' and never reprocessed unless the admin retries.
//   kind='extract_page' — re-extracts text for a single page (manual retry).
//
// AI provider: none in the worker itself — text extraction only. All
// user-facing AI/TTS goes through OpenRouter in the library-explain function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// unpdf is a serverless-friendly pdfjs wrapper (works in Deno without canvas).
import { getDocumentProxy, extractText } from "https://esm.sh/unpdf@0.11.0";
import {
  loadAiSettings,
  resolveOpenRouterApiKey,
  callGeminiWithFallback,
} from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_ID = `worker_${crypto.randomUUID().slice(0, 8)}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchPdfBytes(admin: any, pdfPath: string): Promise<Uint8Array> {
  // pdf_path may be a full URL (Bunny CDN) or a Supabase storage path.
  if (/^https?:\/\//i.test(pdfPath)) {
    const res = await fetch(pdfPath);
    if (!res.ok) throw new Error(`fetch_pdf_failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  // Fall back to signed URL from bunny-storage function or storage bucket.
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

async function processExtractBook(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  const { data: book, error: bErr } = await admin
    .from("library_books")
    .select("id,pdf_path,title")
    .eq("id", bookId)
    .maybeSingle();
  if (bErr || !book) throw new Error(`book_not_found:${bookId}`);
  if (!book.pdf_path) throw new Error("pdf_path_missing");

  await admin
    .from("library_books")
    .update({ status: "processing", processing_stage: "downloading", processing_progress: 2, processing_error: null })
    .eq("id", bookId);

  const bytes = await fetchPdfBytes(admin, book.pdf_path);

  await admin
    .from("library_books")
    .update({ processing_stage: "parsing", processing_progress: 5, file_size: bytes.byteLength })
    .eq("id", bookId);

  const pdf = await getDocumentProxy(bytes);
  const totalPages: number = (pdf as any).numPages ?? 0;
  if (!totalPages) throw new Error("empty_pdf");

  await admin
    .from("library_books")
    .update({ page_count: totalPages, processing_stage: "extracting_text", processing_progress: 8 })
    .eq("id", bookId);

  // Extract text per page in one pass (unpdf handles all pages via extractText).
  const { text: perPage } = await extractText(pdf as any, { mergePages: false });
  const pages: string[] = Array.isArray(perPage) ? perPage : [String(perPage || "")];

  // Save pages + sections in small batches, updating progress live.
  const BATCH = 20;
  for (let start = 0; start < totalPages; start += BATCH) {
    const end = Math.min(start + BATCH, totalPages);
    const pageRows = [];
    for (let i = start; i < end; i++) {
      pageRows.push({
        book_id: bookId,
        page_number: i + 1,
        ocr_text: (pages[i] || "").slice(0, 30000),
      });
    }
    // Upsert pages (idempotent when re-run)
    const { data: upserted, error: pErr } = await admin
      .from("library_book_pages")
      .upsert(pageRows, { onConflict: "book_id,page_number" })
      .select("id,page_number");
    if (pErr) throw new Error(`page_upsert_failed: ${pErr.message}`);

    // Sections for these pages (delete then insert)
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
      admin
        .from("library_books")
        .update({ processing_progress: progress, processing_stage: `page_${end}/${totalPages}` })
        .eq("id", bookId),
      admin
        .from("library_processing_jobs")
        .update({ progress, updated_at: new Date().toISOString() })
        .eq("id", job.id),
    ]);
  }

  await admin
    .from("library_books")
    .update({
      status: "ready",
      processing_progress: 100,
      processing_stage: "done",
      processing_error: null,
      published_at: new Date().toISOString(),
    })
    .eq("id", bookId);

  // Enqueue index-build job (fire-and-forget; the worker picks it up next tick)
  await admin.from("library_processing_jobs").insert({
    book_id: bookId,
    kind: "build_index",
    state: "queued",
    progress: 0,
  });
}

async function processBuildIndex(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  const { data: book } = await admin
    .from("library_books")
    .select("title,subject_name_ar,page_count")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) throw new Error("book_not_found");

  // Pull first paragraph of every page as heading candidates
  const { data: pages } = await admin
    .from("library_book_pages")
    .select("page_number,ocr_text")
    .eq("book_id", bookId)
    .order("page_number");
  const total = (pages || []).length;
  if (!total) return;

  // Build a compact heading map: first line of each page (usually a title/heading in textbooks)
  const heads = (pages || []).map((p: any) => {
    const first = String(p.ocr_text || "").split(/\n/).map((s) => s.trim()).find((s) => s.length >= 3 && s.length <= 120) || "";
    return { page: p.page_number, head: first };
  });

  // Ask OpenRouter to produce a TOC (chapters/lessons) from the heading map.
  const { apiKey } = await resolveOpenRouterApiKey(admin);
  if (!apiKey) throw new Error("openrouter_key_missing");
  const settings = await loadAiSettings(admin, "library-index");

  const prompt = `فيما يلي أول سطر من كل صفحة في كتاب "${book.title}" (مادة "${book.subject_name_ar || ""}"). استخرج فهرساً منظماً على شكل JSON فقط بدون أي شرح:
{"index":[{"title":"...","kind":"chapter|lesson|section","page_start":N,"page_end":N,"summary":"..."}]}
- اعتبر العناوين المكررة أو الطويلة جزءاً من نفس الفصل.
- summary سطر واحد قصير.
- اجعل النطاقات متتابعة ومغطية للصفحات ${1}..${total}.

الرؤوس:\n${heads.map((h) => `${h.page}: ${h.head}`).join("\n").slice(0, 12000)}`;

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

  // Wipe existing index, insert fresh
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

async function processExtractPage(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  const pageNum: number = Number(job.page_number || 0);
  if (!pageNum) throw new Error("page_number_missing");

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

  // Invalidate cached explanations for this page so a fresh extraction shows.
  await admin.from("library_section_explanations").delete().eq("book_id", bookId).eq("page_id", upsertedPage.id);
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

    return { ran: true, jobId: job.id };
  } catch (err: any) {
    const msg = String(err?.message || err).slice(0, 1000);
    console.error("[library-worker] job failed", job.id, msg);
    const nextState = (job.attempts || 0) >= (job.max_attempts || 3) ? "failed" : "queued";
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
    if (nextState === "failed") {
      await admin
        .from("library_books")
        .update({ status: "failed", processing_error: msg })
        .eq("id", job.book_id);
    }
    return { ran: true, jobId: job.id, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Run up to 3 jobs per invocation so a cron tick can drain a small backlog.
  const results = [];
  for (let i = 0; i < 3; i++) {
    const r = await runOneJob(admin);
    results.push(r);
    if (!r.ran) break;
  }

  return json({ worker: WORKER_ID, ran: results.filter((r) => r.ran).length, results });
});
