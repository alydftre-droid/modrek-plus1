import { usePrivateFileUrl } from "@/hooks/usePrivateFileUrl";
import { canRetryStoredFile } from "@/hooks/useStoredFileUrl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ImageOff, RotateCw } from "lucide-react";

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
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const signed = usePrivateFileUrl(bucket, url, 3600, retry);
  const src = signed || "";
  useEffect(() => { setRetry(0); setFailed(false); }, [url]);
  useEffect(() => setFailed(false), [src]);
  const imageError = () => {
    if (retry < 2 && canRetryStoredFile(url)) setRetry(n => n + 1);
    else setFailed(true);
  };

  if (type === "image") {
    if (failed) return <div className="flex items-center gap-2 text-muted-foreground">
      <ImageOff className="h-5 w-5" /><span>تعذر تحميل الصورة</span>
      <Button variant="ghost" size="icon" aria-label="إعادة تحميل الصورة" title="إعادة تحميل الصورة" onClick={() => { setFailed(false); setRetry(n => n + 1); }}><RotateCw className="h-4 w-4" /></Button>
    </div>;
    if (!src) return <div className="h-24 w-40 animate-pulse rounded-lg bg-muted" aria-label="جارٍ تحميل الصورة" />;
    return <Dialog>
      <DialogTrigger asChild><Button variant="ghost" className="h-auto max-w-full p-0" aria-label="فتح الصورة">
        <img src={src} alt="صورة" className="rounded-lg max-w-full max-h-48 mb-1 object-contain" onError={imageError} />
      </Button></DialogTrigger>
      <DialogContent className="max-w-4xl w-[calc(100%-2rem)]" aria-describedby={undefined}>
        <DialogTitle className="sr-only">صورة الرسالة</DialogTitle>
        <img src={src} alt="صورة الرسالة" className="max-h-[80dvh] w-full object-contain" onError={imageError} />
      </DialogContent>
    </Dialog>;
  }
  if (type === "audio") {
    return <audio controls src={src} className="max-w-full mb-1" />;
  }
  return null;
}
