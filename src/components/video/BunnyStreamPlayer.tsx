import { useEffect, useRef, useState, useCallback, memo } from "react";
import Hls from "hls.js";
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, RotateCw, Loader2, Check, ChevronRight, ChevronLeft,
} from "lucide-react";
import { extractBunnyVideoId, isBunnyVideo } from "@/lib/bunnyStream";
import { getSignedPlayback } from "@/lib/bunnyPlayback";
import WatermarkOverlay from "@/components/video/WatermarkOverlay";
import { useSecureVideoScreen } from "@/hooks/useSecureVideoScreen";
import { lockOrientation, unlockOrientation } from "@/lib/screenOrientation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

interface Props {
  url: string;
  title: string;
  onClose: () => void;
  contentId?: string;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DOUBLE_TAP_MS = 260;
const CONTROLS_HIDE_MS = 2800;

interface QualityLevel {
  index: number;      // -1 = auto
  label: string;      // "1080p" | "Auto"
  height: number;     // 0 for auto
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

const BunnyStreamPlayer = ({ url, title, onClose, contentId }: Props) => {
  const { user } = useAuth();
  const videoId = isBunnyVideo(url) ? extractBunnyVideoId(url) : null;

  /* refs */
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ t: number; side: "l" | "m" | "r" } | null>(null);
  const seekAccumRef = useRef<{ side: "l" | "r"; secs: number; timer: number | null } | null>(null);
  const savedProgressRef = useRef(0);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const seekingRef = useRef(false);

  /* state */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState<QualityLevel[]>([{ index: -1, label: "Auto", height: 0 }]);
  const [currentLevel, setCurrentLevel] = useState(-1); // -1 auto
  const [autoActiveHeight, setAutoActiveHeight] = useState(0);
  const [settingsPane, setSettingsPane] = useState<"root" | "speed" | "quality" | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [seekFx, setSeekFx] = useState<{ side: "l" | "r"; secs: number; key: number } | null>(null);
  const [readyToLoad, setReadyToLoad] = useState(false);
  const [resumeAt, setResumeAt] = useState(0);
  const [showCenterIcon, setShowCenterIcon] = useState<"play" | "pause" | null>(null);

  useSecureVideoScreen();

