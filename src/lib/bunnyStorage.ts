import { supabase } from "@/integrations/supabase/client";
import type { TeacherVideoUploadProgress } from "@/lib/teacherProfileUpload";

// Bunny Storage integration utilities
// Storage Zone: modrekplus-storage
// CDN: modrekplus-storage.b-cdn.net

const BUNNY_CDN_HOST = "modrekplus-storage.b-cdn.net";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

export function getSupabaseFunctionsConfig() {
  return {
    supabaseUrl: SUPABASE_FUNCTIONS_URL,
    supabaseKey: SUPABASE_PUBLISHABLE_KEY,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function looksLikeJwt(token?: string | null): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token.trim());
}

function isUsableAccessToken(token?: string | null): token is string {
  if (!looksLikeJwt(token)) return false;
  const normalizedToken = token.trim();
  const payload = decodeJwtPayload(normalizedToken);
  if (!payload) return false;
  const exp = typeof payload?.exp === "number" ? payload.exp * 1000 : 0;
  return !exp || exp - Date.now() > TOKEN_EXPIRY_BUFFER_MS;
}

// Module-level cache updated by onAuthStateChange so synchronous callers
// (resolveBunnyStorageUrl used inside <img>/<video>/<a> render paths) always
// have a fresh token even if localStorage layout changes between supabase-js
// versions.
let cachedAccessToken: string | null = null;

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    if (isUsableAccessToken(data.session?.access_token)) {
      cachedAccessToken = data.session!.access_token;
    }
  }).catch(() => { /* ignore */ });
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = isUsableAccessToken(session?.access_token) ? session!.access_token : null;
  });
}

