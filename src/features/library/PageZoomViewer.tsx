import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * PageZoomViewer — professional PDF-page viewer surface.
 *
 * Design notes (why it behaves like Drive / Acrobat / pdf.js):
 *  - The page is laid out ONCE at "fit" size (contain), then transformed with a
 *    single matrix `translate(tx,ty) scale(s)` about the container center. No
 *    layout thrash, no scroll containers fighting the gesture, no flicker.
 *  - `s` is relative to fit: s=1 always means "whole page visible". Min is 1 so
 *    the page can never shrink out of view; max is 6 for deep inspection.
 *  - Pinch/wheel/double-tap all zoom around a focal point, so whatever the
 *    student put their fingers on stays exactly under their fingers.
 *  - Translation is clamped every frame to the real content box, so no part of
 *    the page can ever leave the viewport and there is no rubber-band jitter.
 *  - Pointer Events + `touch-action: none` gives full multi-touch on Android,
 *    iOS and desktop with one code path (also kills browser page-zoom hijack).
 */

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 12;

type Point = { x: number; y: number };

export type PageZoomViewerHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

interface Props {
  /** Page image (data URL or remote URL). */
  src: string;
  /** Optional crisper image for the same page, swapped in without flicker. */
  hiResSrc?: string | null;
  alt: string;
  /** Reported on every scale change (used to request hi-res renders). */
  onScaleChange?: (scale: number) => void;
  /** Swipe to previous/next page — only fires when not zoomed in. */
  onSwipe?: (direction: "next" | "prev") => void;
  /** Rendered inside the transformed layer (annotations track the page). */
  overlay?: React.ReactNode;
  controlsRef?: React.MutableRefObject<PageZoomViewerHandle | null>;
}

