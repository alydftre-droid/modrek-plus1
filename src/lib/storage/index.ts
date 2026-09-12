/**
 * Unified storage service for Modrek Plus.
 *
 * Bunny.net is the ONLY object/file/media storage for the platform.
 * Supabase PostgreSQL keeps metadata only (path/url/mime/size/owner...).
 *
 * Every part of the app must upload/read/delete through this module instead of
 * touching `supabase.storage` directly. Bunny credentials never reach the
 * browser: uploads and deletes are proxied by the `bunny-storage` edge
 * function, and private reads use short-lived signed CDN URLs it issues.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  uploadToBunnyStorage,
  resolveBunnyStorageUrl,
  resolveBunnyStorageMediaUrl,
  fetchBunnyStorageBlob,
  isBunnyStorageFile,
  extractBunnyStoragePath,
  getCurrentAccessToken,
  getSupabaseFunctionsConfig,
} from "@/lib/bunnyStorage";

export type StorageScope =
  | { kind: "main" }
  | { kind: "platform"; id: string }
  | { kind: "user"; id: string }
  | { kind: "course"; id: string }
  | { kind: "chat"; id: string; userId: string };

export interface StoredFile {
  /** Value to persist in PostgreSQL (always `bstorage://<path>`). */
  url: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

export interface UploadOptions {
  scope: StorageScope;
  /** Logical folder inside the scope, e.g. "receipts", "photos", "books". */
  category: string;
  file: File | Blob;
  fileName?: string;
  onProgress?: (loaded: number, total: number) => void;
  accessToken?: string | null;
  onXhrReady?: (xhr: XMLHttpRequest) => void;
}

const SAFE_SEGMENT = /[^a-zA-Z0-9._-]+/g;

function sanitizeSegment(value: string, fallback: string) {
  const cleaned = (value || "").trim().replace(SAFE_SEGMENT, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function extensionOf(name: string, mime: string) {
  const fromName = name.includes(".") ? name.split(".").pop()!.toLowerCase().replace(SAFE_SEGMENT, "") : "";
  if (fromName && fromName.length <= 6) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
  };
  return map[(mime || "").toLowerCase()] || "bin";
}

/** Tenant/owner isolated path prefix. */
export function scopePrefix(scope: StorageScope): string {
  switch (scope.kind) {
    case "main":
      return "modrek/main";
    case "platform":
      return `modrek/platforms/${sanitizeSegment(scope.id, "unknown")}`;
    case "user":
      return `modrek/users/${sanitizeSegment(scope.id, "unknown")}`;
    case "course":
      return `modrek/courses/${sanitizeSegment(scope.id, "unknown")}`;
    case "chat":
      return `modrek/users/${sanitizeSegment(scope.userId, "unknown")}/chat/${sanitizeSegment(scope.id, "unknown")}`;
  }
}

export function buildStoragePath(scope: StorageScope, category: string, fileName: string, mime = ""): string {
  const ext = extensionOf(fileName, mime);
  const base = sanitizeSegment(fileName.replace(/\.[^.]+$/, ""), "file").slice(0, 60);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${scopePrefix(scope)}/${sanitizeSegment(category, "files")}/${base}-${unique}.${ext}`;
}

function toFile(input: File | Blob, fileName?: string): File {
  if (input instanceof File && !fileName) return input;
  const name = fileName || (input instanceof File ? input.name : "file");
  return new File([input], name, { type: input.type || "application/octet-stream" });
}

/** Core upload: any file type, always to Bunny. */
export async function uploadFile(options: UploadOptions): Promise<StoredFile> {
  const file = toFile(options.file, options.fileName);
  const storagePath = buildStoragePath(options.scope, options.category, file.name, file.type);
  const url = await uploadToBunnyStorage(
    file,
    storagePath,
    options.onProgress,
    options.accessToken ?? null,
    options.onXhrReady,
  );
  return {
    url,
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    file_size: file.size,
  };
}

export async function uploadImage(options: UploadOptions & { maxBytes?: number }): Promise<StoredFile> {
  const file = toFile(options.file, options.fileName);
  if (file.type && !file.type.startsWith("image/")) throw new Error("الملف المختار ليس صورة");
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error("حجم الصورة كبير جدًا");
  return uploadFile({ ...options, file });
}

export async function uploadVideo(options: UploadOptions & { maxBytes?: number }): Promise<StoredFile> {
  const file = toFile(options.file, options.fileName);
  const maxBytes = options.maxBytes ?? 500 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error("حجم الفيديو كبير جدًا");
  return uploadFile({ ...options, file });
}

export async function uploadDocument(options: UploadOptions & { maxBytes?: number }): Promise<StoredFile> {
  const file = toFile(options.file, options.fileName);
  const maxBytes = options.maxBytes ?? 500 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error("حجم الملف كبير جدًا");
  return uploadFile({ ...options, file });
}

/** Upload an audio recording (voice notes / assistant audio). */
export async function uploadAudio(options: UploadOptions): Promise<StoredFile> {
  return uploadFile(options);
}

/** Upload a `data:` URI (used to move Base64 content out of PostgreSQL). */
export async function uploadDataUrl(
  dataUrl: string,
  options: Omit<UploadOptions, "file" | "fileName"> & { fileName?: string },
): Promise<StoredFile> {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("قيمة الملف غير صالحة");
  const mime = match[1] || "application/octet-stream";
  const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const name = options.fileName || `upload.${extensionOf("", mime)}`;
  return uploadFile({ ...options, file: new File([bytes], name, { type: mime }) });
}

/** Delete a stored file from Bunny (no-op for legacy/external URLs). */
export async function deleteFile(urlOrPath: string): Promise<boolean> {
  const path = isBunnyStorageFile(urlOrPath) ? extractBunnyStoragePath(urlOrPath) : null;
  if (!path) return false;
  const { supabaseUrl, supabaseKey } = getSupabaseFunctionsConfig();
  const token = await getCurrentAccessToken();
  if (!token || !supabaseUrl) return false;
  const res = await fetch(
    `${supabaseUrl}/functions/v1/bunny-storage?action=delete&path=${encodeURIComponent(path)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey } },
  );
  return res.ok;
}

