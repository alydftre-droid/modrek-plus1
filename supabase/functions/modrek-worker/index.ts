// deno-lint-ignore-file no-explicit-any
// Modrek AI Knowledge Processing Engine — background worker
// Claims pending jobs one at a time using modrek_claim_next_job (SKIP LOCKED)
// and runs the appropriate pipeline stage. Chains the next stage on success.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey } from "../_shared/aiSettings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
const VISION_MODEL = "google/gemini-2.5-pro";
const STRUCTURE_MODEL = "google/gemini-2.5-flash";

const MAX_JOBS_PER_INVOCATION = 3;
const AI_REQUEST_TIMEOUT_MS = 75_000;
const DIRECT_AI_FILE_LIMIT_BYTES = 18 * 1024 * 1024;
const FULL_TEXT_CHUNK_SIZE = 3500;
const FULL_TEXT_CHUNK_OVERLAP = 250;
const PDF_TEXT_BATCH_PAGES = 6;
const PDF_AI_BATCH_TARGET_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const results: any[] = [];
  try {
    for (let i = 0; i < MAX_JOBS_PER_INVOCATION; i++) {
      const { data: rows, error } = await admin.rpc("modrek_claim_next_job");
      if (error) { results.push({ error: error.message }); break; }
      const job = Array.isArray(rows) ? rows[0] : rows;
      if (!job) break;
      try {
        await runStage(admin, job);
        results.push({ job_id: job.id, kind: job.kind, ok: true });
      } catch (e: any) {
        await failJob(admin, job, e?.message ?? String(e));
        results.push({ job_id: job.id, kind: job.kind, ok: false, error: e?.message });
      }
    }
    if (results.some((result) => result?.ok)) {
      scheduleNextWorkerRun();
    }
    return json({ processed: results.length, results });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function runStage(admin: SupabaseClient, job: any) {
  await admin.from("processing_jobs").update({
    progress_pct: Math.max(1, Number(job.progress_pct ?? 0)),
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  await log(admin, job.id, "info", `stage started: ${job.kind}`);
  switch (job.kind) {
    case "detect": return await stageDetect(admin, job);
    case "extract_text": return await stageExtractText(admin, job);
    case "extract_page": return await stageExtractPage(admin, job);
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

  await setVersionStage(admin, job.version_id, "text_extraction", Math.min(39, 25 + Math.floor((pageFrom / Math.max(1, pageCount)) * 14)));
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
  if (!asset?.id) throw new Error("asset not found for PDF page extraction");

  const bytes = await fetchAssetBytes(admin, asset);
  const pages = await extractPdfPagesFromBytes(bytes, pageFrom, pageTo, async (donePage) => {
    const pct = 5 + Math.floor(((donePage - pageFrom + 1) / Math.max(1, pageTo - pageFrom + 1)) * 90);
    await admin.from("processing_jobs").update({ progress_pct: Math.min(95, pct), updated_at: new Date().toISOString() }).eq("id", job.id);
  });

  let batchText = pages.map((p) => `--- صفحة ${p.pageNo} ---\n${p.text}`).join("\n\n").trim();
  const minUsefulText = Math.max(30, (pageTo - pageFrom + 1) * 15);
  if (batchText.length < minUsefulText) {
    const subset = await createPdfPageSubset(bytes, pageFrom, pageTo);
    if (subset.byteLength > DIRECT_AI_FILE_LIMIT_BYTES) {
      throw new Error(`الصفحات ${pageFrom}-${pageTo} مصورة/كبيرة جداً ولا يمكن إرسالها للـ OCR ضمن حد المعالجة الآمن`);
    }
    await log(admin, job.id, "info", "PDF text layer too small; running OCR for page batch", {
      page_from: pageFrom,
      page_to: pageTo,
      subset_bytes: subset.byteLength,
      text_layer_chars: batchText.length,
    });
    const ocrText = await geminiExtractFromBytes(
      admin,
      subset,
      "application/pdf",
      `${asset.original_filename || "document"}-pages-${pageFrom}-${pageTo}.pdf`,
      true,
    );
    if (ocrText.trim().length > batchText.length) {
      batchText = `--- صفحات ${pageFrom}-${pageTo} OCR ---\n${ocrText.trim()}`;
    }
  }
  if (!batchText) throw new Error(`لم يتم استخراج أي نص من الصفحات ${pageFrom}-${pageTo}`);

  await admin.from("knowledge_units")
    .delete()
    .eq("version_id", job.version_id)
    .eq("kind", "page")
    .eq("metadata->>extraction_stage", "pdf_page_text")
    .eq("metadata->>page_from", String(pageFrom));

  const { error } = await admin.from("knowledge_units").insert({
    version_id: job.version_id,
    parent_id: null,
    kind: "page",
    title: pageFrom === pageTo ? `صفحة ${pageFrom}` : `صفحات ${pageFrom}-${pageTo}`,
    ordinal: pageFrom,
    page_from: pageFrom,
    page_to: pageTo,
    content_text: batchText,
    language: guessLang(batchText),
    word_count: batchText.split(/\s+/).filter(Boolean).length,
    confidence: 0.95,
    metadata: {
      extraction_stage: "pdf_page_text",
      page_from: String(pageFrom),
      page_to: String(pageTo),
      page_count: pageCount,
      chars: batchText.length,
    },
  });
  if (error) throw error;

  await succeedJob(admin, job, { page_from: pageFrom, page_to: pageTo, chars: batchText.length, mode: "pdf_page_batch" });
}

// -------- Stage 2a.2: merge all PDF text batches ----------------------------
async function stageMergeText(admin: SupabaseClient, job: any) {
  const input = job.input ?? {};
  const expectedPages = Number(input.page_count ?? 0);

  const [{ data: failedPages }, { data: waitingPages }, { data: units }] = await Promise.all([
    admin.from("processing_jobs")
      .select("id, error, input")
      .eq("version_id", job.version_id)
      .eq("kind", "extract_page")
      .eq("status", "failed"),
    admin.from("processing_jobs")
      .select("id")
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
    await admin.from("processing_jobs").update({
      status: "pending",
      next_run_at: new Date(Date.now() + 15_000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    await log(admin, job.id, "info", "merge_text delayed until PDF page extraction finishes", { waiting: waitingPages.length });
    return;
  }

  if (failedPages?.length) {
    throw new Error(`فشل استخراج ${failedPages.length} جزء من PDF؛ لن يتم اعتماد كتاب ناقص.`);
  }

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
  await admin.from("knowledge_units").delete().eq("version_id", job.version_id);
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
  await succeedJob(admin, job, { units: rows.length, preserved_full_text: true });
  await enqueue(admin, job.version_id, "chunk", 40, {}, job.asset_id);
}

// -------- Stage 4: chunk (units -> content_chunks) --------------------------
async function stageChunk(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "knowledge_extraction", 70);
  const { data: units } = await admin.from("knowledge_units")
    .select("id, content_text").eq("version_id", job.version_id).order("ordinal");
  await admin.from("content_chunks").delete().eq("version_id", job.version_id);
  const { data: version } = await admin.from("knowledge_source_versions")
    .select("source_id").eq("id", job.version_id).single();
  const chunks: any[] = [];
  let ord = 0;
  for (const u of units ?? []) {
    const pieces = splitText(u.content_text ?? "", 900, 100);
    for (const p of pieces) {
      chunks.push({
        source_id: version!.source_id, version_id: job.version_id, unit_id: u.id,
        ordinal: ord++, content: p, token_count: Math.ceil(p.length / 4),
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
  const BATCH = 96;
  let done = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const inputs = batch.map((c) => c.content.slice(0, 8000));
    const embeddings = await embedTexts(admin, inputs);
    for (let k = 0; k < batch.length; k++) {
      const emb = embeddings[k];
      if (!emb) continue;
      await admin.from("content_chunks").update({
        embedding: emb, embedding_model_id: modelId,
      }).eq("id", batch[k].id);
      done++;
    }
    const pct = 85 + Math.floor((10 * (i + batch.length)) / chunks.length);
    await admin.from("processing_jobs").update({ progress_pct: Math.min(95, pct) }).eq("id", job.id);
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

async function queuePdfTextBatches(admin: SupabaseClient, job: any, asset: any) {
  const bytes = await fetchAssetBytes(admin, asset);
  const pageCount = await getPdfPageCount(bytes);
  if (!pageCount || pageCount < 1) throw new Error("تعذر قراءة عدد صفحات PDF");

  await admin.from("knowledge_units")
    .delete()
    .eq("version_id", job.version_id)
    .eq("kind", "page")
    .eq("metadata->>extraction_stage", "pdf_page_text");

  await admin.from("knowledge_source_versions").update({
    page_count: pageCount,
    extracted_text: null,
    extracted_language: null,
    progress_pct: 28,
    error_message: null,
  }).eq("id", job.version_id);

  let batchCount = 0;
  const estimatedBytesPerPage = bytes.byteLength / Math.max(1, pageCount);
  const dynamicBatchPages = Math.max(
    1,
    Math.min(PDF_TEXT_BATCH_PAGES, Math.floor(PDF_AI_BATCH_TARGET_BYTES / Math.max(1, estimatedBytesPerPage)) || 1),
  );

  for (let pageFrom = 1; pageFrom <= pageCount; pageFrom += dynamicBatchPages) {
    const pageTo = Math.min(pageCount, pageFrom + dynamicBatchPages - 1);
    await enqueue(admin, job.version_id, "extract_page", 21, {
      asset_id: asset.id,
      page_from: pageFrom,
      page_to: pageTo,
      page_count: pageCount,
      dynamic_batch_pages: dynamicBatchPages,
      filename: asset.original_filename,
    }, asset.id);
    batchCount++;
  }

  await enqueue(admin, job.version_id, "merge_text", 29, {
    asset_id: asset.id,
    page_count: pageCount,
    batches: batchCount,
  }, asset.id);

  await succeedJob(admin, job, { mode: "pdf_paged_extraction", page_count: pageCount, batches: batchCount, pages_per_batch: dynamicBatchPages });
}

async function ocrAsset(admin: SupabaseClient, asset: any, mime: string) {
  const bytes = await fetchAssetBytes(admin, asset);
  return await geminiExtractFromBytes(admin, bytes, mime, asset.original_filename, /*ocr*/ true);
}

async function geminiExtractFromBytes(admin: SupabaseClient, bin: Uint8Array, mime: string, filename: string, ocr = false): Promise<string> {
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
  });
  return jr.choices?.[0]?.message?.content ?? "";
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
  if (LOVABLE_API_KEY) {
    const gatewayResponse = await fetchWithTimeout(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify(body),
    }, AI_REQUEST_TIMEOUT_MS);
    if (gatewayResponse.ok) return await gatewayResponse.json();

    const errorText = await gatewayResponse.text().catch(() => "");
    console.warn("lovable gateway failed; falling back to direct gemini", gatewayResponse.status, errorText.slice(0, 300));
  }

  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  const model = String(body.model ?? STRUCTURE_MODEL).replace(/^google\//, "");
  const result = await callGeminiWithFallback({
    apiKey: resolved.apiKey,
    models: [model],
    body: { ...body, model },
    timeoutMs: 90_000,
  });
  if (!result.ok) throw new Error(`gemini failed ${result.status}: ${(result.lastError ?? "").slice(0, 300)}`);
  return await result.response.json();
}

async function embedTexts(admin: SupabaseClient, inputs: string[]): Promise<number[][]> {
  if (LOVABLE_API_KEY) {
    const r = await fetch(`${GATEWAY}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
    });
    if (r.ok) {
      const jr = await r.json();
      return (jr.data ?? []).map((item: any) => item.embedding).filter(Boolean);
    }
    const errorText = await r.text().catch(() => "");
    console.warn("lovable embeddings failed; falling back to direct gemini", r.status, errorText.slice(0, 300));
  }

  const resolved = await resolveGeminiApiKey(admin, GEMINI_API_KEY);
  if (!resolved.apiKey) throw new Error("GEMINI_API_KEY_MISSING_FOR_EMBEDDINGS");
  const requests = inputs.map((text) => ({
    model: `models/${GEMINI_EMBED_MODEL}`,
    content: { parts: [{ text }] },
    outputDimensionality: EMBED_DIMS,
  }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": resolved.apiKey },
    body: JSON.stringify({ requests }),
  });
  if (!r.ok) throw new Error(`gemini embed failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const payload = await r.json();
  return (payload.embeddings ?? []).map((embedding: any) => embedding.values).filter(Boolean);
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

async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs: any = await import("npm:pdfjs-dist@5.5.207/legacy/build/pdf.mjs");
    const copy = bytes.slice();
    const task = pdfjs.getDocument({
      data: copy,
      disableWorker: true,
      disableFontFace: true,
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent({ includeMarkedContent: false });
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
    console.warn("pdf.js extraction failed; trying literal PDF text", e?.message ?? e);
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
  const pdfjs: any = await import("npm:pdfjs-dist@5.5.207/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
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
  const pdfjs: any = await import("npm:pdfjs-dist@5.5.207/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const pages: { pageNo: number; text: string }[] = [];
  const lastPage = Math.min(Number(pdf.numPages ?? pageTo), pageTo);
  for (let pageNo = pageFrom; pageNo <= lastPage; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent({ includeMarkedContent: false });
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
  return body
    .replace(/\\([nrtbf()\\])/g, (_m, ch) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[ch] ?? ch))
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

async function enqueue(admin: SupabaseClient, versionId: string, kind: string, stageOrder: number, input: any, assetId?: string) {
  await admin.rpc("modrek_enqueue_stage", {
    p_version_id: versionId, p_kind: kind, p_stage_order: stageOrder,
    p_input: input, p_asset_id: assetId ?? null,
  });
}

async function succeedJob(admin: SupabaseClient, job: any, output: any) {
  await admin.from("processing_jobs").update({
    status: "succeeded", finished_at: new Date().toISOString(), output, progress_pct: 100,
  }).eq("id", job.id);
  await log(admin, job.id, "info", `stage succeeded: ${job.kind}`, output);
}

async function failJob(admin: SupabaseClient, job: any, err: string) {
  const attempts = (job.attempts ?? 0);
  const canRetry = attempts < (job.max_attempts ?? 3);
  const nextRunAt = canRetry ? new Date(Date.now() + Math.max(5_000, 20_000 * attempts)).toISOString() : null;
  await admin.from("processing_jobs").update({
    status: canRetry ? "retrying" : "failed",
    finished_at: new Date().toISOString(), error: err,
    next_run_at: nextRunAt,
  }).eq("id", job.id);
  await log(admin, job.id, "error", `stage failed: ${job.kind} (attempt ${attempts})`, { err });
  if (!canRetry) {
    await admin.from("knowledge_source_versions").update({
      pipeline_stage: "failed", error_message: err,
    }).eq("id", job.version_id);
    const { data: v } = await admin.from("knowledge_source_versions")
      .select("source_id").eq("id", job.version_id).single();
    if (v) await admin.from("knowledge_sources").update({ status: "failed" }).eq("id", v.source_id);
  }
}

async function setVersionStage(admin: SupabaseClient, versionId: string, stage: string, pct: number) {
  await admin.from("knowledge_source_versions").update({
    pipeline_stage: stage, progress_pct: pct,
  }).eq("id", versionId);
}

async function log(admin: SupabaseClient, jobId: string, level: string, message: string, data: any = {}) {
  await admin.rpc("modrek_log_event", { p_job_id: jobId, p_level: level, p_message: message, p_data: data });
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
