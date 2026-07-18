// Student library storage layer — Bunny Storage only.
//
// PDFs live at `library/{userId}/{uuid}.pdf` on the Bunny zone, and the DB
// stores the `bstorage://library/...` URI in `content.file_url`. All reads
// go through the `bunny-storage` edge function which enforces ownership and
// supports HTTP Range requests for fast partial fetches.
import {
  getCurrentAccessToken,
  getSupabaseFunctionsConfig,
} from "@/lib/bunnyStorage";


export const LIBRARY_PATH_PREFIX = "library";

export type BunnyLibraryUri = `bstorage://library/${string}`;

function sanitizeExtension(fileName: string): string {
  const parts = fileName.split(".");
  const raw = parts.length > 1 ? parts.pop() : "pdf";
  const safe = (raw || "pdf").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return safe || "pdf";
}

export function buildLibraryBunnyPath(userId: string, fileName: string): string {
  return `${LIBRARY_PATH_PREFIX}/${userId}/${crypto.randomUUID()}.${sanitizeExtension(fileName)}`;
}

export function extractLibraryPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("bstorage://")) return value.slice("bstorage://".length);
  return null;
}

export function buildLibraryDownloadUrl(bstorageUri: string, accessToken: string): string {
  const path = extractLibraryPath(bstorageUri);
  if (!path) return bstorageUri;
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  // token in query string is unavoidable for <img>/<video>; PDFs use fetch()
  // with Authorization header so we prefer that path elsewhere.
  return `${supabaseUrl}/functions/v1/bunny-storage?action=download&path=${encodeURIComponent(path)}&apikey=${supabaseKey}&token=${encodeURIComponent(accessToken)}`;
}

export interface UploadBookOptions {
  file: File;
  userId: string;
  validatePdf?: boolean;
  onProgress?: (loaded: number, total: number) => void;
  onStage?: (event: LibraryUploadStageEvent) => void;
  signal?: AbortSignal;
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB — well under Supabase gateway limit
const SINGLE_SHOT_MAX = 0; // Library PDFs always use chunked upload; direct proxy streaming can hang after browser upload completes.
const CHUNK_UPLOAD_TIMEOUT_MS = 120_000;
const SESSION_TIMEOUT_MS = 30_000;
const MIN_FINALIZE_TIMEOUT_MS = 180_000;
const MAX_FINALIZE_TIMEOUT_MS = 900_000;

export type LibraryUploadStage =
  | "file-selected"
  | "session-create-start"
  | "session-created"
  | "chunking-start"
  | "chunk-upload-start"
  | "chunk-upload-complete"
  | "finalize-start"
  | "finalize-complete"
  | "complete"
  | "error";

export interface LibraryUploadStageEvent {
  stage: LibraryUploadStage;
  uploadId?: string;
  path?: string;
  chunkIndex?: number;
  totalChunks?: number;
  loaded?: number;
  total?: number;
  status?: number;
  elapsedMs?: number;
  message?: string;
}

function emitStage(onStage: UploadBookOptions["onStage"], event: LibraryUploadStageEvent) {
  console.info("[library-upload]", event);
  onStage?.(event);
}

async function assertPdfFile(file: File): Promise<void> {
  if (sanitizeExtension(file.name) !== "pdf") {
    throw new Error("الملف المختار ليس PDF. اختر كتاباً بصيغة .pdf فقط.");
  }
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...header);
  if (signature !== "%PDF-") {
    throw new Error("الملف المختار ليس PDF صالحاً. يبدو أنه صورة أو ملف مختلف.");
  }
}

function getFinalizeTimeout(fileSize: number) {
  const sizeMb = Math.max(1, Math.ceil(fileSize / 1024 / 1024));
  return Math.min(MAX_FINALIZE_TIMEOUT_MS, Math.max(MIN_FINALIZE_TIMEOUT_MS, sizeMb * 15_000));
}

