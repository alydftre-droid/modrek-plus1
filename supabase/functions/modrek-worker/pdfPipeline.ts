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
