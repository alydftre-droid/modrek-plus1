// Shared, provider-agnostic PDF pipeline primitives for the Modrek AI Library.
//
// Design rules enforced here:
//  * Raw text extraction is ALWAYS local — never an LLM job. LLMs are reserved
//    for OCR of image-only pages and for semantic structure detection.
//  * Page counting never hard-fails on a single parser: unpdf -> pdf-lib ->
//    raw byte scan of the PDF object table.
//  * Every failure is classified into a stable, structured error category so
//    the developer UI can show cause + stage + retry count instead of a wall of
//    duplicated provider noise.
//  * Output-token budgets are derived per stage/page — never a flat huge value
//    (the 65536 default was the direct cause of the OpenRouter 402 storm).

export type PipelineErrorCategory =
  | "PDF_ERROR"
  | "PARSER_ERROR"
  | "OCR_ERROR"
  | "LLM_ERROR"
  | "OPENROUTER_ERROR"
  | "EMBEDDING_ERROR"
  | "DATABASE_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMIT"
  | "INSUFFICIENT_CREDITS"
  | "UNKNOWN";

export type StructuredPipelineError = {
  category: PipelineErrorCategory;
  retryable: boolean;
  /** true only for provider-level money/quota blocks that must freeze paid work */
  freezesPaidWork: boolean;
  code: string | null;
  message: string;
  arabicMessage: string;
};

const ARABIC_BY_CATEGORY: Record<PipelineErrorCategory, string> = {
  PDF_ERROR: "ملف PDF غير قابل للقراءة (قد يكون تالفاً أو محمياً).",
  PARSER_ERROR: "فشل محلل PDF في قراءة هذا الجزء؛ سيتم تجربة محلل بديل.",
  OCR_ERROR: "فشل تنفيذ OCR على هذه الصفحة.",
  LLM_ERROR: "فشل نموذج الذكاء الاصطناعي في هذه الخطوة.",
  OPENROUTER_ERROR: "رفض مزوّد الذكاء الاصطناعي هذا الطلب.",
  EMBEDDING_ERROR: "فشل توليد المتجهات (Embeddings) لهذه الدفعة.",
  DATABASE_ERROR: "فشل حفظ النتيجة في قاعدة البيانات.",
  NETWORK_ERROR: "انقطاع أو مهلة في الشبكة أثناء المعالجة.",
  RATE_LIMIT: "تم تجاوز حدود الاستدعاء لدى المزوّد؛ سيتم الانتظار وإعادة المحاولة.",
  INSUFFICIENT_CREDITS: "رصيد مزوّد الذكاء الاصطناعي غير كافٍ لإكمال العمليات المدفوعة.",
  UNKNOWN: "خطأ غير مصنّف أثناء المعالجة.",
};

/** Classify any thrown value into a stable structured pipeline error. */
export function classifyPipelineError(err: unknown, stageHint?: string): StructuredPipelineError {
  const raw = typeof err === "string" ? err : String((err as any)?.message ?? err ?? "");
  const lower = raw.toLowerCase();
  const status = Number((err as any)?.status ?? (err as any)?.code ?? 0);
  const statusMatch = lower.match(/\b(4\d\d|5\d\d)\b/);
  const httpStatus = status >= 400 ? status : Number(statusMatch?.[1] ?? 0);

  const make = (
    category: PipelineErrorCategory,
    retryable: boolean,
    freezesPaidWork = false,
  ): StructuredPipelineError => ({
    category,
    retryable,
    freezesPaidWork,
    code: httpStatus ? String(httpStatus) : null,
    message: raw.slice(0, 800),
    arabicMessage: ARABIC_BY_CATEGORY[category],
  });

  if (
    httpStatus === 402 ||
    lower.includes("insufficient credit") ||
    lower.includes("requires more credits") ||
    lower.includes("more credits, or fewer max_tokens") ||
    lower.includes("requires at least $") ||
    lower.includes("balance for files")
  ) {
    return make("INSUFFICIENT_CREDITS", false, true);
  }
  if (httpStatus === 429 || lower.includes("rate limit") || lower.includes("resource_exhausted") || lower.includes("quota")) {
    return make("RATE_LIMIT", true, false);
  }
  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("abort") || lower.includes("network") || lower.includes("fetch failed")) {
    return make("NETWORK_ERROR", true);
  }
  if (lower.includes("embedding")) return make("EMBEDDING_ERROR", true);
  if (lower.includes("ocr")) return make("OCR_ERROR", true);
  if (lower.includes("openrouter") || lower.includes("agentrouter") || lower.includes("gateway")) {
    return make("OPENROUTER_ERROR", httpStatus >= 500 || httpStatus === 0);
  }
  if (lower.includes("max_tokens") || lower.includes("context length") || lower.includes("gemini") || lower.includes("model")) {
    return make("LLM_ERROR", httpStatus >= 500);
  }
  if (lower.includes("encrypted") || lower.includes("invalid pdf") || lower.includes("corrupt") || lower.includes("no /root") || lower.includes("password")) {
    return make("PDF_ERROR", false);
  }
  if (lower.includes("pdf") || lower.includes("page count") || lower.includes("عدد صفحات") || lower.includes("parse")) {
    return make("PARSER_ERROR", true);
  }
  if (
    lower.includes("duplicate key") ||
    lower.includes("violates") ||
    lower.includes("relation ") ||
    lower.includes("permission denied") ||
    (stageHint === "database")
  ) {
    return make("DATABASE_ERROR", false);
  }
  return make("UNKNOWN", true);
}

