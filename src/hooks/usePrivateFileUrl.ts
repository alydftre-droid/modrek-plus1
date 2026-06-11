import { useEffect, useState } from "react";
import { getPrivateFileSignedUrl } from "@/lib/privateStorage";

/**
 * React hook that resolves a private storage value (public URL string or path)
 * into a freshly signed URL. Returns the original value while signing, and
 * the resolved signed URL when ready.
 */
export function usePrivateFileUrl(bucket: string, urlOrPath: string | null | undefined, expiresInSec = 3600) {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!urlOrPath) { setSigned(null); return; }
    getPrivateFileSignedUrl(bucket, urlOrPath, expiresInSec).then((u) => {
      if (!cancelled) setSigned(u);
    });
    return () => { cancelled = true; };
  }, [bucket, urlOrPath, expiresInSec]);

  return signed;
}
