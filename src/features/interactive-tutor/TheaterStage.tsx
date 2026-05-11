import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import AnnotationOverlay from "./AnnotationOverlay";
import TutorPlaybackBar, { type PlaybackSpeed } from "./TutorPlaybackBar";
import type { AnnotationShape } from "./types";

interface Props {
  open: boolean;
  imageUrl: string | null | undefined;
  annotations: AnnotationShape[];
  speed: number;
  replayKey: number;
  onClose: () => void;
  onReplay: () => void;
  onSpeedChange: (s: PlaybackSpeed) => void;
  title?: string;
}

/**
 * Theater Mode: fullscreen cinematic explanation stage.
 * Hides all chrome, shows only the page image + animated overlay
 * + minimal floating controls. Pure black backdrop for focus.
 */
export function TheaterStage({
  open,
  imageUrl,
  annotations,
  speed,
  replayKey,
  onClose,
  onReplay,
  onSpeedChange,
  title,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[200] flex flex-col"
          dir="rtl"
          style={{
            background:
              "radial-gradient(ellipse at center, #0a0f1c 0%, #050810 70%, #000 100%)",
          }}
        >
          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2 text-white/85 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold tracking-wide">وضع المسرح — شرح مباشر</span>
              {title && (
                <span className="opacity-60 truncate max-w-[40vw]">— {title}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white border border-white/10 transition"
              aria-label="إغلاق وضع المسرح"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stage center */}
          <div className="relative flex-1 flex items-center justify-center px-2 py-12">
            {imageUrl ? (
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="relative max-h-full max-w-full"
                style={{
                  boxShadow:
                    "0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
                }}
              >
                <img
                  src={imageUrl}
                  alt={title || "صفحة الشرح"}
                  className="block max-h-[calc(100dvh-130px)] max-w-[100vw] object-contain rounded-md select-none pointer-events-none"
                  draggable={false}
                />
                <AnnotationOverlay
                  key={replayKey}
                  annotations={annotations}
                  speed={speed}
                  playing
                />
              </motion.div>
            ) : (
              <div className="text-white/60 text-sm">لا توجد صفحة لعرضها</div>
            )}
          </div>

          {/* Bottom playback bar */}
          <div className="absolute bottom-0 inset-x-0 flex justify-center pb-5 pointer-events-none">
            <TutorPlaybackBar
              speed={speed}
              onSpeedChange={onSpeedChange}
              theaterMode={true}
              onToggleTheater={onClose}
              onReplay={onReplay}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1.5 backdrop-blur-xl shadow-2xl border border-white/15"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default TheaterStage;
