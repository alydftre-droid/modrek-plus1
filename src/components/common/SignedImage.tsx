import { ImgHTMLAttributes } from "react";
import { useSignedBucketUrl } from "@/lib/privateStorage";

interface SignedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  bucket: string;
  url: string | null | undefined;
  expiresInSec?: number;
}

/**
 * Drop-in replacement for <img> that transparently resolves a Supabase
 * private-bucket URL/path into a signed URL. Preserves all visual styling.
 */
export function SignedImage({ bucket, url, expiresInSec, ...imgProps }: SignedImageProps) {
  const signed = useSignedBucketUrl(bucket, url, expiresInSec);
  if (!signed) return null;
  return <img src={signed} {...imgProps} />;
}