/**
 * Resolve any stored value into a URL usable by the browser.
 * Handles Bunny values, legacy Supabase private-bucket values (signed on the
 * fly during the migration window) and plain public/CDN URLs.
 */
export async function getFileUrl(
  urlOrPath: string | null | undefined,
  opts: { legacyBucket?: string; expiresInSec?: number; media?: boolean } = {},
): Promise<string> {
  if (!urlOrPath) return "";
  if (isBunnyStorageFile(urlOrPath)) {
    return opts.media ? resolveBunnyStorageMediaUrl(urlOrPath) : resolveBunnyStorageUrl(urlOrPath);
  }
  if (urlOrPath.startsWith("data:")) return urlOrPath;
  if (opts.legacyBucket && !urlOrPath.startsWith("http")) {
    const { data } = await supabase.storage
      .from(opts.legacyBucket)
      .createSignedUrl(urlOrPath, opts.expiresInSec ?? 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  if (opts.legacyBucket && urlOrPath.includes("/storage/v1/object/")) {
    const { getPrivateFileSignedUrl } = await import("@/lib/privateStorage");
    return getPrivateFileSignedUrl(opts.legacyBucket, urlOrPath, opts.expiresInSec ?? 3600);
  }
  return urlOrPath;
}

/** Fetch a protected file as a Blob (PDF viewers, downloads). */
export async function getFileBlob(urlOrPath: string): Promise<Blob> {
  return fetchBunnyStorageBlob(urlOrPath);
}

export type FileMigrationAction = "scan" | "run" | "status" | "purge";

/**
 * Trigger the server-side migration worker (admin only). Kept here so the
 * whole app has a single storage entry point.
 */
export async function migrateFile(action: FileMigrationAction, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("storage-migrate", {
    body: { action, ...payload },
  });
  if (error) throw error;
  return data;
}

export { isBunnyStorageFile, extractBunnyStoragePath };
