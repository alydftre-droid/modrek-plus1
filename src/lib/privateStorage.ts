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
        // strip "/storage/v1/object/(public|sign|authenticated)/<bucket>/"
        const rest = url.pathname.slice(idx + marker.length);
        const parts = rest.split("/");
        // parts[0] = public|sign|authenticated, parts[1] = bucket
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
 * Resolves a private storage value (URL or path) into a fresh signed URL.
 * Falls back to the original string if signing fails.
 */
export async function getPrivateFileSignedUrl(
  bucket: string,
  urlOrPath: string,
  expiresInSec = 3600,
): Promise<string> {
  if (!urlOrPath) return urlOrPath;
  const path = extractStoragePath(bucket, urlOrPath);
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) return urlOrPath;
  return data.signedUrl;
}
