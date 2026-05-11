import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnnotationShape } from "./types";

interface Props {
  annotations: AnnotationShape[];
  /** Whether annotations should be played out over time (true) or shown all at once (false). */
  playing?: boolean;
  /** Total narration duration in ms (used to scale relative timings if `at` exceeds bounds). */
  totalMs?: number;
}

/**
 * Lightweight SVG overlay that renders AI-driven annotations
 * (circles, rectangles, arrows, highlights, underlines) over a page image.
 * Designed to be placed inside a position:relative wrapper that has the
 * same bounding box as the underlying image.
 *
 * Uses a 0..1 normalized coordinate system + viewBox="0 0 100 100".
 */
export function AnnotationOverlay({ annotations, playing = true }: Props) {
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

  if (!annotations || annotations.length === 0) return null;

  // Convert normalized coords (0..1) to viewBox (0..100)
  const N = 100;
  const visible = annotations.filter((a) => {
    const start = a.at ?? 0;
    if (!playing) return true;
    if (elapsed < start) return false;
    const dur = (a as any).duration ?? 4500;
    return elapsed < start + dur;
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${N} ${N}`}
      preserveAspectRatio="none"
    >
      <defs>
        <marker
          id="tutor-arrow-head"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="3"
          markerHeight="3"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <AnimatePresence>
        {visible.map((a, i) => {
          const color = (a as any).color || "#22c55e";
          if (a.type === "circle") {
            return (
              <motion.g
                key={`c-${i}`}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.35 }}
                style={{ color }}
              >
                <motion.circle
                  cx={a.x * N}
                  cy={a.y * N}
                  r={a.r * N}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.8}
                  animate={{ strokeWidth: [0.8, 1.4, 0.8] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              </motion.g>
            );
          }
          if (a.type === "rect") {
            return (
              <motion.rect
                key={`r-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                x={a.x * N}
                y={a.y * N}
                width={a.w * N}
                height={a.h * N}
                fill="none"
                stroke={color}
                strokeWidth={0.7}
                rx={1}
              />
            );
          }
          if (a.type === "arrow") {
            return (
              <motion.line
                key={`a-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                x1={a.from[0] * N}
                y1={a.from[1] * N}
                x2={a.to[0] * N}
                y2={a.to[1] * N}
                stroke={color}
                strokeWidth={0.9}
                strokeLinecap="round"
                markerEnd="url(#tutor-arrow-head)"
                style={{ color }}
              />
            );
          }
          if (a.type === "highlight") {
            return (
              <motion.rect
                key={`h-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                exit={{ opacity: 0 }}
                x={a.x * N}
                y={a.y * N}
                width={a.w * N}
                height={a.h * N}
                fill={color}
                rx={0.5}
              />
            );
          }
          if (a.type === "underline") {
            return (
              <motion.line
                key={`u-${i}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                x1={a.from[0] * N}
                y1={a.from[1] * N}
                x2={a.to[0] * N}
                y2={a.to[1] * N}
                stroke={color}
                strokeWidth={0.7}
                strokeLinecap="round"
              />
            );
          }
          return null;
        })}
      </AnimatePresence>
    </svg>
  );
}

export default AnnotationOverlay;
