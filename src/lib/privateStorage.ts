import { useStoredFileUrl } from "@/hooks/useStoredFileUrl";
import { supabase } from "@/integrations/supabase/client";

/**
 * Extracts the object path inside a bucket from either:
 *  - a raw path (e.g. "user-id/file.jpg")
 *  - a Supabase public URL (.../storage/v1/object/public/<bucket>/<path>)
 *  - a Supabase signed URL  (.../storage/v1/object/sign/<bucket>/<path>?token=...)
 *  - a value already prefixed with "<bucket>/<path>"
 */
export function extractStoragePath(bucket: string, value: string): string {
  if (!value) return value;
  try {
    if (value.startsWith("http")) {
      const url = new URL(value);
      const marker = `/storage/v1/object/`;
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        const rest = url.pathname.slice(idx + marker.length);
        const parts = rest.split("/");
        if (parts.length >= 3 && parts[1] === bucket) {
          return decodeURIComponent(parts.slice(2).join("/"));
        }
      }
    }
  } catch {
    /* fall through */
  }
  if (value.startsWith(`${bucket}/`)) return value.slice(bucket.length + 1);
  return value;
}

/**
 * Detects whether a stored value points at a given Supabase bucket
 * (matches both public-URL legacy values and bare paths).
 */
export function valueBelongsToBucket(bucket: string, value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.startsWith("http")) {
    try {
      const u = new URL(value);
      return u.pathname.includes(`/storage/v1/object/`) && u.pathname.includes(`/${bucket}/`);
    } catch {
      return false;
    }
  }
  // Bare path uploaded into <bucket>/<teacher_id>/...
  return true;
}

/**
 * Resolves a private storage value (URL or path) into a fresh signed URL.
 * Falls back to the original string if signing fails.
 */
export async function getPrivateFileSignedUrl(
  bucket: string,
  urlOrPath: string,
  expiresInSec = 3600,
): Promise<string> {
  if (!urlOrPath) return urlOrPath;
  // New files live on Bunny (`bstorage://...`). Route them through the storage
  // proxy so every existing viewer keeps working without changes.
  if (urlOrPath.startsWith("bstorage://") || urlOrPath.includes("b-cdn.net")) {
    const { resolveBunnyStorageMediaUrl } = await import("@/lib/bunnyStorage");
    return resolveBunnyStorageMediaUrl(urlOrPath);
  }
  if (urlOrPath.startsWith("data:")) return urlOrPath;
  if (urlOrPath.startsWith("blob:") || (urlOrPath.startsWith("http") && !urlOrPath.includes("/storage/v1/object/"))) return urlOrPath;
  const path = extractStoragePath(bucket, urlOrPath);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) return urlOrPath;
  return data.signedUrl;
}

/**
 * React hook: resolves a bucket URL/path to a signed URL transparently.
 * Returns the signed URL once available, otherwise the original value as a placeholder.
 */
export function useSignedBucketUrl(
  bucket: string,
  urlOrPath: string | null | undefined,
  expiresInSec = 3600,
): string | undefined {
  return useStoredFileUrl(urlOrPath, true, 0, bucket);
}
