import { useStoredFileUrl } from "@/hooks/useStoredFileUrl";

/**
 * React hook that resolves a private storage value (public URL string or path)
 * into a freshly signed URL. Returns the original value while signing, and
 * the resolved signed URL when ready.
 */
export function usePrivateFileUrl(bucket: string, urlOrPath: string | null | undefined, _expiresInSec = 3600, retry = 0) {
  return useStoredFileUrl(urlOrPath, true, retry, bucket) || null;
}