function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number, stage: string) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`${stage}_TIMEOUT`));
  }, timeoutMs);

  const abortFromParent = () => controller.abort(parent?.reason || new Error("UPLOAD_ABORTED"));
  if (parent) {
    if (parent.aborted) abortFromParent();
    else parent.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, stage: string) {
  const timeout = createTimeoutSignal(init.signal as AbortSignal | undefined, timeoutMs, stage);
  try {
    return await fetch(input, { ...init, signal: timeout.signal });
  } catch (error: any) {
    if (timeout.wasTimedOut()) {
      throw new Error(`${stage}_TIMEOUT`);
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function randomUploadId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function uploadSingleShot(opts: {
  file: File; path: string; accessToken: string; supabaseUrl: string; supabaseKey: string;
  onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal;
}): Promise<void> {
  const { file, path, accessToken, supabaseUrl, supabaseKey, onProgress, signal } = opts;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 120_000;
    if (onProgress) xhr.upload.addEventListener("progress", (e) => e.lengthComputable && onProgress(e.loaded, e.total));
    if (signal) {
      if (signal.aborted) { xhr.abort(); reject(new Error("UPLOAD_ABORTED")); return; }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `فشل رفع الملف (${xhr.status})`;
      try { const p = JSON.parse(xhr.responseText || "{}"); if (p?.error) msg = String(p.error); } catch { /* */ }
      reject(new Error(msg));
    });
    xhr.addEventListener("error", () => reject(new Error("NETWORK_ERROR")));
    xhr.addEventListener("timeout", () => reject(new Error("انتهت مهلة الرفع.")));
    xhr.addEventListener("abort", () => reject(new Error("UPLOAD_ABORTED")));
    xhr.open("PUT", `${supabaseUrl}/functions/v1/bunny-storage?action=upload&path=${encodeURIComponent(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", file.type || "application/pdf");
    xhr.send(file);
  });
}

async function uploadChunked(opts: {
  file: File; path: string; accessToken: string; supabaseUrl: string; supabaseKey: string;
  onProgress?: (loaded: number, total: number) => void; onStage?: UploadBookOptions["onStage"]; signal?: AbortSignal;
}): Promise<void> {
  const { file, path, accessToken, supabaseUrl, supabaseKey, onProgress, onStage, signal } = opts;
  const total = Math.ceil(file.size / CHUNK_SIZE);
  let uploaded = 0;

  emitStage(onStage, { stage: "session-create-start", path, totalChunks: total, total: file.size });
  const sessionStartedAt = performance.now();
  const sessionRes = await fetchWithTimeout(
    `${supabaseUrl}/functions/v1/bunny-storage?action=create-upload-session&path=${encodeURIComponent(path)}&total=${total}&size=${file.size}&contentType=${encodeURIComponent(file.type || "application/pdf")}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, apikey: supabaseKey },
      signal,
    },
    SESSION_TIMEOUT_MS,
    "CREATE_UPLOAD_SESSION",
  );
  if (!sessionRes.ok) {
    const text = await sessionRes.text().catch(() => "");
    let msg = `فشل إنشاء جلسة الرفع (${sessionRes.status})`;
    try { const p = JSON.parse(text); if (p?.error) msg = String(p.error); } catch { /* */ }
    throw new Error(msg);
  }
  const sessionJson = await sessionRes.json().catch(() => ({} as any));
  const uploadId = typeof sessionJson.uploadId === "string" ? sessionJson.uploadId : randomUploadId();
  emitStage(onStage, { stage: "session-created", uploadId, path, totalChunks: total, total: file.size, elapsedMs: Math.round(performance.now() - sessionStartedAt) });
  emitStage(onStage, { stage: "chunking-start", uploadId, path, totalChunks: total, total: file.size });

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error("UPLOAD_ABORTED");
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunk = file.slice(start, end);

    let attempt = 0;
    const maxAttempts = 4;
    while (true) {
      try {
        emitStage(onStage, { stage: "chunk-upload-start", uploadId, path, chunkIndex: i, totalChunks: total, loaded: uploaded, total: file.size });
        const chunkStartedAt = performance.now();
        const res = await fetchWithTimeout(
          `${supabaseUrl}/functions/v1/bunny-storage?action=upload-chunk&path=${encodeURIComponent(path)}&uploadId=${uploadId}&index=${i}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: supabaseKey,
              "Content-Type": "application/octet-stream",
            },
            body: chunk,
            signal,
          },
          CHUNK_UPLOAD_TIMEOUT_MS,
          "UPLOAD_CHUNK",
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let msg = `فشل رفع الجزء ${i + 1}/${total} (${res.status})`;
          try { const p = JSON.parse(text); if (p?.error) msg = String(p.error); } catch { /* */ }
          throw new Error(msg);
        }
        emitStage(onStage, { stage: "chunk-upload-complete", uploadId, path, chunkIndex: i, totalChunks: total, loaded: end, total: file.size, status: res.status, elapsedMs: Math.round(performance.now() - chunkStartedAt) });
        break;
      } catch (err) {
        attempt++;
        if (signal?.aborted) throw new Error("UPLOAD_ABORTED");
        if (attempt >= maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    uploaded += end - start;
    onProgress?.(uploaded, file.size);
  }

  // Finalize — server-side stream concat to final object.
  emitStage(onStage, { stage: "finalize-start", uploadId, path, totalChunks: total, loaded: uploaded, total: file.size });
  const finalizeStartedAt = performance.now();
  const finalizeRes = await fetchWithTimeout(
    `${supabaseUrl}/functions/v1/bunny-storage?action=finalize-upload&path=${encodeURIComponent(path)}&uploadId=${uploadId}&total=${total}&size=${file.size}&contentType=${encodeURIComponent(file.type || "application/pdf")}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, apikey: supabaseKey },
      signal,
    },
    getFinalizeTimeout(file.size),
    "FINALIZE_UPLOAD",
  );
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text().catch(() => "");
    let msg = `فشل إنهاء الرفع (${finalizeRes.status})`;
    try { const p = JSON.parse(text); if (p?.error) msg = String(p.error); } catch { /* */ }
    throw new Error(msg);
  }
  emitStage(onStage, { stage: "finalize-complete", uploadId, path, totalChunks: total, loaded: file.size, total: file.size, status: finalizeRes.status, elapsedMs: Math.round(performance.now() - finalizeStartedAt) });
}