/** Exponential backoff with jitter, capped. attempt is 1-based. */
export function backoffDelayMs(attempt: number, baseMs = 15_000, capMs = 10 * 60_000): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exp = Math.min(capMs, baseMs * Math.pow(2, safeAttempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(5_000, exp * 0.25));
  return Math.min(capMs, exp + jitter);
}

/** Output-token budget per stage. Never returns a huge flat value. */
export function tokenBudgetForStage(
  stage: "ocr_page" | "structure" | "lesson_titles" | "metadata" | "quiz",
  units = 1,
): number {
  const safeUnits = Math.max(1, Math.floor(units));
  switch (stage) {
    case "ocr_page":
      return Math.min(4_096, 1_800 * Math.min(2, safeUnits));
    case "structure":
      return Math.min(6_144, 1_200 + safeUnits * 400);
    case "lesson_titles":
      return Math.min(3_072, 800 + safeUnits * 200);
    case "metadata":
      return 1_024;
    case "quiz":
      return Math.min(6_144, 1_200 + safeUnits * 500);
    default:
      return 2_048;
  }
}

/** Clamp any caller-provided max_tokens to a safe ceiling for the gateway. */
export function clampMaxTokens(requested: number | null | undefined, ceiling = 8_192): number {
  const n = Number(requested ?? 0);
  if (!Number.isFinite(n) || n <= 0) return Math.min(2_048, ceiling);
  return Math.max(256, Math.min(ceiling, Math.floor(n)));
}

export type PdfPart = { partIndex: number; pageFrom: number; pageTo: number };

/**
 * Split a book into parts once. Each part is later downloaded on its own, so a
 * 300-page/30MB book never gets re-downloaded and re-parsed 300 times.
 */
export function planPdfParts(pageCount: number, pagesPerPart = 10): PdfPart[] {
  const total = Math.max(0, Math.floor(pageCount));
  const size = Math.max(1, Math.floor(pagesPerPart));
  const parts: PdfPart[] = [];
  for (let pageFrom = 1; pageFrom <= total; pageFrom += size) {
    parts.push({
      partIndex: parts.length,
      pageFrom,
      pageTo: Math.min(total, pageFrom + size - 1),
    });
  }
  return parts;
}

/**
 * Batch size for extraction jobs inside a part. Large books use bigger local
 * batches (local extraction is free); scanned books stay at 1 page per job so a
 * paid OCR request is always tiny and predictable.
 */
export function planPageBatches(
  pageCount: number,
  opts: { scanned?: boolean; maxPagesPerBatch?: number } = {},
): { pageFrom: number; pageTo: number }[] {
  const total = Math.max(0, Math.floor(pageCount));
  const perBatch = opts.scanned ? 1 : Math.max(1, Math.floor(opts.maxPagesPerBatch ?? 10));
  const batches: { pageFrom: number; pageTo: number }[] = [];
  for (let pageFrom = 1; pageFrom <= total; pageFrom += perBatch) {
    batches.push({ pageFrom, pageTo: Math.min(total, pageFrom + perBatch - 1) });
  }
  return batches;
}

/**
 * Last-resort page counter: scans the raw PDF bytes for page objects. Works on
 * files that both unpdf and pdf-lib refuse to load, and needs no LLM call.
 */
