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
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB — well under Supabase gateway limit
const SINGLE_SHOT_MAX = 5 * 1024 * 1024; // small files: skip chunking

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
  onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal;
}): Promise<void> {
  const { file, path, accessToken, supabaseUrl, supabaseKey, onProgress, signal } = opts;
  const uploadId = randomUploadId();
  const total = Math.ceil(file.size / CHUNK_SIZE);
  let uploaded = 0;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error("UPLOAD_ABORTED");
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunk = file.slice(start, end);

    let attempt = 0;
    const maxAttempts = 4;
    while (true) {
      try {
        const res = await fetch(
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
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          let msg = `فشل رفع الجزء ${i + 1}/${total} (${res.status})`;
          try { const p = JSON.parse(text); if (p?.error) msg = String(p.error); } catch { /* */ }
          throw new Error(msg);
        }
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
  const finalizeRes = await fetch(
    `${supabaseUrl}/functions/v1/bunny-storage?action=finalize-upload&path=${encodeURIComponent(path)}&uploadId=${uploadId}&total=${total}&contentType=${encodeURIComponent(file.type || "application/pdf")}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, apikey: supabaseKey },
      signal,
    },
  );
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text().catch(() => "");
    let msg = `فشل إنهاء الرفع (${finalizeRes.status})`;
    try { const p = JSON.parse(text); if (p?.error) msg = String(p.error); } catch { /* */ }
    throw new Error(msg);
  }
}

export async function uploadBookToBunny({ file, userId, onProgress, signal }: UploadBookOptions): Promise<BunnyLibraryUri> {
  const accessToken = await getCurrentAccessToken();
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!accessToken || !supabaseUrl || !supabaseKey) {
    throw new Error("تعذر تجهيز جلسة الحساب. سجّل الدخول ثم أعد المحاولة.");
  }

  const path = buildLibraryBunnyPath(userId, file.name);
  const common = { file, path, accessToken, supabaseUrl, supabaseKey, onProgress, signal };

  try {
    if (file.size <= SINGLE_SHOT_MAX) {
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
    } else {
      throw err;
    }
  }

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
