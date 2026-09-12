import { useEffect, useState } from "react";
import { getFileUrl, isBunnyStorageFile } from "@/lib/storage";

/**
 * Resolves persisted file references before they reach browser media elements.
 * In production, migrated files are stored as `bstorage://...`; assigning that
 * value directly to <img src> makes the browser treat it as an unsupported URL.
 */
export function useStoredFileUrl(value: string | null | undefined, media = true) {
  const [resolved, setResolved] = useState<string | undefined>(() =>
    value && !isBunnyStorageFile(value) ? value : undefined,
  );

  useEffect(() => {
    let cancelled = false;

    if (!value) {
      setResolved(undefined);
      return () => {
        cancelled = true;
      };
    }

    if (!isBunnyStorageFile(value)) {
      setResolved(value);
      return () => {
        cancelled = true;
      };
    }

    setResolved(undefined);
    getFileUrl(value, { media })
      .then((url) => {
        if (!cancelled) setResolved(url || undefined);
      })
      .catch((error) => {
        console.error("[stored-file] failed to resolve media URL", error);
        if (!cancelled) setResolved(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [value, media]);

  return resolved;
}