export function countPdfPagesFromRawBytes(
  bytes: Uint8Array,
  options: { requirePageTree?: boolean } = {},
): number {
  // Decode in bounded windows; never materialize a 100-300MB PDF as one giant
  // string because this counter runs before the book is split.
  const chunk = 512 * 1024;
  const carrySize = 800;
  let carry = "";
  let best = 0;
  let pageObjects = 0;
  for (let i = 0; i < bytes.length; i += chunk) {
    const text = carry + new TextDecoder("latin1").decode(bytes.subarray(i, Math.min(bytes.length, i + chunk)));
    // 1) /Type /Pages ... /Count N (take the largest, i.e. the root page tree)
    for (const m of text.matchAll(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/g)) {
      best = Math.max(best, Number(m[1]) || 0);
    }
    for (const m of text.matchAll(/\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages/g)) {
      best = Math.max(best, Number(m[1]) || 0);
    }
    pageObjects += text.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
    carry = text.slice(-carrySize);
  }
  if (best > 0) return best;
  // Counting individual /Type /Page objects is only meaningful for a complete
  // file: on a partial (ranged) window it would badly undercount the book.
  return options.requirePageTree ? 0 : pageObjects;
}

/**
 * Inflate one raw stream payload, tolerating zlib and raw-deflate framing plus
 * the EOL padding PDF writers put before `endstream`. Partial output is kept:
 * a truncated inflate still exposes the `/Type /Pages /Count` we need.
 */
async function inflateStreamPayload(buf: Uint8Array): Promise<Uint8Array | null> {
  // Drop trailing EOL/whitespace padding — DecompressionStream rejects any
  // trailing byte after the deflate stream ends.
  let end = buf.length;
  while (end > 0 && (buf[end - 1] === 0x0a || buf[end - 1] === 0x0d || buf[end - 1] === 0x20 || buf[end - 1] === 0x00)) end--;
  const candidates = end === buf.length ? [buf] : [buf.subarray(0, end), buf];
  for (const candidate of candidates) {
    for (const format of ["deflate", "deflate-raw"] as const) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        const stream = new Blob([candidate]).stream().pipeThrough(new DecompressionStream(format));
        for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
          size += chunk.byteLength;
          if (size > 8 * 1024 * 1024) break;
        }
      } catch {
        /* keep whatever inflated before the error */
      }
      if (size > 0) {
        const out = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return out;
      }
    }
  }
  return null;
}


/**
 * Deep page scan for modern (xref-stream / object-stream) PDFs.
 *
 * In those files the catalog and the page tree live INSIDE compressed object
 * streams, so a raw byte scan of head/tail windows finds no `/Type /Pages
 * /Count`. Here we additionally inflate every self-contained `stream ...
 * endstream` payload in the window and scan the decompressed bytes.
 */
export async function scanPdfPagesDeep(
  bytes: Uint8Array,
  opts: { maxSegmentBytes?: number; maxSegments?: number; deadlineMs?: number } = {},
): Promise<{ pageTreeCount: number; pageObjects: number; inflated: number }> {
  const maxSegmentBytes = opts.maxSegmentBytes ?? 4 * 1024 * 1024;
  const maxSegments = opts.maxSegments ?? 400;
  const deadline = opts.deadlineMs ?? Date.now() + 30_000;

  let pageTreeCount = countPdfPagesFromRawBytes(bytes, { requirePageTree: true });
  let pageObjects = 0;
  let inflated = 0;

  const text = new TextDecoder("latin1").decode(bytes);
  let cursor = 0;
  while (inflated < maxSegments && Date.now() < deadline) {
    const open = text.indexOf("stream", cursor);
    if (open < 0) break;
    let payloadStart = open + "stream".length;
    if (text[payloadStart] === "\r") payloadStart++;
    if (text[payloadStart] === "\n") payloadStart++;
    const close = text.indexOf("endstream", payloadStart);
    cursor = close < 0 ? open + 6 : close + "endstream".length;
    if (close < 0) break;
    const length = close - payloadStart;
    if (length <= 0 || length > maxSegmentBytes) continue;
    const payload = bytes.subarray(payloadStart, close);
    const out = await inflateStreamPayload(payload);
    if (!out) continue;
    inflated++;
    const decoded = new TextDecoder("latin1").decode(out);
    for (const m of decoded.matchAll(/\/Type\s*\/Pages[\s\S]{0,400}?\/Count\s+(\d+)/g)) {
      pageTreeCount = Math.max(pageTreeCount, Number(m[1]) || 0);
    }
    for (const m of decoded.matchAll(/\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages/g)) {
      pageTreeCount = Math.max(pageTreeCount, Number(m[1]) || 0);
    }
    pageObjects += decoded.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  }

  // Uncompressed page objects present directly in this window.
  pageObjects += text.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;


  return { pageTreeCount, pageObjects, inflated };
}




