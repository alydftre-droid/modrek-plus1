import { useEffect, useState } from "react";
import { getFileUrl, isBunnyStorageFile } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves persisted file references before they reach browser media elements.
 * In production, migrated files are stored as `bstorage://...`; assigning that
 * value directly to <img src> makes the browser treat it as an unsupported URL.
 */
export function useStoredFileUrl(value: string | null | undefined, media = true, retry = 0, legacyBucket?: string) {
  const [epoch, setEpoch] = useState(0);
  const [result, setResult] = useState<{ value: string; url: string }>();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") setResult(undefined);
      setEpoch(n => n + 1);
    });
    const refresh = () => setEpoch(n => n + 1);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30 * 60 * 1000);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!value) { setResult(undefined); return; }
    const resolve = async () => {
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          let url = await getFileUrl(value, { media, legacyBucket });
          if (retry && isBunnyStorageFile(value)) {
            const fresh = new URL(url);
            fresh.searchParams.set("noredirect", "1");
            fresh.searchParams.set("retry", `${epoch}-${retry}-${Date.now()}`);
            url = fresh.toString();
          }
          if (!cancelled) setResult({ value, url });
          return;
        } catch {
          if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 750 * (attempt + 1)));
        }
      }
      if (!cancelled) setResult(undefined);
    };
    void resolve();

    return () => {
      cancelled = true;
    };
  }, [value, media, retry, legacyBucket, epoch]);

  // Never display another source's previous URL, or a raw storage protocol.
  if (result?.value === value) return result.url || undefined;
  return value && !isBunnyStorageFile(value) && !legacyBucket ? value : undefined;
}