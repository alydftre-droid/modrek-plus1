import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { useStoredFileUrl } from "@/hooks/useStoredFileUrl";

interface StoredImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  source: string | null | undefined;
  /** Shown when the source cannot be resolved or fails to load. */
  fallbackSrc?: string;
}

/** Image that understands Bunny `bstorage://` references and normal web URLs. */
export default function StoredImage({ source, fallbackSrc, ...props }: StoredImageProps) {
  const src = useStoredFileUrl(source);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const finalSrc = failed || !src ? fallbackSrc : src;
  if (!finalSrc) return null;

  return <img {...props} src={finalSrc} onError={() => setFailed(true)} />;
}
