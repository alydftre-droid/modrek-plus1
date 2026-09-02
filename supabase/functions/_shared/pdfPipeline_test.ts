// deno test --allow-none supabase/functions/_shared/pdfPipeline_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  backoffDelayMs,
  clampMaxTokens,
  classifyPipelineError,
  countPdfPagesFromRawBytes,
  pageNeedsOcr,
  planPageBatches,
  planPdfParts,
  resolvePdfPageCount,
  scanPdfPagesDeep,

  summarizePageStates,
  tokenBudgetForStage,
} from "./pdfPipeline.ts";

const enc = (s: string) => new TextEncoder().encode(s);

Deno.test("402 credit errors are terminal and freeze paid work", () => {
  for (
    const msg of [
      "openrouter failed 402: This request requires more credits, or fewer max_tokens",
      "This request requires at least $0.50 in balance for files",
      "Provider returned insufficient credits",
    ]
  ) {
    const e = classifyPipelineError(new Error(msg));
    assertEquals(e.category, "INSUFFICIENT_CREDITS");
    assertEquals(e.retryable, false);
    assertEquals(e.freezesPaidWork, true);
  }
});

Deno.test("rate limits and timeouts are retryable but do not freeze the book", () => {
  const rate = classifyPipelineError(new Error("429 rate limit exceeded"));
  assertEquals(rate.category, "RATE_LIMIT");
  assert(rate.retryable);
  assertEquals(rate.freezesPaidWork, false);

  const timeout = classifyPipelineError(new Error("request timeout after 60000ms"));
  assertEquals(timeout.category, "NETWORK_ERROR");
  assert(timeout.retryable);
});

Deno.test("corrupt/encrypted PDFs are terminal PDF_ERROR, parser hiccups are retryable", () => {
  assertEquals(classifyPipelineError(new Error("Invalid PDF structure")).category, "PDF_ERROR");
  assertEquals(classifyPipelineError(new Error("PDF is encrypted, password required")).retryable, false);
  const parser = classifyPipelineError(new Error("تعذر قراءة عدد صفحات PDF محلياً خلال المهلة"));
  assert(["PARSER_ERROR", "NETWORK_ERROR"].includes(parser.category));
});

Deno.test("db and embedding failures get their own categories", () => {
  assertEquals(classifyPipelineError(new Error('duplicate key value violates unique constraint')).category, "DATABASE_ERROR");
  assertEquals(classifyPipelineError(new Error("embedding batch failed")).category, "EMBEDDING_ERROR");
});

Deno.test("backoff grows exponentially and is capped", () => {
  const a1 = backoffDelayMs(1, 1_000, 60_000);
  const a3 = backoffDelayMs(3, 1_000, 60_000);
  const a20 = backoffDelayMs(20, 1_000, 60_000);
  assert(a1 >= 1_000 && a1 < 2_000);
  assert(a3 >= 4_000);
  assertEquals(a20, 60_000);
});

Deno.test("token budgets never explode to 65536", () => {
  assert(tokenBudgetForStage("ocr_page", 1) <= 4_096);
  assert(tokenBudgetForStage("structure", 500) <= 6_144);
  assertEquals(tokenBudgetForStage("metadata"), 1_024);
  assertEquals(clampMaxTokens(65_536), 8_192);
  assertEquals(clampMaxTokens(0), 2_048);
  assertEquals(clampMaxTokens(4_000), 4_000);
});

Deno.test("large books split into bounded parts and batches", () => {
  const parts = planPdfParts(305, 10);
  assertEquals(parts.length, 31);
  assertEquals(parts[0], { partIndex: 0, pageFrom: 1, pageTo: 10 });
  assertEquals(parts[30], { partIndex: 30, pageFrom: 301, pageTo: 305 });

  const textBatches = planPageBatches(300, { maxPagesPerBatch: 10 });
  assertEquals(textBatches.length, 30);
  const scanned = planPageBatches(7, { scanned: true });
  assertEquals(scanned.length, 7);
  assertEquals(planPdfParts(0).length, 0);
});

Deno.test("raw byte scan counts pages when parsers fail", () => {
  const pdf = enc("%PDF-1.7\n1 0 obj << /Type /Pages /Kids [2 0 R] /Count 42 >> endobj\n");
  assertEquals(countPdfPagesFromRawBytes(pdf), 42);
  const objects = enc("%PDF-1.4\n2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n3 0 obj << /Type /Page >> endobj\n");
  assertEquals(countPdfPagesFromRawBytes(objects), 2);
});

