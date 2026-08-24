import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveVideoUrl, isBunnyVideo } from "@/lib/bunnyStream";
import { getSignedPlayback } from "@/lib/bunnyPlayback";
import WatermarkOverlay from "@/components/video/WatermarkOverlay";
import { useSecureVideoScreen } from "@/hooks/useSecureVideoScreen";
import Hls from "hls.js";

import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  X,
  Loader2,
  Smartphone,
  PictureInPicture2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProtectedVideoPlayerProps {
  contentId: string;
  url: string;
  title: string;
  onClose: () => void;
}

const ProtectedVideoPlayer = ({ contentId, url, title, onClose }: ProtectedVideoPlayerProps) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const resumeSecondsRef = useRef(0);
  const lastRecordedTimeRef = useRef(0);
  const watchedThisSessionRef = useRef(0);
  const lastSavedProgressRef = useRef(0);
  const sessionLoggedRef = useRef(false);

  // Resolve playback URL — Bunny videos are served through a short-lived signed
  // URL issued by the `bunny-stream` edge function. Non-Bunny URLs are used as-is.
  const resolved = useMemo(() => resolveVideoUrl(url), [url]);
  const isBunny = useMemo(() => isBunnyVideo(url), [url]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedError, setSignedError] = useState<string | null>(null);
  const [signedLoading, setSignedLoading] = useState(false);
  const [signRetry, setSignRetry] = useState(0);
  const playbackUrl = isBunny ? (signedUrl ?? "") : resolved.url;
  const isHls = resolved.isHls;
  const hlsRef = useRef<Hls | null>(null);

  // Android FLAG_SECURE — blocks screenshots/recording/recents while mounted.
  useSecureVideoScreen();

  // Fetch signed URL for Bunny videos before starting HLS attach.
  useEffect(() => {
    if (!isBunny) return;
    let cancelled = false;
    setSignedUrl(null);
    setSignedError(null);
    setSignedLoading(true);
    (async () => {
      try {
        const sp = await getSignedPlayback(url);
        if (cancelled) return;
        if (sp) {
          setSignedUrl(sp.playbackUrl);
        } else {
          setSignedError("تعذر تجهيز رابط التشغيل الآمن. يرجى إعادة المحاولة.");
        }
      } catch {
        if (!cancelled) setSignedError("حدث خطأ أثناء تجهيز الفيديو. يرجى إعادة المحاولة.");
      } finally {
        if (!cancelled) setSignedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isBunny, url, signRetry]);


  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSkipIndicator, setShowSkipIndicator] = useState<"fwd" | "bwd" | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [screenRecordingDetected, setScreenRecordingDetected] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPip, setIsPip] = useState(false);
  const [qualityLevel, setQualityLevel] = useState<number>(-1); // -1 = auto

  // ── HLS.js attachment for adaptive streaming (Native-like) ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isHls || !playbackUrl) return;


    // Safari has native HLS support (iOS native player path)
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = playbackUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // ⚡ Fast startup — small initial buffer, grows as it plays
        backBufferLength: 20,
        maxBufferLength: 20,
        maxMaxBufferLength: 45,
        maxBufferSize: 40 * 1000 * 1000, // 40MB (lighter on memory)
        // 📶 Adaptive: start at a sensible bitrate guess (~700kbps) then ABR takes over
        abrEwmaDefaultEstimate: 700_000,
        startLevel: -1,
        capLevelToPlayerSize: true,
        // 🔁 Aggressive recovery for flaky mobile networks
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        autoStartLoad: true,
      });
      hls.loadSource(playbackUrl);
      hls.attachMedia(v);

      let netRetries = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (netRetries++ < 5) {
              setTimeout(() => hls.startLoad(), Math.min(500 * netRetries, 3000));
            } else {
              hls.destroy();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
        }
      });
      hlsRef.current = hls;
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Fallback: just set src and hope for the best
    v.src = playbackUrl;
  }, [playbackUrl, isHls]);

  // ── MediaSession API: notification & lock-screen controls (native-like) ──
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
        title,
        artist: "مدرك Plus",
        album: "محاضرات",
      });
      const ms = (navigator as any).mediaSession;
      ms.setActionHandler?.("play", () => { videoRef.current?.play(); setPlaying(true); });
      ms.setActionHandler?.("pause", () => { videoRef.current?.pause(); setPlaying(false); });
      ms.setActionHandler?.("seekbackward", () => skip(-10));
      ms.setActionHandler?.("seekforward", () => skip(10));
      ms.setActionHandler?.("seekto", (d: any) => {
        const v = videoRef.current;
        if (v && typeof d.seekTime === "number") v.currentTime = d.seekTime;
      });
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    return () => {
      try {
        const ms = (navigator as any).mediaSession;
        ["play","pause","seekbackward","seekforward","seekto"].forEach((a) => ms.setActionHandler?.(a, null));
      } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    };
  }, [title]);

  // ── Wake Lock: prevent screen sleep while video plays ──
  useEffect(() => {
    let lock: any = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (playing && "wakeLock" in navigator) {
          lock = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    };
    const release = async () => {
      try { await lock?.release?.(); lock = null; } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    };
    if (playing) acquire();
    else release();
    const onVis = () => {
      if (!cancelled && document.visibilityState === "visible" && playing) acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); release(); };
  }, [playing]);

  // Apply playback rate
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = playbackRate;
  }, [playbackRate]);

  // PiP state listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setIsPip(true);
    const onLeave = () => setIsPip(false);
    v.addEventListener("enterpictureinpicture", onEnter);
    v.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      v.removeEventListener("enterpictureinpicture", onEnter);
      v.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if ((v as any).requestPictureInPicture) {
        await (v as any).requestPictureInPicture();
      }
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
  }, []);

  // ── Anti-download / anti-copy (mount-only listeners) ──
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);

    const preventKeys = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && (e.key === "s" || e.key === "u")) ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        e.key === "F12" ||
        e.key === "PrintScreen"
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", preventKeys);

    // Detect Picture-in-Picture (could be used to record)
    const handlePipEnter = () => {
      const vid = videoRef.current;
      if (vid) {
        vid.pause();
        setPlaying(false);
      }
    };
    const vEl = videoRef.current;
    vEl?.addEventListener("enterpictureinpicture", handlePipEnter);

    // Detect display capture API usage — wrap once and restore on unmount
    let restoreDisplayMedia: (() => void) | null = null;
    try {
      const md = navigator.mediaDevices;
      if (md && typeof (md as any).getDisplayMedia === "function") {
        const original = (md as any).getDisplayMedia.bind(md);
        (md as any).getDisplayMedia = async (..._args: any[]) => {
          setScreenRecordingDetected(true);
          const vid = videoRef.current;
          if (vid && !vid.paused) {
            vid.pause();
            setPlaying(false);
          }
          throw new Error("Screen recording is not allowed");
        };
        restoreDisplayMedia = () => {
          try { (md as any).getDisplayMedia = original; } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
        };
      }
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("keydown", preventKeys);
      vEl?.removeEventListener("enterpictureinpicture", handlePipEnter);
      restoreDisplayMedia?.();
    };
  }, []);

  // ── Pause when tab is hidden while playing ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && playing) {
        const v = videoRef.current;
        if (v && !v.paused) {
          v.pause();
          setPlaying(false);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [playing]);

  // ── Landscape orientation toggle ──
  const toggleLandscape = useCallback(async () => {
    try {
      const orientation = screen.orientation;
      if (isLandscape) {
        await orientation.unlock();
        setIsLandscape(false);
      } else {
        await orientation.lock("landscape");
        setIsLandscape(true);
      }
    } catch {
      // Fallback: just toggle fullscreen which usually triggers landscape on mobile
      const el = containerRef.current;
      if (el) {
        if (!document.fullscreenElement) {
          await el.requestFullscreen?.();
        }
      }
      setIsLandscape(!isLandscape);
    }
  }, [isLandscape]);

  // Listen for orientation changes
  useEffect(() => {
    const handleOrientationChange = () => {
      const isLand = screen.orientation?.type?.includes("landscape") || window.innerWidth > window.innerHeight;
      setIsLandscape(isLand);
    };
    screen.orientation?.addEventListener("change", handleOrientationChange);
    window.addEventListener("resize", handleOrientationChange);
    return () => {
      screen.orientation?.removeEventListener("change", handleOrientationChange);
      window.removeEventListener("resize", handleOrientationChange);
      // Unlock orientation on close
      try { screen.orientation?.unlock(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    };
  }, []);

  useEffect(() => {
    const loadSavedProgress = async () => {
      if (!contentId) return;

      // 1) Fast local fallback (works offline, instant)
      try {
        const localKey = `vp:${user?.id || "anon"}:${contentId}`;
        const localVal = parseInt(localStorage.getItem(localKey) || "0", 10);
        if (localVal > 0) {
          resumeSecondsRef.current = localVal;
          lastSavedProgressRef.current = localVal;
        }
      } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

      if (!user?.id) return;
      const { data, error } = await supabase
        .from("video_progress")
        .select("progress_seconds")
        .eq("user_id", user.id)
        .eq("content_id", contentId)
        .maybeSingle();

      if (error) {
        console.error("Failed to load saved video progress:", error);
        return;
      }

      const savedSeconds = Math.max(0, Math.floor(data?.progress_seconds || 0));
      if (savedSeconds > resumeSecondsRef.current) {
        resumeSecondsRef.current = savedSeconds;
        lastSavedProgressRef.current = savedSeconds;
      }
    };

    void loadSavedProgress();
  }, [contentId, user?.id]);

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
    if (!v) return;

    const now = v.currentTime;
    const previous = lastRecordedTimeRef.current;

    if (!v.paused && !v.seeking) {
      const delta = now - previous;
      if (delta > 0 && delta <= 5) {
        watchedThisSessionRef.current += delta;
      }
    }

    lastRecordedTimeRef.current = now;
    setCurrentTime(now);
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;

    setDuration(v.duration);

    const safeResume = Math.min(
      resumeSecondsRef.current,
      Math.max(0, Math.floor(v.duration || 0) - 3)
    );

    if (safeResume > 3 && v.currentTime < 1) {
      v.currentTime = safeResume;
      lastRecordedTimeRef.current = safeResume;
      setCurrentTime(safeResume);
    }
  };

  const persistProgress = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !contentId) return;

    const durationSeconds = Math.max(0, Math.floor(v.duration || duration || 0));
    const currentSeconds = Math.max(0, Math.floor(v.currentTime || 0));
    const progressSeconds = Math.max(
      resumeSecondsRef.current,
      lastSavedProgressRef.current,
      currentSeconds
    );

    if (progressSeconds <= 0 && durationSeconds <= 0) return;

    // Always mirror to localStorage — instant + offline-safe
    try {
      localStorage.setItem(`vp:${user?.id || "anon"}:${contentId}`, String(progressSeconds));
    } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }

    if (!user?.id) return;


    const { error } = await supabase
      .from("video_progress")
      .upsert(
        {
          user_id: user.id,
          content_id: contentId,
          progress_seconds: progressSeconds,
          duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,content_id" }
      );

    if (error) {
      console.error("Failed to save video progress:", error);
      return;
    }

    lastSavedProgressRef.current = progressSeconds;
  }, [contentId, duration, user?.id]);

  const persistSessionActivity = useCallback(async () => {
    if (sessionLoggedRef.current || !user?.id || !contentId) return;

    const watchedSeconds = Math.floor(watchedThisSessionRef.current);
    if (watchedSeconds < 5) return;

    sessionLoggedRef.current = true;

    const { error } = await supabase.from("usage_logs").insert({
      user_id: user.id,
      content_id: contentId,
      action: "video_watch",
      duration_minutes: Math.max(1, Math.round(watchedSeconds / 60)),
    });

    if (error) {
      sessionLoggedRef.current = false;
      console.error("Failed to save video activity:", error);
    }
  }, [contentId, user?.id]);

  useEffect(() => {
    if (!playing) return;

    const interval = window.setInterval(() => {
      void persistProgress();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [persistProgress, playing]);

  useEffect(() => {
    return () => {
      void persistProgress();
      void persistSessionActivity();
    };
  }, [persistProgress, persistSessionActivity]);

  const handleClose = async () => {
    // Unlock orientation before closing
    try { screen.orientation?.unlock(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); }
    await persistProgress();
    await persistSessionActivity();
    onClose();
  };

  const handleEnded = async () => {
    const v = videoRef.current;
    if (v) {
      lastSavedProgressRef.current = Math.floor(v.duration || 0);
    }
    setPlaying(false);
    await persistProgress();
    await persistSessionActivity();
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    v.currentTime = ratio * v.duration;
  };

  // Double-tap sides to skip ±10s
  const lastTapRef = useRef<{ time: number; side: "left" | "right" | null }>({ time: 0, side: null });

  const handleTap = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const side = x < rect.width * 0.35 ? "left" : x > rect.width * 0.65 ? "right" : null;
    const now = Date.now();

    if (side && lastTapRef.current.side === side && now - lastTapRef.current.time < 400) {
      // Double tap detected
      if (side === "left") skip(-10);
      else skip(10);
      lastTapRef.current = { time: 0, side: null };
      return;
    }

    lastTapRef.current = { time: now, side };

    // Single tap - toggle controls/play
    if (!side) {
      togglePlay();
    } else {
      // Single tap on sides just shows controls
      resetHideTimer();
    }
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
      {/* Screen recording detection overlay */}
      {screenRecordingDetected && (
        <div className="absolute inset-0 z-[200] bg-black flex items-center justify-center">
          <div className="text-center text-white p-8">
            <div className="text-6xl mb-4">🚫</div>
            <h2 className="text-2xl font-bold mb-2">تم اكتشاف تسجيل الشاشة</h2>
            <p className="text-muted-foreground mb-4">لا يُسمح بتسجيل الشاشة أثناء مشاهدة المحتوى</p>
            <Button variant="outline" onClick={() => setScreenRecordingDetected(false)}>
              حسنًا، فهمت
            </Button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center select-none"
        onMouseMove={resetHideTimer}
        onClick={handleTap}
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      >
        {/* Native video element — HLS (Bunny) via hls.js OR direct MP4 */}
        <video
          ref={videoRef}
          {...(!isHls ? { src: playbackUrl } : {})}
          className="max-w-full max-h-full w-full h-full object-contain"
          playsInline
          preload="metadata"
          controlsList="nodownload nofullscreen noremoteplayback"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={() => { void handleEnded(); }}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />

        {/* Subtle rotating student-ID watermark (shows a few seconds every ~2 min) */}
        <WatermarkOverlay />



        {/* Custom controls overlay */}
        {(
          <>
            {/* Signed URL loading / error overlay for Bunny videos */}
            {isBunny && (signedLoading || signedError) && !signedUrl && (
              <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/90 pointer-events-auto">
                <div className="text-center text-white px-6 max-w-sm">
                  {signedError ? (
                    <>
                      <div className="text-5xl mb-3">⚠️</div>
                      <p className="text-base mb-5 leading-relaxed">{signedError}</p>
                      <div className="flex gap-2 justify-center">
                        <Button
                          variant="default"
                          onClick={(e) => { e.stopPropagation(); setSignRetry((n) => n + 1); }}
                        >
                          إعادة المحاولة
                        </Button>
                        <Button variant="outline" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                          إغلاق
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin opacity-80" />
                      <p className="text-sm opacity-80">جارٍ تجهيز التشغيل الآمن…</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Buffering spinner */}
            <AnimatePresence>
              {buffering && playing && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="bg-black/50 backdrop-blur-sm rounded-full p-4">
                    <Loader2 className="h-10 w-10 text-white animate-spin" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Invisible overlay to prevent interaction with video element */}
            <div className="absolute inset-0" style={{ pointerEvents: "auto" }} />

            {/* Double-tap skip indicator */}
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
                      {/* Playback speed */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                            title="سرعة التشغيل"
                          >
                            <span className="text-xs font-bold tabular-nums">{playbackRate}x</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[100px]" onClick={(e) => e.stopPropagation()}>
                          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                            <DropdownMenuItem
                              key={r}
                              onClick={() => setPlaybackRate(r)}
                              className={r === playbackRate ? "bg-primary/10 font-bold" : ""}
                            >
                              {r}x {r === 1 && "(عادي)"}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* Picture-in-Picture */}
                      {typeof document !== "undefined" && (document as any).pictureInPictureEnabled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                          onClick={(e) => { e.stopPropagation(); void togglePip(); }}
                          title="نافذة عائمة"
                        >
                          <PictureInPicture2 className={`h-5 w-5 ${isPip ? "text-primary" : ""}`} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                      >
                        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </Button>
                      {/* Landscape rotation button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 rounded-full h-10 w-10"
                        onClick={(e) => { e.stopPropagation(); void toggleLandscape(); }}
                        title={isLandscape ? "وضع عمودي" : "وضع أفقي"}
                      >
                        <Smartphone className={`h-5 w-5 transition-transform ${isLandscape ? "rotate-0" : "rotate-90"}`} />
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

            {/* Watermark overlay */}
            <div
              className="absolute inset-0 pointer-events-none select-none overflow-hidden opacity-[0.04]"
              style={{ userSelect: "none" }}
            >
              <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-20 rotate-[-30deg] scale-150">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className="text-white text-lg font-bold whitespace-nowrap">
                    مدرك Plus
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Top bar — always visible for close button */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 via-black/30 to-transparent flex items-center justify-between pointer-events-auto z-10"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleClose();
                }}
              >
                <X className="h-6 w-6" />
              </Button>
              <h3 className="text-white font-bold text-base truncate max-w-[60%] text-center">
                {title}
              </h3>
              <div className="w-10" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ProtectedVideoPlayer;
