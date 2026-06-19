import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { extractBunnyVideoId, isBunnyVideo } from "@/lib/bunnyStream";

const BUNNY_LIBRARY_ID = "686928";

interface BunnyStreamPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

/**
 * Official Bunny Stream professional player (iframe embed).
 * Provides: adaptive bitrate, quality selector, speed controls, fullscreen,
 * picture-in-picture, captions, watermarking and DRM (when configured on the library).
 */
const BunnyStreamPlayer = ({ url, title, onClose }: BunnyStreamPlayerProps) => {
  const videoId = isBunnyVideo(url) ? extractBunnyVideoId(url) : null;

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
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!videoId) return null;

  const embedUrl =
    `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoId}` +
    `?autoplay=true&preload=true&responsive=true`;

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
          <iframe
            src={embedUrl}
            loading="lazy"
            title={title}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default BunnyStreamPlayer;
