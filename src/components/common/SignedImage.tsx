import { ImgHTMLAttributes, type ReactNode } from "react";
import PrivateImage from "@/components/PrivateImage";

interface SignedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  bucket: string;
  url: string | null | undefined;
  expiresInSec?: number;
  fallbackNode?: ReactNode;
}

/**
 * Drop-in replacement for <img> that transparently resolves a Supabase
 * private-bucket URL/path into a signed URL. Preserves all visual styling.
 */
export function SignedImage({ bucket, url, expiresInSec, fallbackNode, ...imgProps }: SignedImageProps) {
  return <PrivateImage bucket={bucket} urlOrPath={url} fallbackNode={fallbackNode} {...imgProps} />;
}
