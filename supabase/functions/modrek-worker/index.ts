// deno-lint-ignore-file no-explicit-any
// Modrek AI Knowledge Processing Engine — background worker
// Claims pending jobs one at a time using modrek_claim_next_job (SKIP LOCKED)
// and runs the appropriate pipeline stage. Chains the next stage on success.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BUCKET = "modrek-library";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

const EMBED_MODEL = "openai/text-embedding-3-small";
const EMBED_DIMS = 768;
const VISION_MODEL = "google/gemini-2.5-pro";
const STRUCTURE_MODEL = "google/gemini-2.5-flash";

const MAX_JOBS_PER_INVOCATION = 3;

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
    return json({ processed: results.length, results });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function runStage(admin: SupabaseClient, job: any) {
  await log(admin, job.id, "info", `stage started: ${job.kind}`);
  switch (job.kind) {
    case "detect": return await stageDetect(admin, job);
    case "extract_text": return await stageExtractText(admin, job);
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
  const mime = asset?.mime_type ?? "application/octet-stream";
  const text = await extractTextForAsset(admin, asset, mime);
  await admin.from("knowledge_source_versions").update({
    extracted_text: text, extracted_language: guessLang(text), progress_pct: 40,
  }).eq("id", job.version_id);
  await succeedJob(admin, job, { chars: text.length });
  await enqueue(admin, job.version_id, "structure", 30, { chars: text.length }, job.asset_id);
}

// -------- Stage 2b: OCR --------------------------------------------------------
async function stageOcr(admin: SupabaseClient, job: any) {
  await setVersionStage(admin, job.version_id, "ocr", 25);
  const { data: asset } = await admin.from("storage_assets").select("*").eq("id", job.asset_id).single();
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

  const units = await analyzeStructure(text);
  // Insert units in tree order
  await admin.from("knowledge_units").delete().eq("version_id", job.version_id);
  const rows = units.map((u: any, idx: number) => ({
    version_id: job.version_id,
    parent_id: null,
    kind: u.kind,
    title: u.title ?? null,
    ordinal: idx,
    page_from: u.page_from ?? null,
    page_to: u.page_to ?? null,
    content_text: u.content ?? null,
    language: u.language ?? guessLang(u.content ?? ""),
    word_count: (u.content ?? "").split(/\s+/).filter(Boolean).length,
    confidence: u.confidence ?? 0.85,
    metadata: { source_type: u.metadata?.source_type ?? null },
  }));
  if (rows.length) await admin.from("knowledge_units").insert(rows);
  await succeedJob(admin, job, { units: rows.length });
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
    const r = await fetch(`${GATEWAY}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
    });
    if (!r.ok) throw new Error(`embed failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const jr = await r.json();
    for (let k = 0; k < batch.length; k++) {
      const emb = jr.data?.[k]?.embedding;
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

async function extractTextForAsset(admin: SupabaseClient, asset: any, mime: string) {
  const signed = await signedUrl(admin, asset.object_path);
  if (mime === "text/plain") {
    const r = await fetch(signed);
    return await r.text();
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    // DOCX via mammoth
    const buf = new Uint8Array(await (await fetch(signed)).arrayBuffer());
    const mammoth: any = await import("npm:mammoth@1.7.2");
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value ?? "";
  }
  if (mime === "application/pdf" || mime.startsWith("image/") ||
      mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    // Gemini multimodal: send as file
    return await geminiExtractFromFile(signed, mime, asset.original_filename);
  }
  // fallback
  const r = await fetch(signed);
  try { return await r.text(); } catch { return ""; }
}

async function ocrAsset(admin: SupabaseClient, asset: any, mime: string) {
  const signed = await signedUrl(admin, asset.object_path);
  return await geminiExtractFromFile(signed, mime, asset.original_filename, /*ocr*/ true);
}

async function geminiExtractFromFile(url: string, mime: string, filename: string, ocr = false): Promise<string> {
  // download & base64 the file to inline into the chat message
  const bin = new Uint8Array(await (await fetch(url)).arrayBuffer());
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
  const r = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: ocr ? VISION_MODEL : STRUCTURE_MODEL,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) throw new Error(`gemini extract failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const jr = await r.json();
  return jr.choices?.[0]?.message?.content ?? "";
}

async function analyzeStructure(text: string): Promise<any[]> {
  // Truncate very long inputs for structure phase; we still have full text saved
  const excerpt = text.slice(0, 60000);
  const prompt = `أنت محلل مناهج تعليمية. قم بتحليل النص التالي المستخرج من مصدر معرفي وقسمه إلى وحدات هيكلية دقيقة.
أعد JSON فقط بهذا الشكل:
{"units": [{"kind":"chapter|unit|lesson|section|heading|paragraph|definition|formula|example|exercise|question|answer|note|objective|table|figure|equation","title":"...","content":"...","page_from":null,"page_to":null,"language":"ar|en","confidence":0.0-1.0}]}
- لا تحذف أي محتوى مهم.
- الفصول والوحدات والدروس تُستخرج كوحدات أعلى.
- كل تعريف/قانون/مثال/تمرين/سؤال/إجابة يصبح وحدة مستقلة.
- استخدم اللغة العربية.
النص:
"""${excerpt}"""`;
  const r = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({
      model: STRUCTURE_MODEL,
      messages: [
        { role: "system", content: "أعد JSON صالحًا فقط بدون أي شرح إضافي." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) throw new Error(`structure failed ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const jr = await r.json();
  const raw = jr.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.units) ? parsed.units : [];
  } catch {
    // fallback: treat whole text as one paragraph unit
    return [{ kind: "paragraph", title: null, content: text.slice(0, 20000), confidence: 0.4 }];
  }
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

function guessLang(t: string): string {
  const s = t.slice(0, 2000);
  const ar = (s.match(/[\u0600-\u06FF]/g) ?? []).length;
  const en = (s.match(/[A-Za-z]/g) ?? []).length;
  return ar >= en ? "ar" : "en";
}

async function signedUrl(admin: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
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
  await admin.from("processing_jobs").update({
    status: canRetry ? "retrying" : "failed",
    finished_at: new Date().toISOString(), error: err,
    next_run_at: canRetry ? new Date(Date.now() + 60_000 * attempts).toISOString() : null,
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