function findAccessTokenInParsedValue(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;

  if (typeof value === "string") {
    return looksLikeJwt(value) ? value.trim() : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const token = findAccessTokenInParsedValue(entry, depth + 1);
      if (token) return token;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["access_token", "accessToken", "jwt", "token"]) {
    const direct = findAccessTokenInParsedValue(record[key], depth + 1);
    if (direct) return direct;
  }

  for (const key of ["currentSession", "session", "data", "value"]) {
    const nested = findAccessTokenInParsedValue(record[key], depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(record)) {
    const nested = findAccessTokenInParsedValue(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function extractTokenFromStorageValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (looksLikeJwt(trimmed)) return trimmed;
  try {
    const parsed = JSON.parse(raw);
    return findAccessTokenInParsedValue(parsed);
  } catch {
    return null;
  }
}

function readStoredTokenFrom(storage: Storage | undefined): string | null {
  if (!storage) return null;
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      const shouldInspect = key.includes("auth-token") || key.startsWith("sb-") || key.toLowerCase().includes("supabase");
      if (!shouldInspect) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      const token = extractTokenFromStorageValue(raw);
      if (isUsableAccessToken(token)) {
        cachedAccessToken = token;
        return token;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getStoredAccessToken(): string | null {
  if (isUsableAccessToken(cachedAccessToken)) return cachedAccessToken;
  if (typeof window === "undefined") return null;
  return readStoredTokenFrom(window.localStorage) || readStoredTokenFrom(window.sessionStorage);
}

const objectUrlCache = new Map<string, string>();

function resolveBunnyStorageProxyUrl(path: string) {
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  if (!supabaseUrl || !supabaseKey) return null;
  return `${supabaseUrl}/functions/v1/bunny-storage?action=download&path=${encodeURIComponent(path)}&apikey=${supabaseKey}`;
}

/**
 * Check if a file_url is stored on Bunny Storage
 */
export function isBunnyStorageFile(fileUrl: string): boolean {
  return fileUrl?.startsWith("bstorage://") || fileUrl?.includes(BUNNY_CDN_HOST) || false;
}

/**
 * Extract the storage path from a bstorage:// URL
 */
export function extractBunnyStoragePath(fileUrl: string): string | null {
  if (fileUrl?.startsWith("bstorage://")) {
    return fileUrl.replace("bstorage://", "");
  }
  if (fileUrl?.includes(BUNNY_CDN_HOST)) {
    try {
      const url = new URL(fileUrl);
      return url.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get the CDN URL for a Bunny Storage file
 */
export function getBunnyStorageCdnUrl(path: string): string {
  return `https://${BUNNY_CDN_HOST}/${path}`;
}

/**
 * Resolve a file URL - if it's a bstorage:// URL, return the download proxy URL
 * This proxies through the edge function to avoid CDN auth issues
 */
export function resolveBunnyStorageUrl(fileUrl: string): string {
  if (fileUrl?.startsWith("bstorage://")) {
    const path = fileUrl.replace("bstorage://", "");
    const proxyUrl = resolveBunnyStorageProxyUrl(path);
    if (!proxyUrl) return fileUrl;
    // Browser media elements and normal anchors cannot attach Authorization
    // headers, so keep this compatibility path for existing video/image/PDF
    // viewers while upload/delete actions continue to use headers.
    const token = getStoredAccessToken();
    return token ? `${proxyUrl}&token=${encodeURIComponent(token)}` : proxyUrl;
  }
  return fileUrl;
}

export async function resolveBunnyStorageBlobUrl(fileUrl: string, accessTokenOverride?: string | null): Promise<string> {
  if (!fileUrl?.startsWith("bstorage://")) return fileUrl;
  if (objectUrlCache.has(fileUrl)) return objectUrlCache.get(fileUrl)!;

  const path = fileUrl.replace("bstorage://", "");
  const proxyUrl = resolveBunnyStorageProxyUrl(path);
  const accessToken = await getCurrentAccessToken(accessTokenOverride);
  if (!proxyUrl || !accessToken) return fileUrl;

  const response = await fetch(proxyUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return fileUrl;

  const objectUrl = URL.createObjectURL(await response.blob());
  objectUrlCache.set(fileUrl, objectUrl);
  return objectUrl;
}

export async function getCurrentAccessToken(fallbackToken?: string | null): Promise<string | null> {
  if (isUsableAccessToken(fallbackToken)) return fallbackToken;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
    if (isUsableAccessToken(session?.access_token)) return session.access_token;

    const storedToken = getStoredAccessToken();
    if (storedToken) return storedToken;

    if (attempt >= 1) {
      const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } } as any));
      if (isUsableAccessToken(refreshData.session?.access_token)) return refreshData.session.access_token;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }

  return null;
}

/**
 * Upload a file to Bunny Storage via edge function (server-side proxy)
 * Returns the bstorage:// URI for DB storage
 */
export async function uploadToBunnyStorage(
  file: File,
  storagePath: string,
  onProgress?: (loaded: number, total: number) => void,
  accessTokenOverride?: string | null,
  onXhrReady?: (xhr: XMLHttpRequest) => void,
  onChunkProgress?: (progress: TeacherVideoUploadProgress) => void,
): Promise<string> {
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  const accessToken = await getCurrentAccessToken(accessTokenOverride);

  if (!accessToken || !supabaseUrl || !supabaseKey) {
    throw new Error("تعذر تجهيز جلسة الحساب. أغلق نافذة الرفع وافتحها مرة أخرى ثم حاول مجددًا");
  }

  // Files larger than 5MB go through the chunked pipeline (create-upload-session
  // → upload-chunk × N → finalize-upload). Single-shot PUTs through the edge
  // function silently stall for larger PDFs (Supabase gateway/body limits),
  // which is what made Modrek AI uploads "load forever" without any error.
  const CHUNK_THRESHOLD = 5 * 1024 * 1024;
  const useChunked = file.size > CHUNK_THRESHOLD;

  if (!useChunked) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const timeoutMs = Math.max(120_000, Math.min(900_000, file.size > 0 ? Math.ceil(file.size / 1024 / 1024) * 45_000 : 120_000));
      xhr.timeout = timeoutMs;

      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) onProgress(e.loaded, e.total);
        });
      }

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let message = `فشل رفع الملف (${xhr.status})`;
          try {
            const parsed = JSON.parse(xhr.responseText || "{}");
            if (parsed?.error) message = String(parsed.error);
          } catch {
            if (xhr.responseText) message = xhr.responseText.slice(0, 200);
          }
          reject(new Error(message));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("تعذر الاتصال بخدمة رفع الملفات")));
      xhr.addEventListener("timeout", () => reject(new Error("انتهت مهلة رفع الملف. تحقق من الاتصال ثم أعد المحاولة")));
      xhr.addEventListener("abort", () => reject(new Error("UPLOAD_ABORTED")));

      xhr.open("PUT", `${supabaseUrl}/functions/v1/bunny-storage?action=upload&path=${encodeURIComponent(storagePath)}`);
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.setRequestHeader("apikey", supabaseKey);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      if (onXhrReady) onXhrReady(xhr);
      xhr.send(file);
    });
    return `bstorage://${storagePath}`;
  }

  // ---- Chunked path ----
  const controller = new AbortController();
  if (onXhrReady) {
    // Expose an XHR-shaped shim so existing callers (ModrekUploadWizard) can
    // still call `.abort()` to cancel uploads mid-flight.
    onXhrReady({ abort: () => controller.abort() } as unknown as XMLHttpRequest);
  }

  const CHUNK_SIZE = 4 * 1024 * 1024;
  const total = Math.ceil(file.size / CHUNK_SIZE);
  const contentType = file.type || "application/octet-stream";
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    apikey: supabaseKey,
  } as const;

  const emitChunkProgress = (
    loaded: number,
    currentPart: number,
    partPercent: number,
    phase: TeacherVideoUploadProgress["phase"],
  ) => {
    onChunkProgress?.({
      loaded,
      total: file.size,
      percent: file.size > 0 ? Math.min(100, Math.round((loaded / file.size) * 100)) : 0,
      currentPart,
      totalParts: total,
      partPercent,
      phase,
    });
  };

  emitChunkProgress(0, 1, 0, "preparing");

  const parseErr = async (res: Response, fallback: string): Promise<string> => {
    const text = await res.text().catch(() => "");
    try {
      const parsed = JSON.parse(text || "{}");
      if (parsed?.error) return String(parsed.error);
    } catch { /* ignore */ }
    return fallback;
  };

  const sessionRes = await fetch(
    `${supabaseUrl}/functions/v1/bunny-storage?action=create-upload-session&path=${encodeURIComponent(storagePath)}&total=${total}&size=${file.size}&contentType=${encodeURIComponent(contentType)}`,
    { method: "POST", headers: authHeaders, signal: controller.signal },
  );
  if (!sessionRes.ok) {
    throw new Error(await parseErr(sessionRes, `فشل إنشاء جلسة الرفع (${sessionRes.status})`));
  }
  const sessionJson = await sessionRes.json().catch(() => ({} as any));
  const uploadId = typeof sessionJson?.uploadId === "string" ? sessionJson.uploadId : "";
  if (!uploadId) throw new Error("جلسة رفع غير صالحة");

  let uploaded = 0;
  for (let i = 0; i < total; i++) {
    if (controller.signal.aborted) throw new Error("UPLOAD_ABORTED");
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunk = file.slice(start, end);
    emitChunkProgress(uploaded, i + 1, 0, "uploading");

    let attempt = 0;
    const maxAttempts = 4;
    while (true) {
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const abortUpload = () => xhr.abort();
          controller.signal.addEventListener("abort", abortUpload, { once: true });
          xhr.timeout = 180_000;
          xhr.upload.addEventListener("progress", (event) => {
            if (!event.lengthComputable) return;
            const partPercent = Math.min(100, Math.round((event.loaded / event.total) * 100));
            const loadedNow = Math.min(file.size, start + event.loaded);
            onProgress?.(loadedNow, file.size);
            emitChunkProgress(loadedNow, i + 1, partPercent, "uploading");
          });
          xhr.addEventListener("load", () => {
            controller.signal.removeEventListener("abort", abortUpload);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
              return;
            }
            let message = `فشل رفع الجزء ${i + 1}/${total} (${xhr.status})`;
            try {
              const parsed = JSON.parse(xhr.responseText || "{}");
              if (parsed?.error) message = String(parsed.error);
            } catch { /* keep fallback */ }
            reject(new Error(message));
          });
          xhr.addEventListener("error", () => reject(new Error(`تعذر رفع الجزء ${i + 1}/${total}`)));
          xhr.addEventListener("timeout", () => reject(new Error(`انتهت مهلة رفع الجزء ${i + 1}/${total}`)));
          xhr.addEventListener("abort", () => reject(new Error("UPLOAD_ABORTED")));
          xhr.open("POST", `${supabaseUrl}/functions/v1/bunny-storage?action=upload-chunk&path=${encodeURIComponent(storagePath)}&uploadId=${uploadId}&index=${i}`);
          xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
          xhr.setRequestHeader("apikey", supabaseKey);
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.send(chunk);
        });
        break;
      } catch (err) {
        if (controller.signal.aborted) throw new Error("UPLOAD_ABORTED");
        attempt++;
        if (attempt >= maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }

    uploaded = end;
    onProgress?.(uploaded, file.size);
    emitChunkProgress(uploaded, i + 1, 100, "uploading");
  }

  emitChunkProgress(uploaded, total, 100, "finalizing");
  const finalizeRes = await fetch(
    `${supabaseUrl}/functions/v1/bunny-storage?action=finalize-upload&path=${encodeURIComponent(storagePath)}&uploadId=${uploadId}&total=${total}&size=${file.size}&contentType=${encodeURIComponent(contentType)}`,
    { method: "POST", headers: authHeaders, signal: controller.signal },
  );
  if (!finalizeRes.ok) {
    throw new Error(await parseErr(finalizeRes, `فشل إنهاء الرفع (${finalizeRes.status})`));
  }

  emitChunkProgress(file.size, total, 100, "finalizing");

  return `bstorage://${storagePath}`;
}
