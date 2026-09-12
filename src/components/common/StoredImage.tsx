import type { ImgHTMLAttributes } from "react";
import { useStoredFileUrl } from "@/hooks/useStoredFileUrl";

interface StoredImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  source: string | null | undefined;
}

/** Image that understands Bunny `bstorage://` references and normal web URLs. */
export default function StoredImage({ source, ...props }: StoredImageProps) {
  const src = useStoredFileUrl(source);
  if (!src) return null;
  return <img {...props} src={src} />;
}