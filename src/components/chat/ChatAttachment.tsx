import { usePrivateFileUrl } from "@/hooks/usePrivateFileUrl";

interface Props {
  url: string;
  type: "image" | "audio" | string | null | undefined;
  bucket?: string;
}

/**
 * Renders a chat attachment (image or audio) stored in a PRIVATE storage bucket.
 * It resolves the original value (which may be a public URL or a path) into a
 * fresh signed URL before rendering.
 */
export default function ChatAttachment({ url, type, bucket = "payment-receipts" }: Props) {
  const signed = usePrivateFileUrl(bucket, url);
  const src = signed || "";

  if (type === "image") {
    return (
      <img
        src={src}
        alt="صورة"
        className="rounded-lg max-w-full max-h-48 mb-1 cursor-pointer"
        onClick={() => src && window.open(src, "_blank")}
      />
    );
  }
  if (type === "audio") {
    return <audio controls src={src} className="max-w-full mb-1" />;
  }
  return null;
}