export default function PageZoomViewer({
  src,
  hiResSrc,
  alt,
  onScaleChange,
  onSwipe,
  overlay,
  controlsRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  // Natural image size, container size → fit box.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [container, setContainer] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Transform lives in a ref (written every pointer frame) and is mirrored to
  // state only for the zoom badge, so gestures never re-render React.
  const tf = useRef({ s: 1, x: 0, y: 0 });
  const [scaleLabel, setScaleLabel] = useState(1);

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    mode: "none" | "pan" | "pinch";
    startDist: number;
    startScale: number;
    start: Point;
    startTf: { s: number; x: number; y: number };
    moved: boolean;
  }>({ mode: "none", startDist: 0, startScale: 1, start: { x: 0, y: 0 }, startTf: { s: 1, x: 0, y: 0 }, moved: false });
  const lastTap = useRef<{ t: number; x: number; y: number }>({ t: 0, x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // ── Measure container ──
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      setContainer({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // ── Fit box: the page at scale 1 (fully visible, correct aspect ratio) ──
  const fit = useMemo(() => {
    if (!natural || !container.w || !container.h) return { w: 0, h: 0 };
    const k = Math.min(container.w / natural.w, container.h / natural.h);
    return { w: natural.w * k, h: natural.h * k };
  }, [natural, container]);

  const clampTranslate = useCallback(
    (s: number, x: number, y: number) => {
      // Overflow beyond the viewport, halved because origin is the center.
      const maxX = Math.max(0, (fit.w * s - container.w) / 2);
      const maxY = Math.max(0, (fit.h * s - container.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [fit, container],
  );

  const commit = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const node = layerRef.current;
      if (!node) return;
      const { s, x, y } = tf.current;
      node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    });
  }, []);

  const apply = useCallback(
    (s: number, x: number, y: number, animate = false) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
      const c = clampTranslate(next, x, y);
      tf.current = { s: next, x: c.x, y: c.y };
      const node = layerRef.current;
      if (node) node.style.transition = animate ? "transform 220ms cubic-bezier(0.22,0.61,0.36,1)" : "none";
      commit();
      setScaleLabel((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
    },
    [clampTranslate, commit],
  );

  useEffect(() => {
    onScaleChange?.(scaleLabel);
  }, [scaleLabel, onScaleChange]);

  // Re-clamp when the container or page aspect changes (rotation, resize,
  // switching to a page with a different aspect ratio) — keeps the page inside.
  useEffect(() => {
    const { s, x, y } = tf.current;
    apply(s, x, y);
  }, [fit, container, apply]);

  /** Zoom around a focal point given in container coordinates. */
  const zoomAt = useCallback(
    (nextScale: number, focal: Point, animate = false) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const s = tf.current.s;
      const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      // Focal point relative to the transform origin (container center).
      const qx = focal.x - rect.width / 2;
      const qy = focal.y - rect.height / 2;
      const k = target / s;
      apply(target, qx - (qx - tf.current.x) * k, qy - (qy - tf.current.y) * k, animate);
    },
    [apply],
  );

  const zoomAtCenter = useCallback(
    (nextScale: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(nextScale, { x: rect.width / 2, y: rect.height / 2 }, true);
    },
    [zoomAt],
  );

  // Imperative controls for the toolbar buttons.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      zoomIn: () => zoomAtCenter(tf.current.s * 1.4),
      zoomOut: () => zoomAtCenter(tf.current.s / 1.4),
      reset: () => apply(1, 0, 0, true),
    };
    return () => {
      if (controlsRef) controlsRef.current = null;
    };
  }, [controlsRef, zoomAtCenter, apply]);

  // ── Pointer gestures (pan + pinch + double tap) ──
  const localPoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const node = containerRef.current;
      if (!node) return;
      node.setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, localPoint(e));

      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        gesture.current = {
          mode: "pinch",
          startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startScale: tf.current.s,
          start: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          startTf: { ...tf.current },
          moved: true,
        };
      } else if (pointers.current.size === 1) {
        gesture.current = {
          mode: "pan",
          startDist: 0,
          startScale: tf.current.s,
          start: localPoint(e),
          startTf: { ...tf.current },
          moved: false,
        };
      }
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, localPoint(e));
      const g = gesture.current;

      if (g.mode === "pinch" && pointers.current.size >= 2) {
        const [a, b] = Array.from(pointers.current.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const focal = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const target = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.startScale * (dist / g.startDist)));
        // Anchor on the live midpoint against the transform captured at start.
        const qx = focal.x - rect.width / 2;
        const qy = focal.y - rect.height / 2;
        const sx = g.start.x - rect.width / 2;
        const sy = g.start.y - rect.height / 2;
        const k = target / g.startTf.s;
        apply(target, qx - (sx - g.startTf.x) * k, qy - (sy - g.startTf.y) * k);
        return;
      }

      if (g.mode === "pan" && pointers.current.size === 1) {
        const p = localPoint(e);
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
        if (tf.current.s <= 1.001) return; // not zoomed → leave for swipe
        apply(g.startTf.s, g.startTf.x + dx, g.startTf.y + dy);
      }
    },
    [apply, localPoint],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      const p = pointers.current.get(e.pointerId) ?? localPoint(e);
      pointers.current.delete(e.pointerId);

      if (pointers.current.size === 1) {
        // One finger lifted from a pinch → continue panning smoothly.
        const [only] = Array.from(pointers.current.values());
        gesture.current = {
          mode: "pan",
          startDist: 0,
          startScale: tf.current.s,
          start: only,
          startTf: { ...tf.current },
          moved: true,
        };
        return;
      }
      if (pointers.current.size > 1) return;

      if (g.mode === "pan" && !g.moved) {
        const now = performance.now();
        const isDouble =
          now - lastTap.current.t < DOUBLE_TAP_MS &&
          Math.hypot(p.x - lastTap.current.x, p.y - lastTap.current.y) < 40;
        if (isDouble) {
          lastTap.current = { t: 0, x: 0, y: 0 };
          if (tf.current.s > 1.05) apply(1, 0, 0, true);
          else zoomAt(DOUBLE_TAP_SCALE, p, true);
        } else {
          lastTap.current = { t: now, x: p.x, y: p.y };
        }
      } else if (g.mode === "pan" && g.moved && tf.current.s <= 1.001 && onSwipe) {
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          // RTL reading: swiping right-to-left advances.
          onSwipe(dx > 0 ? "prev" : "next");
        }
      }

      gesture.current.mode = "none";
    },
    [apply, localPoint, onSwipe, zoomAt],
  );

  // Native non-passive wheel listener: React's onWheel is passive, so
  // preventDefault() there is ignored and the page/browser would zoom instead.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      // Exponential, delta-proportional → no compounding jumps on trackpads.
      zoomAt(tf.current.s * Math.exp(-dy * 0.0018), localPoint(e));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAt, localPoint]);

  // ── Page change: keep the zoom level, recenter safely (no flicker) ──
  useEffect(() => {
    apply(tf.current.s, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const displaySrc = hiResSrc || src;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-background"
      style={{ touchAction: "none", overscrollBehavior: "contain", cursor: scaleLabel > 1.01 ? "grab" : "default" }}
    >
      <div
        ref={layerRef}
        className="absolute left-1/2 top-1/2 will-change-transform"
        style={{
          width: fit.w || "auto",
          height: fit.h || "auto",
          marginLeft: fit.w ? -fit.w / 2 : 0,
          marginTop: fit.h ? -fit.h / 2 : 0,
          transformOrigin: "center center",
          backfaceVisibility: "hidden",
        }}
      >
        <img
          src={displaySrc}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setNatural((prev) =>
                prev && prev.w === img.naturalWidth && prev.h === img.naturalHeight
                  ? prev
                  : { w: img.naturalWidth, h: img.naturalHeight },
              );
            }
          }}
          className="pointer-events-none block h-full w-full select-none object-contain"
          style={{ imageRendering: "auto" }}
        />
        {overlay}
      </div>
    </div>
  );
}
