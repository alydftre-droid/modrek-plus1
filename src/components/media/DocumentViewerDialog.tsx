import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, ZoomIn, ZoomOut, Download, RefreshCw, FileWarning } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { fetchBunnyStorageBlob } from "@/lib/bunnyStorage";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  open: boolean;
  onClose: () => void;
  fileUrl: string;
  title?: string;
}

function guessKind(fileUrl: string, blobType?: string): "pdf" | "image" | "other" {
  const clean = fileUrl.split("?")[0].toLowerCase();
  if (blobType?.includes("pdf") || clean.endsWith(".pdf")) return "pdf";
  if (blobType?.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(clean)) return "image";
  return "other";
}

/**
 * In-app document viewer. Files stored on Bunny Storage are fetched with an
 * Authorization header and rendered locally (PDF.js canvases / <img>), instead
 * of being opened in an external browser tab — which produced a blank white
 * page on Android.
 */
export default function DocumentViewerDialog({ open, onClose, fileUrl, title }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<number>(0);
  const [scale, setScale] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const renderTokenRef = useRef(0);

  const kind = useMemo(() => guessKind(fileUrl, blob?.type), [fileUrl, blob]);

  // Load the file bytes
  useEffect(() => {
    if (!open || !fileUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlob(null);
    fetchBunnyStorageBlob(fileUrl)
      .then((b) => {
        if (cancelled) return;
        setBlob(b);
        setObjectUrl(URL.createObjectURL(b));
      })
      .catch((err) => {
        if (cancelled) return;
        const message = String(err?.message || err);
        setError(
          message.includes("AUTH")
            ? "انتهت صلاحية الجلسة. أعد تحميل الصفحة ثم حاول مرة أخرى."
            : message.includes("404")
              ? "الملف غير موجود على السيرفر أو ليس لديك صلاحية فتحه."
              : "تعذر تحميل الملف. تحقق من الاتصال وحاول مرة أخرى.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fileUrl, attempt]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Render PDF pages
  const renderPdf = useCallback(async () => {
    if (!blob || kind !== "pdf" || !canvasHostRef.current) return;
    const token = ++renderTokenRef.current;
    const host = canvasHostRef.current;
    host.innerHTML = "";
    try {
      const data = new Uint8Array(await blob.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      if (token !== renderTokenRef.current) return;
      setPages(pdf.numPages);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const containerWidth = host.clientWidth || 320;
      for (let i = 1; i <= pdf.numPages; i += 1) {
        if (token !== renderTokenRef.current) return;
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const fit = (containerWidth - 8) / base.width;
        const viewport = page.getViewport({ scale: fit * scale * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";
        canvas.style.marginBottom = "12px";
        canvas.style.borderRadius = "10px";
        canvas.style.background = "#fff";
        host.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
    } catch {
      setError("تعذر عرض ملف PDF. يمكنك تحميله لفتحه على جهازك.");
    }
  }, [blob, kind, scale]);

  useEffect(() => {
    void renderPdf();
  }, [renderPdf]);

  useEffect(() => {
    if (!open) {
      renderTokenRef.current += 1;
      setScale(1);
      setPages(0);
    }
  }, [open]);

  if (!open) return null;

  const downloadName = (title || "file").replace(/[\\/:*?"<>|]+/g, "_");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" dir="rtl">
      <header className="flex items-center gap-2 border-b border-border/60 bg-card/95 px-3 py-2 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
          <X className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{title || "عرض الملف"}</p>
          {kind === "pdf" && pages > 0 && (
            <p className="text-[11px] text-muted-foreground">{pages} صفحة</p>
          )}
        </div>
        {kind === "pdf" && (
          <>
            <Button variant="ghost" size="icon" aria-label="تصغير" onClick={() => setScale((s) => Math.max(0.6, +(s - 0.25).toFixed(2)))}>
              <ZoomOut className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="تكبير" onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))}>
              <ZoomIn className="h-5 w-5" />
            </Button>
          </>
        )}
        {objectUrl && (
          <a href={objectUrl} download={downloadName} className="inline-flex">
            <Button variant="ghost" size="icon" aria-label="تحميل">
              <Download className="h-5 w-5" />
            </Button>
          </a>
        )}
      </header>

      <div className="flex-1 overflow-auto bg-muted/40 p-2">
        {loading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm font-semibold">جارٍ تحميل الملف...</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <FileWarning className="h-10 w-10 text-destructive" />
            <p className="text-sm font-semibold text-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)} className="gap-2">
              <RefreshCw className="h-4 w-4" /> إعادة المحاولة
            </Button>
          </div>
        )}

        {!loading && !error && kind === "pdf" && <div ref={canvasHostRef} className="mx-auto w-full max-w-3xl" />}

        {!loading && !error && kind === "image" && objectUrl && (
          <div className="flex min-h-full items-center justify-center">
            <img src={objectUrl} alt={title || "ملف"} className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
        )}

        {!loading && !error && kind === "other" && objectUrl && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm font-semibold">هذا النوع من الملفات لا يمكن عرضه داخل التطبيق.</p>
            <a href={objectUrl} download={downloadName}>
              <Button className="gap-2">
                <Download className="h-4 w-4" /> تحميل الملف
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