/**
 * Resolve a page count through every available parser before giving up.
 * `loaders` are ordered async parsers (unpdf, pdf-lib, ...); the raw byte scan
 * is always the final fallback so a valid-but-awkward PDF is never rejected.
 */
export async function resolvePdfPageCount(
  bytes: Uint8Array,
  loaders: { name: string; run: (bytes: Uint8Array) => Promise<number> }[],
  onAttempt?: (info: { parser: string; ok: boolean; pages?: number; error?: string }) => void | Promise<void>,
): Promise<{ pageCount: number; parser: string }> {
  for (const loader of loaders) {
    try {
      const pages = Math.floor(Number(await loader.run(bytes)) || 0);
      if (pages > 0) {
        await onAttempt?.({ parser: loader.name, ok: true, pages });
        return { pageCount: pages, parser: loader.name };
      }
      await onAttempt?.({ parser: loader.name, ok: false, error: "returned 0 pages" });
    } catch (err) {
      await onAttempt?.({ parser: loader.name, ok: false, error: String((err as any)?.message ?? err).slice(0, 300) });
    }
  }
  const raw = countPdfPagesFromRawBytes(bytes);
  if (raw > 0) {
    await onAttempt?.({ parser: "raw_byte_scan", ok: true, pages: raw });
    return { pageCount: raw, parser: "raw_byte_scan" };
  }
  await onAttempt?.({ parser: "raw_byte_scan", ok: false, error: "no page objects found" });
  throw new Error(
    "ملف PDF غير قابل للقراءة بأي محلل متاح (unpdf / pdf-lib / مسح خام). الملف على الأرجح تالف أو محمي بكلمة مرور — أعد رفع نسخة سليمة.",
  );
}

/** Does a locally-extracted page carry a usable text layer, or does it need OCR? */
export function pageNeedsOcr(text: string, minCharsPerPage = 20): boolean {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length < minCharsPerPage) return true;
  const letters = clean.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.length < Math.max(10, Math.floor(minCharsPerPage / 2));
}

/** Aggregate per-page state rows into the developer-facing progress summary. */
export function summarizePageStates(
  rows: { extraction_status?: string | null; retry_count?: number | null }[],
  pagesTotal: number,
): {
  pagesTotal: number;
  pagesProcessed: number;
  pagesFailed: number;
  pagesRetrying: number;
  percent: number;
  health: "processing" | "completed" | "partial" | "failed";
} {
  const total = Math.max(0, Math.floor(pagesTotal));
  let processed = 0;
  let failed = 0;
  let retrying = 0;
  for (const row of rows ?? []) {
    const status = String(row?.extraction_status ?? "").toLowerCase();
    if (status === "done") processed++;
    else if (status === "failed") failed++;
    else if (status === "retrying" || Number(row?.retry_count ?? 0) > 0) retrying++;
  }
  const settled = processed + failed;
  const percent = total > 0 ? Math.min(100, Math.round((settled / total) * 100)) : 0;
  let health: "processing" | "completed" | "partial" | "failed" = "processing";
  if (total > 0 && settled >= total) {
    if (failed === 0) health = "completed";
    else if (processed === 0) health = "failed";
    else health = "partial";
  }
  return { pagesTotal: total, pagesProcessed: processed, pagesFailed: failed, pagesRetrying: retrying, percent, health };
}

// ---------------------------------------------------------------------------
// Real, spec-based page counting over ranged reads.
//
// Regex sweeps cannot see the page tree of a modern PDF whose catalog lives in a
// compressed object stream, and downloading a 72-200MB book into the isolate is
// what killed extract_text in the first place. This parser walks the actual
// cross-reference chain (classic tables AND xref streams), resolves the catalog
// and the page tree, and reads `/Count` — using a handful of small ranged reads
// no matter how big the book is.
// ---------------------------------------------------------------------------

export type PdfRangeReader = (start: number, endInclusive: number) => Promise<Uint8Array>;

