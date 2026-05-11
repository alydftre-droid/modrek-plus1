import { useCallback, useRef, useState } from "react";

/**
 * Smooth, mobile-friendly zoom & pan controller.
 *  - Range: 0.5..4
 *  - Wheel: continuous (no jumps)
 *  - Buttons: +/- 0.15
 *  - Pinch: continuous distance ratio
 *  - Double-tap: toggle 1 <-> 2.2
 *
 * Returns refs/handlers you bind to the viewport container.
 */
export function useSmoothZoom(initial = 1) {
  const [zoom, setZoom] = useState(initial);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const clamp = (v: number) => Math.min(4, Math.max(0.5, v));

  const updateZoom = useCallback((v: number) => {
    const z = clamp(v);
    setZoom(z);
    if (z <= 1.01) setPan({ x: 0, y: 0 });
  }, []);

  const inc = useCallback(() => setZoom((z) => clamp(z + 0.15)), []);
  const dec = useCallback(() => {
    setZoom((z) => {
      const next = clamp(z - 0.15);
      if (next <= 1.01) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        const [a, b] = Array.from(e.touches);
        pinchRef.current = {
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          zoom,
        };
      } else if (e.touches.length === 1) {
        const now = performance.now();
        if (now - lastTapRef.current < 300) {
          // double tap
          setZoom((z) => (z > 1.05 ? 1 : 2.2));
          if (zoom > 1.05) setPan({ x: 0, y: 0 });
        }
        lastTapRef.current = now;
      }
    },
    [zoom]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      const [a, b] = Array.from(e.touches);
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (!distance || !pinchRef.current.distance) return;
      e.preventDefault();
      const ratio = distance / pinchRef.current.distance;
      // Apply ease so pinches feel natural
      const target = pinchRef.current.zoom * ratio;
      setZoom(clamp(target));
    },
    []
  );

  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return; // only zoom on ctrl/cmd + wheel
    e.preventDefault();
    const delta = -e.deltaY * 0.0025; // gentle
    setZoom((z) => {
      const next = clamp(z + delta);
      if (next <= 1.01) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const onScroll = useCallback(() => {
    const node = viewportRef.current;
    if (!node || zoom <= 1.01) return;
    setPan({ x: node.scrollLeft, y: node.scrollTop });
  }, [zoom]);

  return {
    zoom,
    setZoom: updateZoom,
    pan,
    setPan,
    viewportRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onWheel, onScroll },
    inc,
    dec,
    reset,
  };
}
