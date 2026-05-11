import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { WhiteboardStep } from "./types";

interface Props {
  title?: string;
  steps: WhiteboardStep[];
  open: boolean;
  onClose: () => void;
  /** Whether to auto-reveal steps over time (true) or show all (false). */
  animate?: boolean;
}

/**
 * A lightweight, beautiful "smart whiteboard" surface that the AI tutor
 * uses when a concept needs explicit drawing/derivation instead of
 * pointing at the book page.
 *
 * Pure CSS/SVG (no Konva), Arabic-first, fullscreen overlay.
 */
export function SmartWhiteboard({ title, steps, open, onClose, animate = true }: Props) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!open) {
      setRevealed(0);
      return;
    }
    if (!animate) {
      setRevealed(steps.length);
      return;
    }
    setRevealed(0);
    const timers: number[] = [];
    steps.forEach((_, i) => {
      timers.push(window.setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), 600 + i * 1400));
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [open, steps, animate]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0 z-[60] flex flex-col"
          dir="rtl"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, #1a3a3f 0%, #0f1f24 60%, #0a1418 100%)",
          }}
        >
          {/* Subtle grid */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]">
            <defs>
              <pattern id="wb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#9bd9c9" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#wb-grid)" />
          </svg>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 animate-pulse" />
              <span className="text-emerald-100 font-bold text-sm">
                {title || "السبورة الذكية"}
              </span>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
              aria-label="إغلاق السبورة"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="relative flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {steps.slice(0, revealed).map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className=""
                >
                  {s.type === "title" && (
                    <h2
                      className="text-2xl md:text-3xl font-extrabold text-emerald-200 tracking-tight"
                      style={{ textShadow: "0 0 18px rgba(110,231,183,0.25)" }}
                    >
                      {s.text}
                    </h2>
                  )}
                  {s.type === "write" && (
                    <p
                      className="text-xl md:text-2xl text-white leading-relaxed font-bold"
                      style={{ color: s.color || "#f0fdfa" }}
                    >
                      {s.text}
                    </p>
                  )}
                  {s.type === "bullet" && (
                    <div className="flex items-start gap-3 text-white">
                      <span className="mt-2 h-2 w-2 rounded-full bg-emerald-300 shrink-0" />
                      <p className="text-lg leading-8 text-emerald-50/95">{s.text}</p>
                    </div>
                  )}
                  {s.type === "highlight" && (
                    <div className="rounded-xl bg-emerald-300/15 border border-emerald-300/30 px-4 py-3">
                      <p className="text-emerald-100 text-lg font-semibold leading-7">
                        {s.text}
                      </p>
                    </div>
                  )}
                  {s.type === "equation" && (
                    <div className="rounded-xl bg-white/8 border border-white/15 px-4 py-3 text-center">
                      <code
                        className="text-2xl font-mono text-amber-200"
                        style={{ fontFamily: "'Cairo', 'KaTeX_Main', monospace" }}
                      >
                        {s.tex}
                      </code>
                    </div>
                  )}
                </motion.div>
              ))}

              {revealed < steps.length && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-emerald-300/70 text-xs"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                  المعلم يكتب...
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SmartWhiteboard;
