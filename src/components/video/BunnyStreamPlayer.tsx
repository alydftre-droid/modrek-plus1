import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Loader2,
  Maximize,
  Minimize,
  RotateCw,
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

/**
 * Bunny Stream player — uses Bunny's NATIVE control bar only.
 * We only add: close, pinch-to-zoom + pan, rotate to landscape, fullscreen, resume position.
 * No custom playback bar (no double bars, no conflicts).
 */
const BunnyStreamPlayer = ({ url, title, onClose, contentId }: BunnyStreamPlayerProps) => {
  const { user } = useAuth();
  const videoId = isBunnyVideo(url) ? extractBunnyVideoId(url) : null;

  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [startTime, setStartTime] = useState<number>(0);
  const [startTimeReady, setStartTimeReady] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayTimer = useRef<number | null>(null);
  const savedRef = useRef(0);
  const currentRef = useRef(0);
  const durationRef = useRef(0);
  const pinchRef = useRef<{ startDist: number; startZoom: number; startPan: { x: number; y: number } } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);

  useSecureVideoScreen();

  // Load last watched position first
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

  // Build embed URL with Bunny's native controls enabled
  useEffect(() => {
    let cancelled = false;
    if (!videoId || !startTimeReady) return;
    setEmbedUrl(null);
    setError(null);
    (async () => {
      const sp = await getSignedPlayback(videoId);
      if (cancelled) return;
      if (!sp) { setError("تعذر تشغيل الفيديو. يرجى إعادة المحاولة."); return; }
      const sep = sp.embedUrl.includes("?") ? "&" : "?";
      const params: string[] = [];
      if (startTime > 0) params.push(`t=${Math.floor(startTime)}`);
      setEmbedUrl(params.length ? `${sp.embedUrl}${sep}${params.join("&")}` : sp.embedUrl);
    })();
    return () => { cancelled = true; };
  }, [videoId, startTimeReady, startTime]);

  // Listen to Bunny player.js timeupdate messages so we can persist progress
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      let data: any = e.data;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch { return; } }
      if (data?.context !== "player.js") return;
      if (data.event === "ready") {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ context: "player.js", version: "0.0.7", method: "addEventListener", value: "timeupdate", listener: "l_time" }),
            "*",
          );
        } catch { /* ignore */ }
      }
      if (data.event === "timeupdate" && data.value) {
        if (typeof data.value.seconds === "number") currentRef.current = data.value.seconds;
        if (typeof data.value.duration === "number" && data.value.duration > 0) durationRef.current = data.value.duration;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Save progress every ~5s
  useEffect(() => {
    if (!contentId || !user?.id) return;
    const id = window.setInterval(() => {
      const c = currentRef.current;
      if (c <= 0 || Math.abs(c - savedRef.current) < 5) return;
      savedRef.current = c;
      supabase
        .from("video_progress")
        .upsert(
          {
            user_id: user.id,
            content_id: contentId,
            progress_seconds: Math.floor(c),
            duration_seconds: Math.floor(durationRef.current || 0),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_id" },
        )
        .then(() => {}, () => {});
    }, 3000);
    return () => window.clearInterval(id);
  }, [contentId, user?.id]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (contentId && user?.id && currentRef.current > 0) {
        supabase.from("video_progress").upsert(
          {
            user_id: user.id,
            content_id: contentId,
            progress_seconds: Math.floor(currentRef.current),
            duration_seconds: Math.floor(durationRef.current || 0),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,content_id" },
        ).then(() => {}, () => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard / body scroll lock / cleanup
  useEffect(() => {
    const preventCtx = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (isFullscreen) exitFullscreen(); else onClose(); }
      if ((e.ctrlKey && (e.key === "s" || e.key === "u")) || (e.ctrlKey && e.shiftKey && e.key === "I") || e.key === "F12") e.preventDefault();
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

  // Auto-hide our overlay chrome (close/zoom/rotate) after inactivity
  const kickOverlay = useCallback(() => {
    setShowOverlay(true);
    if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
    overlayTimer.current = window.setTimeout(() => setShowOverlay(false), 3500);
  }, []);
  useEffect(() => { kickOverlay(); }, [kickOverlay]);

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
    kickOverlay();
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
  const zoomIn = () => { const z = clampZoom(zoom + 0.5); setZoom(z); setPan((p) => clampPan(p, z)); kickOverlay(); };
  const zoomOut = () => { const z = clampZoom(zoom - 0.5); setZoom(z); if (z === 1) setPan({ x: 0, y: 0 }); else setPan((p) => clampPan(p, z)); kickOverlay(); };
  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }); kickOverlay(); };

  // Touch — ONLY for pinch-to-zoom + pan while zoomed. No tap/double-tap logic
  // (Bunny's native bar owns play/pause/seek).
  const dist = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    kickOverlay();
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchRef.current = { startDist: dist(a, b), startZoom: zoom, startPan: pan };
      panRef.current = null;
    } else if (e.touches.length === 1 && zoom > 1) {
      const t = e.touches[0];
      panRef.current = { startX: t.clientX, startY: t.clientY, startPan: pan };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
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
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) panRef.current = null;
  };

  if (!videoId) return null;

  // While zoomed, we cover the iframe with a gesture layer so pinch/pan work.
  // At zoom=1 the iframe receives all pointer events → Bunny's native controls are fully usable.
  const gestureActive = zoom > 1;

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black select-none"
    >
      {/* Top overlay: close + zoom + rotate + fullscreen. Auto-hides. */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent text-white transition-opacity duration-300 ${showOverlay ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <button type="button" onClick={onClose} aria-label="إغلاق" className="p-2 rounded-full hover:bg-white/10">
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
          <button type="button" onClick={toggleRotate} className={`p-2 rounded-full hover:bg-white/10 ${landscape ? "bg-white/20" : ""}`} aria-label="تدوير الشاشة">
            <RotateCw className="h-5 w-5" />
          </button>
          <button type="button" onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-white/10" aria-label={isFullscreen ? "إنهاء ملء الشاشة" : "ملء الشاشة"}>
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
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

            {/* Gesture layer — ONLY active while zoomed, so Bunny's native controls
                are fully clickable at zoom=1 without any interference. */}
            {gestureActive && (
              <div
                className="absolute inset-0 z-20"
                style={{ touchAction: "none" }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
              />
            )}
            {/* Invisible pinch detector at zoom=1: only activates when 2 fingers touch,
                so single-finger taps still reach Bunny's native controls. */}
            {!gestureActive && (
              <div
                className="absolute inset-0 z-10"
                style={{ touchAction: "none", pointerEvents: "none" }}
                onTouchStart={(e) => { if (e.touches.length === 2) { onTouchStart(e); } }}
              />
            )}
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
    </motion.div>
  );
};

export default BunnyStreamPlayer;
