import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { extractBunnyVideoId, isBunnyVideo } from "@/lib/bunnyStream";
import { getSignedPlayback } from "@/lib/bunnyPlayback";
import WatermarkOverlay from "@/components/video/WatermarkOverlay";
import { useSecureVideoScreen } from "@/hooks/useSecureVideoScreen";

interface BunnyStreamPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

/**
 * Official Bunny Stream professional player (iframe embed).
 * Playback URL is issued by the `bunny-stream` edge function as a short-lived
 * signed URL (4h) so:
 *  - the real CDN URL is never bound directly in the client bundle,
 *  - Bunny's token authentication blocks direct hot-linking / sharing,
 *  - only students with a valid grant on the underlying content row can play.
 */
const BunnyStreamPlayer = ({ url, title, onClose }: BunnyStreamPlayerProps) => {
  const videoId = isBunnyVideo(url) ? extractBunnyVideoId(url) : null;
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Android FLAG_SECURE — screenshots / recording / recents-preview blocked while mounted.
  useSecureVideoScreen();

  // Fetch signed playback URL once per open. Cached client-side until near expiry.
  useEffect(() => {
    let cancelled = false;
    if (!videoId) return;
    setEmbedUrl(null);
    setError(null);
    (async () => {
      const sp = await getSignedPlayback(videoId);
      if (cancelled) return;
      if (!sp) {
        setError("تعذر تشغيل الفيديو. يرجى إعادة المحاولة.");
        return;
      }
      setEmbedUrl(sp.embedUrl);
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  // Block context menu / common save shortcuts while open
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (
        (e.ctrlKey && (e.key === "s" || e.key === "u")) ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        e.key === "F12"
      ) e.preventDefault();
    };
    const preventDrag = (e: DragEvent) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("keydown", onKey);
    document.addEventListener("dragstart", preventDrag);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("dragstart", preventDrag);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!videoId) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black/80 text-white">
        <h3 className="text-sm sm:text-base font-semibold truncate flex-1 text-center">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Player */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="relative w-full h-full max-w-[1400px] mx-auto">
          {embedUrl ? (
            <>
              <iframe
                src={embedUrl}
                loading="lazy"
                title={title}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; fullscreen;"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
              {/* Subtle rotating student ID watermark */}
              <WatermarkOverlay />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3">
              {error ? (
                <p className="text-sm text-red-300">{error}</p>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin opacity-80" />
                  <p className="text-xs opacity-70">جارٍ تجهيز التشغيل الآمن…</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default BunnyStreamPlayer;
