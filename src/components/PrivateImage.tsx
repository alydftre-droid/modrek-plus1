import { useEffect, useState } from "react";
import { getPrivateFileSignedUrl } from "@/lib/privateStorage";

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  bucket: string;
  urlOrPath: string | null | undefined;
  fallback?: string;
}

export default function PrivateImage({ bucket, urlOrPath, fallback, ...img }: Props) {
  const [src, setSrc] = useState<string | undefined>(fallback);

  useEffect(() => {
    let cancelled = false;
    if (!urlOrPath) { setSrc(fallback); return; }
    getPrivateFileSignedUrl(bucket, urlOrPath, 3600).then((u) => {
      if (!cancelled) setSrc(u);
    });
    return () => { cancelled = true; };
  }, [bucket, urlOrPath, fallback]);

  if (!src) return null;
  return <img {...img} src={src} />;
}
