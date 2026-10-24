import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { canRetryStoredFile, useStoredFileUrl } from "@/hooks/useStoredFileUrl";

interface StoredImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  source: string | null | undefined;
  /** Shown when the source cannot be resolved or fails to load. */
  fallbackSrc?: string;
  /** Rendered instead of an empty box when the picture is missing or broken. */
  fallbackNode?: ReactNode;
}

/** Image that understands Bunny `bstorage://` references and normal web URLs. */
export default function StoredImage({ source, fallbackSrc, fallbackNode, onError, ...props }: StoredImageProps) {
  const [retry, setRetry] = useState(0);
  const src = useStoredFileUrl(source, true, retry);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRetry(0);
  }, [source]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const finalSrc = failed || !src ? fallbackSrc : src;
  if (!finalSrc) return <>{fallbackNode ?? null}</>;

  return <img {...props} src={finalSrc} onError={(event) => {
    if (finalSrc === src && retry < 2 && canRetryStoredFile(source)) setRetry(n => n + 1);
    else { setFailed(true); onError?.(event); }
  }} />;
}
