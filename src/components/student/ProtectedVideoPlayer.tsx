import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ChevronLeft,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProtectedVideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

const ProtectedVideoPlayer = ({ url, title, onClose }: ProtectedVideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSkipIndicator, setShowSkipIndicator] = useState<"fwd" | "bwd" | null>(null);

  // ── Anti-download / anti-copy measures ──
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    
    const preventKeys = (e: KeyboardEvent) => {
      // Block Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12
      if (
        (e.ctrlKey && (e.key === "s" || e.key === "u")) ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        e.key === "F12"
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", preventKeys);

    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("keydown", preventKeys);
    };
  }, []);

  // ── Auto-hide controls ──
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3500);
    }
  }, [playing]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [playing, resetHideTimer]);

  // ── Fullscreen change ──
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Video event handlers ──
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const skip = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds));
    setShowSkipIndicator(seconds > 0 ? "fwd" : "bwd");
    setTimeout(() => setShowSkipIndicator(null), 600);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (v) setDuration(v.duration);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    v.currentTime = ratio * v.duration;
  };

  // Double-tap sides to skip
  const handleDoubleTap = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.35) skip(-10);
    else if (x > rect.width * 0.65) skip(10);
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center select-none"
        onMouseMove={resetHideTimer}
        onClick={togglePlay}
        onDoubleClick={handleDoubleTap}
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      >
        {/* Video Element - protected */}
        <video
          ref={videoRef}
          src={url}
          className="max-w-full max-h-full w-full h-full object-contain"
          playsInline
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setPlaying(false)}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />

        {/* Invisible overlay to prevent interaction with video element */}
        <div className="absolute inset-0" style={{ pointerEvents: "auto" }} />

        {/* Skip indicator */}
        <AnimatePresence>
          {showSkipIndicator && (
            <motion.div
              className={`absolute top-1/2 -translate-y-1/2 ${showSkipIndicator === "fwd" ? "right-16" : "left-16"} bg-white/20 backdrop-blur-sm rounded-full p-5`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {showSkipIndicator === "fwd" ? (
                <RotateCw className="h-8 w-8 text-white" />
              ) : (
                <RotateCcw className="h-8 w-8 text-white" />
              )}
              <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-white text-xs font-bold">
                10 ث
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Big play button when paused */}
        <AnimatePresence>
          {!playing && showControls && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <div className="bg-primary/80 backdrop-blur-md rounded-full p-6 shadow-2xl shadow-primary/30">
                <Play className="h-12 w-12 text-primary-foreground fill-primary-foreground" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top bar */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent flex items-center justify-between pointer-events-auto"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 rounded-full"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
              >
                <X className="h-6 w-6" />
              </Button>
              <h3 className="text-white font-bold text-base truncate max-w-[60%] text-center">
                {title}
              </h3>
              <div className="w-10" /> {/* spacer */}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom controls */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-6 pt-12 pointer-events-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress bar */}
              <div
                ref={progressRef}
                className="w-full h-2 bg-white/25 rounded-full mb-4 cursor-pointer group relative"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-primary rounded-full relative transition-all"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg shadow-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); skip(-10); }}
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full h-12 w-12"
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  >
                    {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 fill-white" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); skip(10); }}
                  >
                    <RotateCw className="h-5 w-5" />
                  </Button>
                </div>

                <div className="text-white text-sm font-medium tabular-nums">
                  {fmt(currentTime)} / {fmt(duration)}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  >
                    {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                  >
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Watermark overlay to discourage screen recording */}
        <div
          className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-[0.04]"
          style={{ userSelect: "none" }}
        >
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-20 rotate-[-30deg] scale-150">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="text-white text-lg font-bold whitespace-nowrap">
                أزهاريون
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProtectedVideoPlayer;