  /* ---------------- Resume position ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (contentId && user?.id) {
        try {
          const { data } = await supabase
            .from("video_progress")
            .select("progress_seconds")
            .eq("content_id", contentId)
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled && data?.progress_seconds && data.progress_seconds > 5) {
            setResumeAt(data.progress_seconds);
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setReadyToLoad(true);
    })();
    return () => { cancelled = true; };
  }, [contentId, user?.id]);

  /* ---------------- Attach HLS / native ---------------- */
  useEffect(() => {
    if (!videoId || !readyToLoad) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const sp = await getSignedPlayback(videoId);
      if (cancelled) return;
      if (!sp?.playbackUrl) { setError("تعذر تحميل الفيديو"); setLoading(false); return; }
      const video = videoRef.current;
      if (!video) return;

      const src = sp.playbackUrl;
      const attachEvents = () => {
        video.addEventListener("loadedmetadata", () => {
          setDuration(video.duration || 0);
          if (resumeAt > 0 && resumeAt < (video.duration || Infinity) - 3) {
            try { video.currentTime = resumeAt; } catch { /* ignore */ }
          }
          setLoading(false);
          // autoplay attempt
          video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        }, { once: true });
      };

      if (Hls.isSupported() && !video.canPlayType("application/vnd.apple.mpegurl")) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          backBufferLength: 30,
          startLevel: -1,
          capLevelToPlayerSize: true,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const built: QualityLevel[] = [{ index: -1, label: "Auto", height: 0 }];
          hls.levels
            .map((l, i) => ({ i, h: l.height || 0 }))
            .sort((a, b) => b.h - a.h)
            .forEach(({ i, h }) => built.push({ index: i, label: h ? `${h}p` : `Level ${i + 1}`, height: h }));
          setLevels(built);
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          const h = hls.levels[data.level]?.height || 0;
          setAutoActiveHeight(h);
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
              case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
              default: setError("خطأ في تشغيل الفيديو");
            }
          }
        });
        attachEvents();
      } else {
        // native HLS (Safari / iOS)
        video.src = src;
        attachEvents();
      }
    })();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [videoId, readyToLoad, resumeAt]);

  /* ---------------- Video event bindings ---------------- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!seekingRef.current) setCurrent(v.currentTime);
      try {
        const b = v.buffered;
        if (b.length) setBuffered(b.end(b.length - 1));
      } catch { /* ignore */ }
    };
    const onDur = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWait = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onVol = () => { setMuted(v.muted); setVolume(v.volume); };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWait);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onCanPlay);
    v.addEventListener("volumechange", onVol);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onCanPlay);
      v.removeEventListener("volumechange", onVol);
    };
  }, []);

  /* ---------------- Persist progress ---------------- */
  useEffect(() => {
    if (!contentId || !user?.id) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || v.currentTime <= 0) return;
      const c = v.currentTime;
      if (Math.abs(c - savedProgressRef.current) < 5) return;
      savedProgressRef.current = c;
      supabase.from("video_progress").upsert(
        {
          user_id: user.id,
          content_id: contentId,
          progress_seconds: Math.floor(c),
          duration_seconds: Math.floor(v.duration || 0),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,content_id" },
      ).then(() => {}, () => {});
    }, 4000);
    return () => window.clearInterval(id);
  }, [contentId, user?.id]);

  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (contentId && user?.id && v && v.currentTime > 0) {
        supabase.from("video_progress").upsert(
          {
            user_id: user.id,
            content_id: contentId,
            progress_seconds: Math.floor(v.currentTime),
            duration_seconds: Math.floor(v.duration || 0),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_id" },
        ).then(() => {}, () => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Body / keyboard / context menu ---------------- */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const noCtx = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", noCtx);
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); seekBy(-5); break;
        case "ArrowRight": e.preventDefault(); seekBy(5); break;
        case "j": seekBy(-10); break;
        case "l": seekBy(10); break;
        case "m": if (v) { v.muted = !v.muted; } break;
        case "f": toggleFullscreen(); break;
        case "Escape": if (document.fullscreenElement) document.exitFullscreen(); else onClose(); break;
      }
    };
    document.addEventListener("keydown", onKey);
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("contextmenu", noCtx);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      if (landscape) unlockOrientation().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Auto-hide controls ---------------- */
  const kickControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!seekingRef.current && !settingsPane) setShowControls(false);
    }, CONTROLS_HIDE_MS);
  }, [settingsPane]);

  useEffect(() => { kickControls(); }, [kickControls]);

  /* ---------------- Playback controls ---------------- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setShowCenterIcon("play"); }
    else { v.pause(); setShowCenterIcon("pause"); }
    window.setTimeout(() => setShowCenterIcon(null), 500);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current; if (!v) return;
    const next = Math.max(0, Math.min((v.duration || 0) - 0.5, v.currentTime + delta));
    v.currentTime = next;
    setCurrent(next);
  }, []);

  const flashSeek = useCallback((side: "l" | "r", delta: number) => {
    seekBy(delta);
    const acc = seekAccumRef.current;
    let secs = Math.abs(delta);
    if (acc && acc.side === side) {
      secs = acc.secs + Math.abs(delta);
      if (acc.timer) window.clearTimeout(acc.timer);
    }
    const timer = window.setTimeout(() => { seekAccumRef.current = null; setSeekFx(null); }, 650);
    seekAccumRef.current = { side, secs, timer };
    setSeekFx({ side, secs, key: performance.now() });
  }, [seekBy]);

  /* ---------------- Tap logic (single vs double-tap sides) ---------------- */
  const handleStageTap = useCallback((e: React.PointerEvent) => {
    if (settingsPane) { setSettingsPane(null); return; }
    if (zoom > 1) { kickControls(); return; } // don't interfere while zoomed
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = (e.clientX - rect.left) / rect.width;
    const side: "l" | "m" | "r" = rel < 0.33 ? "l" : rel > 0.67 ? "r" : "m";
    const now = performance.now();
    const last = lastTapRef.current;

    if (last && now - last.t < DOUBLE_TAP_MS && last.side === side && side !== "m") {
      // Double tap on side → seek
      if (tapTimerRef.current) { window.clearTimeout(tapTimerRef.current); tapTimerRef.current = null; }
      lastTapRef.current = null;
      flashSeek(side, side === "l" ? -10 : 10);
      return;
    }

    lastTapRef.current = { t: now, side };
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      // Single tap: middle → play/pause + toggle controls, sides → toggle controls
      if (side === "m") togglePlay();
      else setShowControls((s) => !s);
      kickControls();
      tapTimerRef.current = null;
    }, DOUBLE_TAP_MS);
  }, [flashSeek, kickControls, settingsPane, togglePlay, zoom]);

  /* ---------------- Pinch zoom + pan ---------------- */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { dist, zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      const t = e.touches[0];
      panStartRef.current = { x: t.clientX, y: t.clientY, px: pan.x, py: pan.y };
    }
  }, [pan.x, pan.y, zoom]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.max(1, Math.min(4, pinchRef.current.zoom * (dist / pinchRef.current.dist)));
      setZoom(next);
      if (next === 1) setPan({ x: 0, y: 0 });
      e.preventDefault();
    } else if (e.touches.length === 1 && panStartRef.current && zoom > 1) {
      const t = e.touches[0];
      const dx = t.clientX - panStartRef.current.x;
      const dy = t.clientY - panStartRef.current.y;
      const bound = (v: number, max: number) => Math.max(-max, Math.min(max, v));
      const rect = stageRef.current?.getBoundingClientRect();
      const maxX = rect ? (rect.width * (zoom - 1)) / 2 : 200;
      const maxY = rect ? (rect.height * (zoom - 1)) / 2 : 200;
      setPan({ x: bound(panStartRef.current.px + dx, maxX), y: bound(panStartRef.current.py + dy, maxY) });
      e.preventDefault();
    }
  }, [zoom]);

  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
    panStartRef.current = null;
  }, []);

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  /* ---------------- Fullscreen & rotation ---------------- */
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (rootRef.current) {
        await rootRef.current.requestFullscreen();
      }
    } catch { /* ignore */ }
  }, []);

  const toggleRotate = useCallback(async () => {
    try {
      if (landscape) { await unlockOrientation(); setLandscape(false); }
      else { await lockOrientation("landscape"); setLandscape(true); }
    } catch { /* ignore */ }
  }, [landscape]);

  /* ---------------- Quality / speed ---------------- */
  const setQuality = (idx: number) => {
    const hls = hlsRef.current;
    if (hls) hls.currentLevel = idx;
    setCurrentLevel(idx);
    setSettingsPane(null);
  };
  const setPlaybackSpeed = (s: number) => {
    const v = videoRef.current; if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    setSettingsPane(null);
  };

  /* ---------------- Progress bar seek ---------------- */
  const onSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current; if (!v || !duration) return;
    const val = Number(e.target.value);
    seekingRef.current = true;
    setCurrent(val);
    v.currentTime = val;
  };
  const onSeekCommit = () => { seekingRef.current = false; kickControls(); };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  const currentLabel = (() => {
    if (currentLevel === -1) {
      return autoActiveHeight ? `Auto (${autoActiveHeight}p)` : "Auto";
    }
    return levels.find((l) => l.index === currentLevel)?.label || "Auto";
  })();

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none"
      style={{ touchAction: "none" }}
    >
      {/* Video stage */}
      <div
        ref={stageRef}
        className="relative w-full h-full overflow-hidden"
        onPointerUp={handleStageTap}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseMove={kickControls}
      >
        <video
          ref={videoRef}
          className="w-full h-full bg-black"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: "center center",
            transition: pinchRef.current || panStartRef.current ? "none" : "transform 180ms ease-out",
          }}
          playsInline
          webkit-playsinline="true"
          x-webkit-airplay="allow"
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          preload="metadata"
        />

        <WatermarkOverlay />

        {/* Loading */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-center px-6">
            <div>
              <p className="mb-4">{error}</p>
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20">إغلاق</button>
            </div>
          </div>
        )}

        {/* Center play/pause ping */}
        {showCenterIcon && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-in fade-in zoom-in duration-200">
            <div className="bg-black/50 rounded-full p-4 backdrop-blur-sm">
              {showCenterIcon === "play"
                ? <Play className="h-10 w-10 text-white fill-white" />
                : <Pause className="h-10 w-10 text-white fill-white" />}
            </div>
          </div>
        )}

        {/* Seek FX */}
        {seekFx && (
          <div
            key={seekFx.key}
            className={`pointer-events-none absolute top-0 bottom-0 ${seekFx.side === "l" ? "left-0" : "right-0"} w-1/3 flex items-center justify-center`}
          >
            <div className="bg-white/15 backdrop-blur-md rounded-full px-5 py-3 flex items-center gap-2 text-white font-bold animate-in fade-in zoom-in duration-150">
              {seekFx.side === "l" ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
              <span>{seekFx.secs} ثانية</span>
              {seekFx.side === "r" ? <ChevronRight className="h-6 w-6" /> : <ChevronLeft className="h-6 w-6" />}
            </div>
          </div>
        )}

        {/* Top bar */}
        <div
          className={`absolute top-0 inset-x-0 px-3 pb-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-200 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 text-white">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-95 transition"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="text-sm md:text-base font-semibold truncate flex-1">{title}</h3>
            {zoom > 1 && (
              <button
                onClick={resetZoom}
                className="text-xs px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25"
              >
                إعادة الحجم ({zoom.toFixed(1)}x)
              </button>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div
          className={`absolute bottom-0 inset-x-0 px-3 pt-8 bg-gradient-to-t from-black/85 via-black/50 to-transparent transition-opacity duration-200 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="relative h-6 flex items-center group">
            <div className="absolute inset-x-0 h-1 bg-white/25 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-white/40"
                style={{ width: duration ? `${(buffered / duration) * 100}%` : "0%" }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-red-500"
                style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={onSeekInput}
              onMouseUp={onSeekCommit}
              onTouchEnd={onSeekCommit}
              className="relative w-full h-6 appearance-none bg-transparent cursor-pointer video-seek"
              aria-label="التقدم"
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1 md:gap-2 text-white pt-1">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:scale-95 transition"
              aria-label={playing ? "إيقاف" : "تشغيل"}
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>
            <button
              onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:scale-95 transition"
              aria-label={muted ? "إلغاء الكتم" : "كتم"}
            >
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <div className="text-xs md:text-sm tabular-nums font-medium mx-1" dir="ltr">
              {fmt(current)} / {fmt(duration)}
            </div>
            <div className="flex-1" />
            <button
              onClick={toggleRotate}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:scale-95 transition md:hidden"
              aria-label="تدوير"
            >
              <RotateCw className={`h-5 w-5 ${landscape ? "text-red-400" : ""}`} />
            </button>
            <button
              onClick={() => setSettingsPane(settingsPane ? null : "root")}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:scale-95 transition"
              aria-label="إعدادات"
            >
              <Settings className={`h-5 w-5 ${settingsPane ? "text-red-400" : ""}`} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:scale-95 transition"
              aria-label="ملء الشاشة"
            >
              {isFs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Settings pane */}
        {settingsPane && (
          <div
            className="absolute bottom-20 right-3 z-20 min-w-[220px] max-h-[60vh] overflow-y-auto rounded-xl bg-black/90 backdrop-blur-md text-white text-sm shadow-2xl border border-white/10"
            onPointerUp={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {settingsPane === "root" && (
              <div className="py-1.5">
                <button
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/10"
                  onClick={() => setSettingsPane("speed")}
                >
                  <span>سرعة التشغيل</span>
                  <span className="text-white/60 flex items-center gap-1">{speed === 1 ? "عادي" : `${speed}x`} <ChevronLeft className="h-4 w-4" /></span>
                </button>
                <button
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/10"
                  onClick={() => setSettingsPane("quality")}
                >
                  <span>الجودة</span>
                  <span className="text-white/60 flex items-center gap-1">{currentLabel} <ChevronLeft className="h-4 w-4" /></span>
                </button>
              </div>
            )}

            {settingsPane === "speed" && (
              <div className="py-1.5">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/10 border-b border-white/10 mb-1"
                  onClick={() => setSettingsPane("root")}
                >
                  <ChevronRight className="h-4 w-4" /> <span>سرعة التشغيل</span>
                </button>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaybackSpeed(s)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/10"
                  >
                    <span>{s === 1 ? "عادي" : `${s}x`}</span>
                    {speed === s && <Check className="h-4 w-4 text-red-400" />}
                  </button>
                ))}
              </div>
            )}

            {settingsPane === "quality" && (
              <div className="py-1.5">
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/10 border-b border-white/10 mb-1"
                  onClick={() => setSettingsPane("root")}
                >
                  <ChevronRight className="h-4 w-4" /> <span>الجودة</span>
                </button>
                {levels.map((lvl) => (
                  <button
                    key={lvl.index}
                    onClick={() => setQuality(lvl.index)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/10"
                  >
                    <span>
                      {lvl.label}
                      {lvl.index === -1 && autoActiveHeight ? (
                        <span className="text-white/50 text-xs mr-2">({autoActiveHeight}p)</span>
                      ) : null}
                    </span>
                    {currentLevel === lvl.index && <Check className="h-4 w-4 text-red-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slider thumb styling */}
      <style>{`
        .video-seek { outline: none; }
        .video-seek::-webkit-slider-runnable-track { background: transparent; height: 6px; }
        .video-seek::-moz-range-track { background: transparent; height: 6px; }
        .video-seek::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #ef4444; border: 2px solid white;
          margin-top: -4px;
          box-shadow: 0 0 4px rgba(0,0,0,0.4);
        }
        .video-seek::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: #ef4444; border: 2px solid white;
        }
      `}</style>
    </div>
  );
};

export default memo(BunnyStreamPlayer);
