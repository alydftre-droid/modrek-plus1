import { useEffect, useState } from "react";
import { canRetryStoredFile, useStoredFileUrl } from "@/hooks/useStoredFileUrl";

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  bucket: string;
  urlOrPath: string | null | undefined;
  fallback?: string;
}

export default function PrivateImage({ bucket, urlOrPath, fallback, onError, ...img }: Props) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const resolved = useStoredFileUrl(urlOrPath, true, retry, bucket);
  const src = failed ? fallback : resolved || fallback;

  useEffect(() => {
    setRetry(0);
    setFailed(false);
  }, [bucket, urlOrPath]);
  useEffect(() => setFailed(false), [resolved]);

  if (!src) return null;
  return <img {...img} src={src} onError={(event) => {
    if (src === resolved && retry < 2 && canRetryStoredFile(urlOrPath)) setRetry(n => n + 1);
    else { setFailed(true); onError?.(event); }
  }} />;
}
