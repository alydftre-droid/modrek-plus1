import { motion } from "framer-motion";
import { RotateCcw, Gauge, Maximize2, Minimize2 } from "lucide-react";

export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
export type PlaybackSpeed = (typeof SPEED_OPTIONS)[number];

interface Props {
  speed: number;
  onSpeedChange: (s: PlaybackSpeed) => void;
  theaterMode: boolean;
  onToggleTheater: () => void;
  onReplay: () => void;
  canReplay?: boolean;
  /** Position style. Defaults to bottom-right floating bar. */
  className?: string;
}

/**
 * Floating playback control bar: Replay + Speed + Theater toggle.
 * Used by AssistantLessonStudio and LibraryBookStudio.
 */
export function TutorPlaybackBar({
  speed,
  onSpeedChange,
  theaterMode,
  onToggleTheater,
  onReplay,
  canReplay = true,
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      dir="rtl"
      className={
        className ||
        "pointer-events-auto absolute bottom-3 right-3 z-[55] flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1.5 backdrop-blur-md shadow-lg border border-white/10"
      }
    >
      {/* Replay */}
      <button
        type="button"
        onClick={onReplay}
        disabled={!canReplay}
        title="إعادة تشغيل الشرح"
        className="h-8 w-8 rounded-full flex items-center justify-center text-white hover:bg-white/15 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RotateCcw className="h-4 w-4" />
      </button>

      <div className="h-5 w-px bg-white/15" />

      {/* Speed */}
      <div className="flex items-center gap-0.5 px-1">
        <Gauge className="h-3.5 w-3.5 text-white/70 ml-1" />
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className={`h-7 min-w-[34px] rounded-full px-2 text-[11px] font-bold transition ${
              Math.abs(speed - s) < 0.01
                ? "bg-emerald-400 text-emerald-950"
                : "text-white/85 hover:bg-white/15"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-white/15" />

      {/* Theater */}
      <button
        type="button"
        onClick={onToggleTheater}
        title={theaterMode ? "الخروج من وضع المسرح" : "وضع المسرح"}
        className={`h-8 w-8 rounded-full flex items-center justify-center transition ${
          theaterMode ? "bg-amber-400 text-amber-950" : "text-white hover:bg-white/15"
        }`}
      >
        {theaterMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </motion.div>
  );
}

export default TutorPlaybackBar;
