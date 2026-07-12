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

export async function uploadBookToBunny({ file, userId, onProgress, signal }: UploadBookOptions): Promise<BunnyLibraryUri> {
  const accessToken = await getCurrentAccessToken();
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!accessToken || !supabaseUrl || !supabaseKey) {
    throw new Error("تعذر تجهيز جلسة الحساب. سجّل الدخول ثم أعد المحاولة.");
  }

  const path = buildLibraryBunnyPath(userId, file.name);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // 45s per MB, bounded 2min–15min
    const timeoutMs = Math.max(120_000, Math.min(900_000, Math.ceil(file.size / 1024 / 1024) * 45_000));
    xhr.timeout = timeoutMs;

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      });
    }
    if (signal) {
      const abort = () => xhr.abort();
      if (signal.aborted) { abort(); reject(new Error("UPLOAD_ABORTED")); return; }
      signal.addEventListener("abort", abort, { once: true });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `فشل رفع الملف (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        if (parsed?.error) message = String(parsed.error);
      } catch { /* ignore */ }
      reject(new Error(message));
    });
    xhr.addEventListener("error", () => {
      const status = xhr.status;
      if (status === 0) {
        reject(new Error("تعذر الاتصال بخدمة رفع الملفات. تحقق من الاتصال بالإنترنت وأعد المحاولة."));
      } else {
        let message = `فشل رفع الملف (${status})`;
        try {
          const parsed = JSON.parse(xhr.responseText || "{}");
          if (parsed?.error) message = String(parsed.error);
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    });
    xhr.addEventListener("timeout", () => reject(new Error("انتهت مهلة الرفع. تحقق من الاتصال وحاول مجددًا.")));
    xhr.addEventListener("abort", () => reject(new Error("UPLOAD_ABORTED")));

    xhr.open("PUT", `${supabaseUrl}/functions/v1/bunny-storage?action=upload&path=${encodeURIComponent(path)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("Content-Type", file.type || "application/pdf");
    xhr.send(file);
  });

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
