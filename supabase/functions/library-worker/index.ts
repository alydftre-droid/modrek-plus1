// Library Worker — background processor for library books.
// Invoked periodically by pg_cron (net.http_post). Also invocable manually
// by the admin dashboard to run a single tick immediately after enqueuing.
//
// Job kinds (public.library_processing_jobs.kind):
//   - extract_book: parse PDF → pages + sections
//   - extract_page: re-extract a single page
//   - build_index: LLM-derived TOC (chapters/lessons)
//   - embed_book:  chunk + embed pages/sections/index (RAG)
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

  const { text: perPage } = await extractText(pdf as any, { mergePages: false });
  const pages: string[] = Array.isArray(perPage) ? perPage : [String(perPage || "")];

  const BATCH = 20;
  for (let start = 0; start < totalPages; start += BATCH) {
    const end = Math.min(start + BATCH, totalPages);
    const pageRows = [];
    for (let i = start; i < end; i++) {
      const raw = (pages[i] || "").slice(0, 30000);
      const conf = raw.length >= 40 ? 1 : (raw.length >= 10 ? 0.5 : 0.1);
      pageRows.push({
        book_id: bookId,
        page_number: i + 1,
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

  // Enqueue follow-up jobs (idempotent — dedup handled by unique/state filters at scheduling time).
  await admin.from("library_processing_jobs").insert([
    { book_id: bookId, kind: "build_index", state: "queued", progress: 0 },
    { book_id: bookId, kind: "embed_book",  state: "queued", progress: 0 },
  ]);
}

async function processBuildIndex(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
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
  if (!total) return;

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
}

async function processEmbedBook(admin: any, job: any): Promise<void> {
  const bookId: string = job.book_id;
  const { apiKey } = await resolveOpenRouterApiKey(admin);
  if (!apiKey) throw new Error("openrouter_key_missing");

  const { data: pages } = await admin
    .from("library_book_pages")
    .select("id,page_number,ocr_text")
    .eq("book_id", bookId)
    .order("page_number");
  if (!pages?.length) return;

  // Wipe old chunks so re-embed is deterministic.
  await admin.from("library_book_chunks").delete().eq("book_id", bookId);

  // Build chunks
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
  if (!allChunks.length) return;

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
    if (nextState === "failed" && job.kind === "extract_book") {
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

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const workerKey = req.headers.get("x-worker-key") || "";
  const allowed = bearer === SERVICE_KEY || (!!WORKER_SHARED_KEY && workerKey === WORKER_SHARED_KEY);
  if (!allowed) return json({ error: "unauthorized_worker" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const results = [];
  for (let i = 0; i < 3; i++) {
    const r = await runOneJob(admin);
    results.push(r);
    if (!r.ran) break;
  }

  return json({ worker: WORKER_ID, ran: results.filter((r) => r.ran).length, results });
});
