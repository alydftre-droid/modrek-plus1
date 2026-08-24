import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnnotationShape } from "./types";

interface Props {
  annotations: AnnotationShape[];
  /** Whether annotations should be played out over time (true) or shown all at once (false). */
  playing?: boolean;
  /** Total narration duration in ms (used to scale relative timings if `at` exceeds bounds). */
  totalMs?: number;
  /** Playback speed multiplier (1 = normal, 1.5 = faster, 0.75 = slower). Affects `at` and `duration`. */
  speed?: number;
}

/**
 * Cinematic teaching overlay: spotlight + animated laser pointer + virtual hand
 * + draw-by-stroke highlights/arrows. Renders over a page image inside a
 * position:relative parent that has the same bounding box as the image.
 *
 * Coordinates are normalized (0..1). Uses SVG viewBox 0..100 + a single absolute
 * layer for the hand/pointer chrome (HTML).
 */
export function AnnotationOverlay({ annotations, playing = true, speed = 1 }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      startRef.current = null;
      setElapsed(Number.POSITIVE_INFINITY); // show all
      return;
    }
    startRef.current = performance.now();
    setElapsed(0);
    const tick = (now: number) => {
      if (startRef.current == null) return;
      setElapsed(now - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, annotations]);

  const N = 100;


  // Determine currently "live" annotations (within their time window, scaled by speed)
  const visible = useMemo(() => {
    const factor = Math.max(0.25, speed || 1);
    return annotations
      .map((a, idx) => ({ a, idx }))
      .filter(({ a }) => {
        const start = (a.at ?? 0) / factor;
        if (!playing) return true;
        if (elapsed < start) return false;
        const dur = ((a as any).duration ?? 4500) / factor;
        return elapsed < start + dur;
      });
  }, [annotations, elapsed, playing, speed]);

  // Compute focal point = center of last visible annotation → drives pointer + spotlight
  const focal = useMemo(() => {
    const last = visible[visible.length - 1]?.a;
    if (!last) return null;
    if ("x" in last && "y" in last && !("from" in last)) {
      const a: any = last;
      if (a.r != null) return { x: a.x, y: a.y };
      if (a.w != null) return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      return { x: a.x, y: a.y };
    }
    if ("from" in last && "to" in last) {
      return { x: (last.from[0] + last.to[0]) / 2, y: (last.from[1] + last.to[1]) / 2 };
    }
    return null;
  }, [visible]);

  // Bail out AFTER all hooks have run, so hook order stays identical on every
  // render (an early return above the hooks crashes React when the list empties).
  if (!annotations || annotations.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Cinematic spotlight — darkens page, lights focal area */}
      <AnimatePresence>
        {playing && focal && (
          <motion.div
            key={`spot-${Math.round(focal.x * 100)}-${Math.round(focal.y * 100)}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at ${focal.x * 100}% ${focal.y * 100}%, transparent 0, transparent 14%, rgba(8,15,30,0.32) 55%, rgba(8,15,30,0.55) 100%)`,
              mixBlendMode: "multiply",
            }}
          />
        )}
      </AnimatePresence>

      {/* SVG layer: shapes drawn over the page */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${N} ${N}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <defs>
          <marker
            id="ct-arrow-head"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="3"
            markerHeight="3"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          <filter id="ct-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <AnimatePresence>
          {visible.map(({ a, idx }) => {
            const color = (a as any).color || "#22c55e";
            const key = `${a.type}-${idx}`;
            if (a.type === "circle") {
              return (
                <motion.g
                  key={key}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.2 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  style={{ color, transformOrigin: `${a.x * N}px ${a.y * N}px` }}
                >
                  {/* Soft halo */}
                  <motion.circle
                    cx={a.x * N}
                    cy={a.y * N}
                    r={a.r * N * 1.4}
                    fill={color}
                    opacity={0.12}
                    animate={{ r: [a.r * N * 1.4, a.r * N * 1.9, a.r * N * 1.4] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  {/* Drawn ring */}
                  <motion.circle
                    cx={a.x * N}
                    cy={a.y * N}
                    r={a.r * N}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * a.r * N}
                    initial={{ strokeDashoffset: 2 * Math.PI * a.r * N }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    filter="url(#ct-glow)"
                  />
                </motion.g>
              );
            }
            if (a.type === "rect") {
              const perimeter = 2 * (a.w + a.h) * N;
              return (
                <motion.rect
                  key={key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  x={a.x * N}
                  y={a.y * N}
                  width={a.w * N}
                  height={a.h * N}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  rx={1.5}
                  strokeDasharray={perimeter}
                  style={{
                    strokeDashoffset: 0,
                    animation: `ct-draw ${Math.min(1.4, perimeter / 200)}s ease-out`,
                  }}
                  filter="url(#ct-glow)"
                />
              );
            }
            if (a.type === "arrow") {
              // Quadratic curve from→to with a subtle arc
              const x1 = a.from[0] * N;
              const y1 = a.from[1] * N;
              const x2 = a.to[0] * N;
              const y2 = a.to[1] * N;
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.max(1, Math.hypot(dx, dy));
              const nx = -dy / len;
              const ny = dx / len;
              const bend = Math.min(12, len * 0.18);
              const cx = mx + nx * bend;
              const cy = my + ny * bend;
              const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
              return (
                <motion.path
                  key={key}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  markerEnd="url(#ct-arrow-head)"
                  style={{ color }}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  filter="url(#ct-glow)"
                />
              );
            }
            if (a.type === "highlight") {
              // Marker-style highlight: blends with page, drawn left-to-right.
              return (
                <motion.rect
                  key={key}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 0.45, scaleX: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                  x={a.x * N}
                  y={a.y * N}
                  width={a.w * N}
                  height={a.h * N}
                  fill={color}
                  rx={0.8}
                  style={{
                    transformOrigin: `${a.x * N}px ${(a.y + a.h / 2) * N}px`,
                    mixBlendMode: "multiply" as any,
                  }}
                />
              );
            }
            if (a.type === "underline") {
              return (
                <motion.line
                  key={key}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  x1={a.from[0] * N}
                  y1={a.from[1] * N}
                  x2={a.to[0] * N}
                  y2={a.to[1] * N}
                  stroke={color}
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  filter="url(#ct-glow)"
                />
              );
            }
            return null;
          })}
        </AnimatePresence>
      </svg>

      {/* Virtual hand + laser pointer (HTML layer, GPU transforms) */}
      <AnimatePresence>
        {playing && focal && (
          <motion.div
            key="hand-pointer"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{
              opacity: 1,
              scale: 1,
              left: `${focal.x * 100}%`,
              top: `${focal.y * 100}%`,
            }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.6 }}
            className="absolute"
            style={{ transform: "translate(-12%, -8%)" }}
          >
            {/* Laser dot with pulsing glow */}
            <motion.div
              className="absolute"
              style={{
                left: "-6px",
                top: "-6px",
                width: 12,
                height: 12,
                borderRadius: 9999,
                background: "radial-gradient(circle, #ff3b3b 0%, #ff3b3b 35%, rgba(255,59,59,0) 70%)",
                boxShadow: "0 0 16px 4px rgba(255,59,59,0.55), 0 0 32px 8px rgba(255,59,59,0.25)",
              }}
              animate={{ scale: [1, 1.35, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* Virtual hand SVG — pointing finger */}
            <svg
              width="56"
              height="64"
              viewBox="0 0 56 64"
              style={{
                filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.28))",
                transform: "translate(2px, 2px) rotate(-8deg)",
              }}
            >
              <defs>
                <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffe0c2" />
                  <stop offset="100%" stopColor="#e8b48a" />
                </linearGradient>
              </defs>
              {/* sleeve */}
              <path
                d="M10 50 Q 6 58 14 62 L 44 62 Q 52 58 48 50 Z"
                fill="#1e293b"
              />
              {/* palm */}
              <path
                d="M16 28 Q 14 18 22 16 L 30 14 Q 38 13 40 22 L 42 40 Q 42 52 30 54 L 22 54 Q 14 52 14 44 Z"
                fill="url(#skin)"
                stroke="#b8865d"
                strokeWidth="0.6"
              />
              {/* pointing finger */}
              <path
                d="M22 22 Q 20 8 26 4 Q 32 6 30 22 Z"
                fill="url(#skin)"
                stroke="#b8865d"
                strokeWidth="0.6"
              />
              {/* thumb */}
              <path
                d="M40 28 Q 50 28 48 36 Q 44 38 40 34 Z"
                fill="url(#skin)"
                stroke="#b8865d"
                strokeWidth="0.6"
              />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes ct-draw {
          from { stroke-dashoffset: 100%; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

export default AnnotationOverlay;