export async function uploadBookToBunny({ file, userId, validatePdf, onProgress, onStage, signal }: UploadBookOptions): Promise<BunnyLibraryUri> {
  if (validatePdf) await assertPdfFile(file);
  const accessToken = await getCurrentAccessToken();
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!accessToken || !supabaseUrl || !supabaseKey) {
    throw new Error("تعذر تجهيز جلسة الحساب. سجّل الدخول ثم أعد المحاولة.");
  }

  const path = buildLibraryBunnyPath(userId, file.name);
  const common = { file, path, accessToken, supabaseUrl, supabaseKey, onProgress, onStage, signal };
  emitStage(onStage, { stage: "file-selected", path, total: file.size });

  try {
    if (SINGLE_SHOT_MAX > 0 && file.size <= SINGLE_SHOT_MAX) {
      await uploadSingleShot(common);
    } else {
      await uploadChunked(common);
    }
  } catch (err: any) {
    const raw = String(err?.message || err || "");
    if (raw === "UPLOAD_ABORTED") throw err;
    if (raw === "NETWORK_ERROR") {
      // Retry small files via chunked path as a resilience fallback.
      if (file.size <= SINGLE_SHOT_MAX) {
        try { await uploadChunked(common); }
        catch (e2: any) {
          throw new Error(String(e2?.message || "تعذر رفع الملف. حاول مجددًا."));
        }
      } else {
        throw new Error("تعذر الاتصال بخدمة رفع الملفات. تحقق من الاتصال بالإنترنت وأعد المحاولة.");
      }
    } else if (raw === "FINALIZE_UPLOAD_TIMEOUT") {
      throw new Error("انتهت مهلة إنهاء الرفع داخل خدمة التخزين. لم يتم تسجيل الكتاب، حاول مرة أخرى.");
    } else if (raw === "UPLOAD_CHUNK_TIMEOUT") {
      throw new Error("انتهت مهلة رفع جزء من الملف. تحقق من الاتصال ثم أعد المحاولة.");
    } else if (raw === "CREATE_UPLOAD_SESSION_TIMEOUT") {
      throw new Error("انتهت مهلة تجهيز جلسة الرفع. حاول مرة أخرى.");
    } else {
      throw err;
    }
  }

  emitStage(onStage, { stage: "complete", path, loaded: file.size, total: file.size });
  return `bstorage://${path}` as BunnyLibraryUri;
}

export async function deleteBookFromBunny(bstorageUri: string): Promise<void> {
  const path = extractLibraryPath(bstorageUri);
  if (!path) return;
  const accessToken = await getCurrentAccessToken();
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!accessToken || !supabaseUrl || !supabaseKey) return;

  await fetch(`${supabaseUrl}/functions/v1/bunny-storage?action=delete&path=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseKey,
    },
  }).catch(() => undefined);
}

/**
 * Fetch a library PDF as a Blob. Uses Range-enabled edge proxy and cannot be
 * intercepted by the browser cache, so callers should persist the blob in
 * IndexedDB via `libraryCache.putPdf`.
 */
export async function fetchLibraryPdfBlob(bstorageUri: string): Promise<Blob> {
  const path = extractLibraryPath(bstorageUri);
  if (!path) throw new Error("Invalid library URI");
  const accessToken = await getCurrentAccessToken();
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!accessToken || !supabaseUrl || !supabaseKey) throw new Error("تعذر تجهيز جلسة الحساب.");

  const res = await fetch(`${supabaseUrl}/functions/v1/bunny-storage?action=download&path=${encodeURIComponent(path)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseKey,
    },
  });
  if (!res.ok) throw new Error(`فشل تحميل الكتاب (${res.status})`);
  return await res.blob();
}