type XrefEntry = { type: 1; offset: number } | { type: 2; objstm: number; idx: number };

const L1 = new TextDecoder("latin1");

/** Exposed for reuse: inflate a (possibly padded) deflate payload. */
export async function inflatePdfStream(buf: Uint8Array): Promise<Uint8Array | null> {
  return await inflateStreamPayload(buf);
}

/** Undo a PNG predictor (used by xref streams with /Predictor >= 10). */
function undoPngPredictor(data: Uint8Array, columns: number, colors = 1, bitsPerComponent = 8): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
  const rowLen = columns;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, r * (rowLen + 1) + 1 + rowLen);
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const raw = src[i] ?? 0;
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let value = raw;
      switch (type) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: value = raw; break;
      }
      cur[i] = value & 0xff;
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return out;
}

function dictNumber(dict: string, key: string): number | null {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)`));
  return m ? Number(m[1]) : null;
}

function dictRef(dict: string, key: string): number | null {
  const m = dict.match(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  return m ? Number(m[1]) : null;
}

function dictIntArray(dict: string, key: string): number[] | null {
  const m = dict.match(new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`));
  if (!m) return null;
  const nums = m[1].trim().split(/\s+/).map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return nums.length ? nums : null;
}

async function readWindow(read: PdfRangeReader, fileSize: number, start: number, length: number): Promise<Uint8Array> {
  const from = Math.max(0, Math.min(start, Math.max(0, fileSize - 1)));
  const to = Math.min(fileSize - 1, from + Math.max(1, length) - 1);
  return await read(from, to);
}

/** Parse a classic `xref` table + trailer starting at `text`. */
function parseClassicXref(text: string): { entries: Map<number, XrefEntry>; root: number | null; prev: number | null; xrefStm: number | null } {
  const entries = new Map<number, XrefEntry>();
  const trailerIdx = text.indexOf("trailer");
  const tableText = trailerIdx >= 0 ? text.slice(0, trailerIdx) : text;
  const body = tableText.replace(/^\s*xref/, "");
  const sectionRe = /(\d+)\s+(\d+)\s*([\s\S]*?)(?=(?:\d+\s+\d+\s*[\r\n])|$)/g;
  // Simpler and safer: walk tokens.
  const tokens = body.trim().split(/\s+/);
  let i = 0;
  while (i + 1 < tokens.length) {
    const start = Number(tokens[i]);
    const count = Number(tokens[i + 1]);
    if (!Number.isFinite(start) || !Number.isFinite(count) || count < 0) break;
    i += 2;
    for (let k = 0; k < count && i + 2 < tokens.length + 1; k++) {
      const offset = Number(tokens[i]);
      const kind = tokens[i + 2];
      i += 3;
      if (kind === "n" && Number.isFinite(offset)) {
        const num = start + k;
        if (!entries.has(num)) entries.set(num, { type: 1, offset });
      }
    }
  }
  void sectionRe;
  const trailer = trailerIdx >= 0 ? text.slice(trailerIdx, trailerIdx + 4096) : "";
  return {
    entries,
    root: dictRef(trailer, "Root"),
    prev: dictNumber(trailer, "Prev"),
    xrefStm: dictNumber(trailer, "XRefStm"),
  };
}

