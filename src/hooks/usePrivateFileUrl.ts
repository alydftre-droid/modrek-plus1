import { useEffect, useState } from "react";

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
    (async () => {
      const { getPrivateFileSignedUrl } = await import("@/lib/privateStorage");
      const u = await getPrivateFileSignedUrl(bucket, urlOrPath, expiresInSec);
      if (!cancelled) setSigned(u);
    })();
    return () => { cancelled = true; };
  }, [bucket, urlOrPath, expiresInSec]);

  return signed;
}