Deno.test("resolvePdfPageCount walks every parser then the raw scan", async () => {
  const bytes = enc("%PDF-1.7\n1 0 obj << /Type /Pages /Count 12 >> endobj\n");
  const attempts: string[] = [];
  const res = await resolvePdfPageCount(
    bytes,
    [
      { name: "unpdf", run: () => Promise.reject(new Error("worker crashed")) },
      { name: "pdf-lib", run: () => Promise.resolve(0) },
    ],
    (info) => {
      attempts.push(`${info.parser}:${info.ok}`);
    },
  );
  assertEquals(res.pageCount, 12);
  assertEquals(res.parser, "raw_byte_scan");
  assertEquals(attempts, ["unpdf:false", "pdf-lib:false", "raw_byte_scan:true"]);
});

Deno.test("resolvePdfPageCount prefers the first working parser", async () => {
  const res = await resolvePdfPageCount(enc("garbage"), [
    { name: "unpdf", run: () => Promise.resolve(300) },
    { name: "pdf-lib", run: () => Promise.reject(new Error("never called")) },
  ]);
  assertEquals(res, { pageCount: 300, parser: "unpdf" });
});

Deno.test("truly unreadable PDFs raise a clear Arabic diagnosis, not a generic error", async () => {
  let message = "";
  try {
    await resolvePdfPageCount(enc("not a pdf at all"), [
      { name: "unpdf", run: () => Promise.reject(new Error("bad xref")) },
    ]);
  } catch (err) {
    message = String((err as Error).message);
  }
  assert(message.includes("تالف") && message.includes("PDF"));
});

Deno.test("OCR is requested only for pages without a usable text layer", () => {
  assert(pageNeedsOcr(""));
  assert(pageNeedsOcr("   \n  "));
  assert(pageNeedsOcr("... ---"));
  assertEquals(pageNeedsOcr("الوحدة الأولى: الدرس الخامس في حساب المثلثات والتطبيقات"), false);
});

Deno.test("progress summary distinguishes completed / partial / failed / processing", () => {
  const processing = summarizePageStates(
    [{ extraction_status: "done" }, { extraction_status: "pending" }],
    300,
  );
  assertEquals(processing.health, "processing");
  assertEquals(processing.pagesProcessed, 1);

  const partial = summarizePageStates(
    [{ extraction_status: "done" }, { extraction_status: "done" }, { extraction_status: "failed" }],
    3,
  );
  assertEquals(partial.health, "partial");
  assertEquals(partial.pagesFailed, 1);
  assertEquals(partial.percent, 100);

  const completed = summarizePageStates([{ extraction_status: "done" }], 1);
  assertEquals(completed.health, "completed");

  const failed = summarizePageStates([{ extraction_status: "failed" }, { extraction_status: "failed" }], 2);
  assertEquals(failed.health, "failed");

  const retrying = summarizePageStates([{ extraction_status: "retrying", retry_count: 2 }], 4);
  assertEquals(retrying.pagesRetrying, 1);
  assertEquals(retrying.percent, 0);
});

Deno.test("157/300 example matches the developer progress UI contract", () => {
  const rows = [
    ...Array.from({ length: 157 }, () => ({ extraction_status: "done" })),
    ...Array.from({ length: 2 }, () => ({ extraction_status: "failed" })),
  ];
  const s = summarizePageStates(rows, 300);
  assertEquals(s.pagesProcessed, 157);
  assertEquals(s.pagesFailed, 2);
  assertEquals(s.percent, 53);
  assertEquals(s.health, "processing");
});

Deno.test("deep scan finds the page tree inside compressed object streams (xref-stream PDFs)", async () => {
  const payload = new TextEncoder().encode(
    "<< /Type /Pages /Kids [3 0 R] /Count 137 >>",
  );
  const compressed = new Uint8Array(
    await new Response(
      new Blob([payload]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const head = new TextEncoder().encode("%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n");
  const tail = new TextEncoder().encode("\nendstream\nendobj\nstartxref\n999\n%%EOF\n");
  const file = new Uint8Array(head.length + compressed.length + tail.length);
  file.set(head, 0);
  file.set(compressed, head.length);
  file.set(tail, head.length + compressed.length);

  assertEquals(countPdfPagesFromRawBytes(file, { requirePageTree: true }), 0);
  const deep = await scanPdfPagesDeep(file);
  assertEquals(deep.pageTreeCount, 137);
});