async function parseXrefStreamAt(
  read: PdfRangeReader,
  fileSize: number,
  offset: number,
): Promise<{ entries: Map<number, XrefEntry>; root: number | null; prev: number | null } | null> {
  let win = await readWindow(read, fileSize, offset, 1024 * 1024);
  let text = L1.decode(win);
  const objIdx = text.indexOf("obj");
  if (objIdx < 0) return null;
  const streamIdx = text.indexOf("stream", objIdx);
  if (streamIdx < 0) return null;
  // Take the WHOLE dictionary text (object header up to `stream`): stopping at
  // the first `>>` would cut off /W and /Root because /DecodeParms is nested.
  const dict = text.slice(objIdx + 3, streamIdx);
  if (!/\/XRef/.test(dict)) return null;

  let payloadStart = streamIdx + "stream".length;
  if (text[payloadStart] === "\r") payloadStart++;
  if (text[payloadStart] === "\n") payloadStart++;
  let length = dictNumber(dict, "Length") ?? 0;
  if (!length) {
    const endIdx = text.indexOf("endstream", payloadStart);
    if (endIdx > payloadStart) length = endIdx - payloadStart;
  }
  if (!length) return null;
  let payload: Uint8Array;
  if (payloadStart + length > win.length) {
    win = await readWindow(read, fileSize, offset + payloadStart, length);
    text = "";
    payload = win.subarray(0, Math.min(length, win.length));
  } else {
    payload = win.subarray(payloadStart, payloadStart + length);
  }

  let data = await inflateStreamPayload(payload);
  if (!data) return null;
  const predictor = dictNumber(dict, "Predictor") ?? 1;
  const columns = dictNumber(dict, "Columns") ?? 1;
  const colors = dictNumber(dict, "Colors") ?? 1;
  const bpc = dictNumber(dict, "BitsPerComponent") ?? 8;
  if (predictor >= 10) data = undoPngPredictor(data, columns, colors, bpc);

  const w = dictIntArray(dict, "W") ?? [1, 1, 1];
  const rowLen = w.reduce((a, b) => a + b, 0);
  if (rowLen <= 0) return null;
  const size = dictNumber(dict, "Size") ?? 0;
  const index = dictIntArray(dict, "Index") ?? [0, size];

  const entries = new Map<number, XrefEntry>();
  let pos = 0;
  const readField = (width: number): number => {
    let v = 0;
    for (let i = 0; i < width; i++) v = v * 256 + (data![pos + i] ?? 0);
    pos += width;
    return v;
  };
  for (let s = 0; s + 1 < index.length; s += 2) {
    const first = index[s];
    const count = index[s + 1];
    for (let k = 0; k < count; k++) {
      if (pos + rowLen > data.length) break;
      const type = w[0] === 0 ? 1 : readField(w[0]);
      const f2 = readField(w[1] ?? 0);
      const f3 = readField(w[2] ?? 0);
      const num = first + k;
      if (!entries.has(num)) {
        if (type === 1) entries.set(num, { type: 1, offset: f2 });
        else if (type === 2) entries.set(num, { type: 2, objstm: f2, idx: f3 });
      }
    }
  }

  return { entries, root: dictRef(dict, "Root"), prev: dictNumber(dict, "Prev") };
}

/**
 * Walk the xref chain and return every entry plus the catalog object number.
 */
