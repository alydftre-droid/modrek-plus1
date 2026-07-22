import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Loader2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCw,
  Gauge,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { extractBunnyVideoId, isBunnyVideo } from "@/lib/bunnyStream";
import { getSignedPlayback } from "@/lib/bunnyPlayback";
import WatermarkOverlay from "@/components/video/WatermarkOverlay";
import { useSecureVideoScreen } from "@/hooks/useSecureVideoScreen";
import { lockOrientation, unlockOrientation } from "@/lib/screenOrientation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BunnyStreamPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
  contentId?: string;
}

/** Format seconds → mm:ss or h:mm:ss */
const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const p = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
};

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

/**
 * Professional Bunny Stream player:
 *  - Player.js postMessage bridge for custom controls (play/pause/seek/speed/mute)
 *  - Pinch-to-zoom + pan
 *  - Double-tap seek ±10s
 *  - Long-press = 2x speed
 *  - Custom fullscreen (Fullscreen API) + rotate to landscape
 *  - Resume from last watched position via video_progress
 *  - Signed playback URL (short-lived) issued by bunny-stream edge function
 */
const BunnyStreamPlayer = ({ url, title, onClose, contentId }: BunnyStreamPlayerProps) => {
  const { user } = useAuth();
  const videoId = isBunnyVideo(url) ? extractBunnyVideoId(url) : null;

  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [startTime, setStartTime] = useState<number>(0);
  const [startTimeReady, setStartTimeReady] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const controlsTimer = useRef<number | null>(null);
  const lastTapRef = useRef<{ t: number; x: number } | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const prevSpeedRef = useRef(1);
  const savedRef = useRef(0);
  const pinchRef = useRef<{ startDist: number; startZoom: number; startPan: { x: number; y: number }; startCenter: { x: number; y: number } } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);

  useSecureVideoScreen();

  // Load last watched position, then fetch signed playback URL with ?startTime=
  useEffect(() => {
    let cancelled = false;
    if (!videoId) return;
    (async () => {
      let resume = 0;
      if (contentId && user?.id) {
        try {
          const { data } = await supabase
            .from("video_progress")
            .select("progress_seconds")
            .eq("content_id", contentId)
            .eq("user_id", user.id)
            .maybeSingle();
          if (data?.progress_seconds && data.progress_seconds > 5) resume = data.progress_seconds;
        } catch { /* ignore */ }
      }
      if (cancelled) return;
      setStartTime(resume);
      setStartTimeReady(true);
    })();
    return () => { cancelled = true; };
  }, [videoId, contentId, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!videoId || !startTimeReady) return;
    setEmbedUrl(null);
    setError(null);
    (async () => {
      const sp = await getSignedPlayback(videoId);
      if (cancelled) return;
      if (!sp) { setError("تعذر تشغيل الفيديو. يرجى إعادة المحاولة."); return; }
      // Hide Bunny's native controls so only our custom bar is visible,
      // and append startTime if resuming from last watched position.
      const sep = sp.embedUrl.includes("?") ? "&" : "?";
      const params = [`controls=false`];
      if (startTime > 0) params.push(`startTime=${Math.floor(startTime)}`);
      setEmbedUrl(`${sp.embedUrl}${sep}${params.join("&")}`);
    })();
    return () => { cancelled = true; };
  }, [videoId, startTimeReady, startTime]);

  // ── Player.js postMessage bridge ────────────────────────────────────────
  const postToPlayer = useCallback((method: string, value?: any) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const msg: any = { context: "player.js", version: "0.0.7", method };
    if (value !== undefined) msg.value = value;
    if (["addEventListener", "removeEventListener"].includes(method)) {
      msg.listener = `l_${method}_${value}`;
    }
    try { iframe.contentWindow.postMessage(JSON.stringify(msg), "*"); } catch { /* ignore */ }
  }, []);

  // Listen to player.js events
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      let data: any = e.data;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch { return; } }
      if (data?.context !== "player.js") return;

      if (data.event === "ready") {
        setReady(true);
        // Subscribe to key events
        ["play", "pause", "timeupdate", "ended", "seeked"].forEach((ev) =>
          postToPlayer("addEventListener", ev),
        );
        postToPlayer("getDuration");
        postToPlayer("getPaused");
      }
      if (data.event === "play") setPaused(false);
      if (data.event === "pause" || data.event === "ended") setPaused(true);
      if (data.event === "timeupdate" && data.value) {
        if (typeof data.value.seconds === "number") setCurrent(data.value.seconds);
        if (typeof data.value.duration === "number" && data.value.duration > 0) setDuration(data.value.duration);
      }
      if (data.method === "getDuration" && typeof data.value === "number") setDuration(data.value);
      if (data.method === "getCurrentTime" && typeof data.value === "number") setCurrent(data.value);
      if (data.method === "getPaused" && typeof data.value === "boolean") setPaused(data.value);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [postToPlayer]);

  // Save progress every 5 seconds
  useEffect(() => {
    if (!contentId || !user?.id || !ready || current <= 0) return;
    if (Math.abs(current - savedRef.current) < 5) return;
    savedRef.current = current;
    supabase
      .from("video_progress")
      .upsert(
        {
          user_id: user.id,
          content_id: contentId,
          progress_seconds: Math.floor(current),
          duration_seconds: Math.floor(duration || 0),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,content_id" },
      )
      .then(() => {}, () => {});
  }, [current, duration, contentId, user?.id, ready]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (contentId && user?.id && current > 0) {
        supabase.from("video_progress").upsert(
          {
            user_id: user.id,
            content_id: contentId,
            progress_seconds: Math.floor(current),
            duration_seconds: Math.floor(duration || 0),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_id" },
        ).then(() => {}, () => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard / body scroll lock / cleanup ──────────────────────────────
  useEffect(() => {
    const preventCtx = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (isFullscreen) exitFullscreen(); else onClose(); }
      if ((e.ctrlKey && (e.key === "s" || e.key === "u")) || (e.ctrlKey && e.shiftKey && e.key === "I") || e.key === "F12") e.preventDefault();
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowRight") seekBy(10);
      if (e.key === "ArrowLeft") seekBy(-10);
    };
    document.addEventListener("contextmenu", preventCtx);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("contextmenu", preventCtx);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (landscape) unlockOrientation().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, landscape]);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Auto-hide controls
  const kickControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(() => setShowControls(false), 3500);
  }, []);
  useEffect(() => { kickControls(); }, [kickControls]);

  // ── Player controls ────────────────────────────────────────────────────
  const togglePlay = () => { paused ? postToPlayer("play") : postToPlayer("pause"); kickControls(); };
  const toggleMute = () => { const next = !muted; setMuted(next); postToPlayer(next ? "mute" : "unmute"); kickControls(); };
  const seekTo = (s: number) => { postToPlayer("setCurrentTime", Math.max(0, Math.min(s, duration || s))); setCurrent(s); };
  const seekBy = (delta: number) => seekTo(current + delta);
  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    // Bunny player.js supports 'setPlaybackRate' on newer builds; fallback silently.
    postToPlayer("setPlaybackRate", next);
    kickControls();
  };

  const enterFullscreen = async () => {
    const el: any = rootRef.current;
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) { try { await req.call(el); } catch { /* ignore */ } }
  };
  const exitFullscreen = async () => {
    const doc: any = document;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (exit && document.fullscreenElement) { try { await exit.call(doc); } catch { /* ignore */ } }
  };
  const toggleFullscreen = () => (isFullscreen ? exitFullscreen() : enterFullscreen());

  const toggleRotate = async () => {
    if (landscape) {
      await unlockOrientation().catch(() => {});
      setLandscape(false);
    } else {
      if (!isFullscreen) await enterFullscreen();
      await lockOrientation("landscape").catch(() => {});
      setLandscape(true);
    }
    kickControls();
  };

  // Zoom helpers
  const clampZoom = (z: number) => Math.max(1, Math.min(4, z));
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const stage = stageRef.current;
    if (!stage) return p;
    const w = stage.clientWidth, h = stage.clientHeight;
    const maxX = ((z - 1) * w) / 2;
    const maxY = ((z - 1) * h) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) };
  };
  const zoomIn = () => { const z = clampZoom(zoom + 0.5); setZoom(z); setPan((p) => clampPan(p, z)); };
  const zoomOut = () => { const z = clampZoom(zoom - 0.5); setZoom(z); setPan((p) => clampPan(p, z === 1 ? 1 : z)); if (z === 1) setPan({ x: 0, y: 0 }); };
  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ── Touch / mouse gesture handlers on gesture overlay ──────────────────
  const dist = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    kickControls();
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = {
        startDist: dist(a, b),
        startZoom: zoom,
        startPan: pan,
        startCenter: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
      };
      panRef.current = null;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      // Long-press for 2x speed
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      longPressTimer.current = window.setTimeout(() => {
        prevSpeedRef.current = speed;
        setSpeed(2); postToPlayer("setPlaybackRate", 2);
      }, 550);
      if (zoom > 1) {
        panRef.current = { startX: t.clientX, startY: t.clientY, startPan: pan };
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = dist(a, b);
      const scale = d / pinchRef.current.startDist;
      const nz = clampZoom(pinchRef.current.startZoom * scale);
      setZoom(nz);
      setPan((p) => clampPan(p, nz));
    } else if (e.touches.length === 1 && panRef.current && zoom > 1) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - panRef.current.startX;
      const dy = t.clientY - panRef.current.startY;
      setPan(clampPan({ x: panRef.current.startPan.x + dx, y: panRef.current.startPan.y + dy }, zoom));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current); longPressTimer.current = null;
      if (speed === 2 && prevSpeedRef.current !== 2) {
        setSpeed(prevSpeedRef.current); postToPlayer("setPlaybackRate", prevSpeedRef.current);
      }
    }
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) panRef.current = null;

    // Detect tap / double-tap only when zoom=1 and no pinch/pan happened
    if (e.changedTouches.length === 1 && zoom === 1 && !pinchRef.current && !panRef.current) {
      const t = e.changedTouches[0];
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && now - last.t < 300) {
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect) {
          const side = t.clientX < rect.left + rect.width / 2 ? "left" : "right";
          seekBy(side === "left" ? -10 : 10);
        }
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { t: now, x: t.clientX };
        // Single-tap toggles controls after a short delay to avoid double-tap collision
        window.setTimeout(() => {
          if (lastTapRef.current && Date.now() - lastTapRef.current.t >= 290) {
            setShowControls((s) => !s);
            lastTapRef.current = null;
          }
        }, 300);
      }
    }
  };

  if (!videoId) return null;

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black select-none"
      style={{ touchAction: "none" }}
    >
      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent text-white transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="p-2 rounded-full hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-sm sm:text-base font-semibold truncate flex-1 text-center">{title}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={zoomOut} disabled={zoom <= 1} className="p-2 rounded-full hover:bg-white/10 disabled:opacity-40" aria-label="تصغير">
            <ZoomOut className="h-5 w-5" />
          </button>
          <button type="button" onClick={zoomIn} disabled={zoom >= 4} className="p-2 rounded-full hover:bg-white/10 disabled:opacity-40" aria-label="تكبير">
            <ZoomIn className="h-5 w-5" />
          </button>
          {zoom > 1 && (
            <button type="button" onClick={resetZoom} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">
              {zoom.toFixed(1)}x ×
            </button>
          )}
        </div>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
        {embedUrl ? (
          <>
            <div
              className="absolute inset-0 origin-center will-change-transform"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: pinchRef.current || panRef.current ? "none" : "transform 0.18s ease-out",
              }}
            >
              <iframe
                ref={iframeRef}
                src={embedUrl}
                loading="lazy"
                title={title}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; fullscreen;"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
            <WatermarkOverlay />

            {/* Gesture layer — captures touch for pinch/pan/double-tap. Sits above iframe but under controls. */}
            <div
              className="absolute inset-0 z-20"
              style={{ touchAction: "none" }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
              onDoubleClick={(e) => {
                const rect = rootRef.current?.getBoundingClientRect();
                if (!rect) return;
                const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
                seekBy(side === "left" ? -10 : 10);
              }}
              onClick={() => setShowControls((s) => !s)}
            />

            {/* Center play/pause tap indicator (only shows briefly) */}
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

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 px-3 pt-8 pb-3 bg-gradient-to-t from-black/85 to-transparent text-white transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] tabular-nums w-10 text-center" dir="ltr">{fmt(current)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={Math.min(current, duration || current)}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            onInput={kickControls}
            className="flex-1 h-1.5 rounded-full appearance-none bg-white/25 accent-primary cursor-pointer"
            style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, rgba(255,255,255,0.25) ${pct}%)` }}
          />
          <span className="text-[11px] tabular-nums w-10 text-center" dir="ltr">{fmt(duration)}</span>
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={togglePlay} className="p-2 rounded-full hover:bg-white/10" aria-label={paused ? "تشغيل" : "إيقاف"}>
              {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button type="button" onClick={toggleMute} className="p-2 rounded-full hover:bg-white/10" aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}>
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <button type="button" onClick={cycleSpeed} className="flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/10 text-xs font-semibold" aria-label="السرعة">
              <Gauge className="h-4 w-4" />
              <span dir="ltr">{speed}x</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={toggleRotate} className={`p-2 rounded-full hover:bg-white/10 ${landscape ? "bg-white/20" : ""}`} aria-label="تدوير الشاشة">
              <RotateCw className="h-5 w-5" />
            </button>
            <button type="button" onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-white/10" aria-label={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}>
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default BunnyStreamPlayer;