async function loadXrefChain(
  fileSize: number,
  read: PdfRangeReader,
  maxSections = 64,
): Promise<{ entries: Map<number, XrefEntry>; root: number | null }> {
  const tail = await readWindow(read, fileSize, Math.max(0, fileSize - 128 * 1024), 128 * 1024);
  const tailText = L1.decode(tail);
  const starts = [...tailText.matchAll(/startxref\s+(\d+)/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n < fileSize);
  const entries = new Map<number, XrefEntry>();
  let root: number | null = null;
  const seen = new Set<number>();
  const queue: number[] = starts.length ? [starts[starts.length - 1]] : [];

  let sections = 0;
  while (queue.length && sections < maxSections) {
    const offset = queue.shift()!;
    if (!Number.isFinite(offset) || offset < 0 || offset >= fileSize || seen.has(offset)) continue;
    seen.add(offset);
    sections++;

    const head = L1.decode(await readWindow(read, fileSize, offset, 64));
    if (/^\s*xref/.test(head)) {
      const win = await readWindow(read, fileSize, offset, 8 * 1024 * 1024);
      const parsed = parseClassicXref(L1.decode(win));
      for (const [num, entry] of parsed.entries) if (!entries.has(num)) entries.set(num, entry);
      root ??= parsed.root;
      if (parsed.xrefStm != null) queue.push(parsed.xrefStm);
      if (parsed.prev != null) queue.push(parsed.prev);
    } else {
      const parsed = await parseXrefStreamAt(read, fileSize, offset);
      if (!parsed) continue;
      for (const [num, entry] of parsed.entries) if (!entries.has(num)) entries.set(num, entry);
      root ??= parsed.root;
      if (parsed.prev != null) queue.push(parsed.prev);
    }
  }

  return { entries, root };
}

type LoadedObject = { body: string; streamBytes: Uint8Array | null };

async function readIndirectObject(
  num: number,
  entries: Map<number, XrefEntry>,
  fileSize: number,
  read: PdfRangeReader,
  objStmCache: Map<number, { first: number; offsets: [number, number][]; data: Uint8Array }>,
  depth = 0,
): Promise<LoadedObject | null> {
  if (depth > 4) return null;
  const entry = entries.get(num);
  if (!entry) return null;

  if (entry.type === 1) {
    const win = await readWindow(read, fileSize, entry.offset, 512 * 1024);
    const text = L1.decode(win);
    const objIdx = text.indexOf("obj");
    if (objIdx < 0) return null;
    const body = text.slice(objIdx + 3);
    const streamIdx = body.indexOf("stream");
    if (streamIdx < 0) return { body, streamBytes: null };
    const dictPart = body.slice(0, streamIdx);
    let payloadStart = objIdx + 3 + streamIdx + "stream".length;
    if (text[payloadStart] === "\r") payloadStart++;
    if (text[payloadStart] === "\n") payloadStart++;
    let length = dictNumber(dictPart, "Length") ?? 0;
    if (!length) {
      const endIdx = text.indexOf("endstream", payloadStart);
      if (endIdx > payloadStart) length = endIdx - payloadStart;
    }
    if (!length) return { body: dictPart, streamBytes: null };
    let streamBytes: Uint8Array;
    if (payloadStart + length > win.length) {
      const exact = await readWindow(read, fileSize, entry.offset + payloadStart, length);
      streamBytes = exact.subarray(0, Math.min(length, exact.length));
    } else {
      streamBytes = win.subarray(payloadStart, payloadStart + length);
    }
    return { body: dictPart, streamBytes };
  }

  // Compressed object inside an object stream.
  let cached = objStmCache.get(entry.objstm);
  if (!cached) {
    const container = await readIndirectObject(entry.objstm, entries, fileSize, read, objStmCache, depth + 1);
    if (!container?.streamBytes) return null;
    const data = await inflateStreamPayload(container.streamBytes);
    if (!data) return null;
    const first = dictNumber(container.body, "First") ?? 0;
    const count = dictNumber(container.body, "N") ?? 0;
    const header = L1.decode(data.subarray(0, Math.max(0, first)));
    const nums = header.trim().split(/\s+/).map((n) => Number(n));
    const offsets: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length && offsets.length < count; i += 2) {
      offsets.push([nums[i], nums[i + 1]]);
    }
    cached = { first, offsets, data };
    objStmCache.set(entry.objstm, cached);
  }

  const slot = cached.offsets.findIndex(([objNum]) => objNum === num);
  const pick = slot >= 0 ? slot : entry.idx;
  const startRel = cached.offsets[pick]?.[1];
  if (startRel == null) return null;
  const endRel = cached.offsets[pick + 1]?.[1] ?? (cached.data.length - cached.first);
  const body = L1.decode(cached.data.subarray(cached.first + startRel, cached.first + Math.max(startRel, endRel)));
  return { body, streamBytes: null };
}

/**
 * Resolve a PDF's page count by walking the real cross-reference chain.
 * Returns 0 when the structure cannot be resolved (caller falls back).
 */
export async function resolvePdfPageCountViaXref(fileSize: number, read: PdfRangeReader): Promise<number> {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return 0;
  const { entries, root } = await loadXrefChain(fileSize, read);
  if (!entries.size) return 0;
  const cache = new Map<number, { first: number; offsets: [number, number][]; data: Uint8Array }>();

  const countFromPagesRef = async (pagesNum: number): Promise<number> => {
    const pages = await readIndirectObject(pagesNum, entries, fileSize, read, cache);
    if (!pages) return 0;
    const count = dictNumber(pages.body, "Count");
    return count && count > 0 ? count : 0;
  };

  if (root != null) {
    const catalog = await readIndirectObject(root, entries, fileSize, read, cache);
    const pagesNum = catalog ? dictRef(catalog.body, "Pages") : null;
    if (pagesNum != null) {
      const count = await countFromPagesRef(pagesNum);
      if (count > 0) return count;
    }
  }

  // No catalog (or a broken /Root): scan objects for the root page tree. Cheap
  // because object streams are cached and we stop at the first plausible hit.
  let best = 0;
  let inspected = 0;
  for (const num of entries.keys()) {
    if (inspected >= 400) break;
    inspected++;
    const obj = await readIndirectObject(num, entries, fileSize, read, cache);
    if (!obj) continue;
    if (!/\/Type\s*\/Pages/.test(obj.body)) continue;
    if (/\/Parent\s+\d+\s+\d+\s+R/.test(obj.body)) continue; // subtree, not the root
    const count = dictNumber(obj.body, "Count") ?? 0;
    if (count > best) best = count;
  }
  return best;
}
