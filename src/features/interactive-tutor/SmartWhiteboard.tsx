import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Playback speed multiplier (1 = normal, 1.5 = faster). */
  speed?: number;
}

/**
 * Real chalkboard scene — green slate texture + chalk-stroke text appearing
 * character-by-character, wooden frame, soft classroom lighting.
 *
 * Fullscreen overlay positioned inside the studio (absolute inset-0).
 */
export function SmartWhiteboard({ title, steps, open, onClose, animate = true, speed = 1 }: Props) {
  const [revealedIndex, setRevealedIndex] = useState(0);
  const [charProgress, setCharProgress] = useState<Record<number, number>>({});

  // Compute "how many characters to show" per step over time → typewriter effect.
  useEffect(() => {
    if (!open) {
      setRevealedIndex(0);
      setCharProgress({});
      return;
    }
    if (!animate) {
      setRevealedIndex(steps.length);
      const all: Record<number, number> = {};
      steps.forEach((s, i) => {
        all[i] = (("text" in s ? s.text : "") || (("tex" in s ? (s as any).tex : "")) || "").length;
      });
      setCharProgress(all);
      return;
    }

    setRevealedIndex(0);
    setCharProgress({});

    const stepTimers: number[] = [];
    const factor = Math.max(0.25, speed || 1);
    let cumulativeDelay = 500 / factor;

    steps.forEach((s, i) => {
      const text = ("text" in s ? s.text : "") || ("tex" in (s as any) ? (s as any).tex : "") || "";
      const charDuration = Math.max(450, Math.min(text.length * 38, 4200)) / factor;

      stepTimers.push(
        window.setTimeout(() => {
          setRevealedIndex((r) => Math.max(r, i + 1));
          const startTime = performance.now();
          const tick = () => {
            const e = performance.now() - startTime;
            const ratio = Math.min(1, e / charDuration);
            const count = Math.floor(text.length * ratio);
            setCharProgress((p) => ({ ...p, [i]: count }));
            if (ratio < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }, cumulativeDelay),
      );
      cumulativeDelay += charDuration + 350 / factor;
    });

    return () => stepTimers.forEach((t) => window.clearTimeout(t));
  }, [open, steps, animate, speed]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 z-[60] flex items-center justify-center p-2"
          dir="rtl"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,15,8,0.88) 0%, rgba(8,5,3,0.94) 100%)",
          }}
        >
          {/* Wooden frame */}
          <div
            className="relative w-full h-full rounded-2xl overflow-hidden"
            style={{
              padding: "14px",
              background:
                "linear-gradient(135deg, #5b3b1d 0%, #8b5a2b 25%, #6b4321 60%, #4a2c14 100%)",
              boxShadow:
                "0 30px 60px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,220,170,0.18), inset 0 0 30px rgba(0,0,0,0.5)",
            }}
          >
            {/* Slate */}
            <div
              className="relative w-full h-full rounded-lg overflow-hidden"
              style={{
                background:
                  "radial-gradient(ellipse at 30% 20%, #2c5142 0%, #1c3a30 45%, #0e2820 100%)",
                boxShadow:
                  "inset 0 0 80px rgba(0,0,0,0.55), inset 0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              {/* Chalk dust noise */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.07]"
                style={{
                  backgroundImage:
                    "radial-gradient(rgba(255,255,255,0.6) 0.5px, transparent 0.6px)",
                  backgroundSize: "3px 3px",
                }}
              />
              {/* Soft top-light */}
              <div
                className="absolute inset-x-0 top-0 h-24 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,235,180,0.12), transparent)",
                }}
              />

              {/* Header */}
              <div className="relative flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-200 animate-pulse" />
                  <span
                    className="text-emerald-50 font-bold text-sm tracking-wide"
                    style={{
                      fontFamily: "'Aref Ruqaa', 'Cairo', serif",
                      textShadow: "0 0 8px rgba(220,255,235,0.25)",
                    }}
                  >
                    {title || "السبورة الذكية"}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="h-8 w-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-emerald-50 transition border border-white/10"
                  aria-label="إغلاق السبورة"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content area */}
              <div className="relative h-[calc(100%-44px)] overflow-y-auto px-5 py-5">
                <div className="mx-auto max-w-3xl space-y-5">
                  {steps.slice(0, revealedIndex).map((s, i) => {
                    const fullText =
                      ("text" in s ? s.text : "") ||
                      ("tex" in (s as any) ? (s as any).tex : "") ||
                      "";
                    const shown = charProgress[i] ?? fullText.length;
                    const visibleText = fullText.slice(0, shown);
                    const isTyping = shown < fullText.length;

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                      >
                        {s.type === "title" && (
                          <h2
                            className="text-2xl md:text-3xl font-extrabold"
                            style={{
                              color: "#fff9e6",
                              fontFamily: "'Aref Ruqaa', 'Cairo', serif",
                              textShadow:
                                "0 0 1px rgba(255,255,255,0.5), 0 2px 6px rgba(0,0,0,0.4)",
                              letterSpacing: "0.02em",
                            }}
                          >
                            <ChalkText text={visibleText} typing={isTyping} />
                          </h2>
                        )}
                        {s.type === "write" && (
                          <p
                            className="text-xl md:text-2xl leading-loose font-bold"
                            style={{
                              color: (s as any).color || "#f4fff5",
                              fontFamily: "'Aref Ruqaa', 'Cairo', serif",
                              textShadow:
                                "0 0 1px rgba(255,255,255,0.45), 0 1px 4px rgba(0,0,0,0.35)",
                            }}
                          >
                            <ChalkText text={visibleText} typing={isTyping} />
                          </p>
                        )}
                        {s.type === "bullet" && (
                          <div
                            className="flex items-start gap-3"
                            style={{
                              color: "#eafff0",
                              fontFamily: "'Cairo', sans-serif",
                              textShadow: "0 0 1px rgba(255,255,255,0.35)",
                            }}
                          >
                            <span className="mt-3 h-2 w-2 rounded-full bg-emerald-200 shrink-0" />
                            <p className="text-lg leading-9">
                              <ChalkText text={visibleText} typing={isTyping} />
                            </p>
                          </div>
                        )}
                        {s.type === "highlight" && (
                          <div
                            className="rounded-md px-4 py-3 border"
                            style={{
                              background:
                                "linear-gradient(90deg, rgba(255,235,120,0.16), rgba(255,200,80,0.08))",
                              borderColor: "rgba(255,235,120,0.35)",
                              boxShadow:
                                "0 0 14px rgba(255,220,120,0.18) inset",
                            }}
                          >
                            <p
                              className="text-lg font-bold leading-8"
                              style={{
                                color: "#fff5b8",
                                fontFamily: "'Aref Ruqaa','Cairo', serif",
                                textShadow:
                                  "0 0 1px rgba(255,255,255,0.5)",
                              }}
                            >
                              <ChalkText text={visibleText} typing={isTyping} />
                            </p>
                          </div>
                        )}
                        {s.type === "equation" && (
                          <div
                            className="rounded-md px-4 py-3 text-center border border-amber-100/20"
                            style={{
                              background:
                                "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.15))",
                            }}
                          >
                            <code
                              className="text-2xl md:text-3xl"
                              style={{
                                color: "#ffe9a0",
                                fontFamily:
                                  "'Cairo', 'KaTeX_Main', monospace",
                                textShadow:
                                  "0 0 2px rgba(255,255,255,0.45), 0 2px 5px rgba(0,0,0,0.45)",
                              }}
                            >
                              <ChalkText text={visibleText} typing={isTyping} />
                            </code>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}

                  {revealedIndex < steps.length && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 text-emerald-100/70 text-xs"
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
                      المعلم يكتب على السبورة...
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Bottom chalk tray */}
              <div
                className="absolute inset-x-0 bottom-0 h-3 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.7))",
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Renders text with a soft chalk shimmer and a blinking cursor when typing. */
function ChalkText({ text, typing }: { text: string; typing: boolean }) {
  return (
    <>
      <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
      {typing && (
        <span
          aria-hidden
          className="inline-block align-middle ml-1"
          style={{
            width: 2,
            height: "0.9em",
            background: "rgba(255,255,255,0.85)",
            boxShadow: "0 0 6px rgba(255,255,255,0.5)",
            animation: "ct-cursor 0.9s steps(2) infinite",
          }}
        />
      )}
      <style>{`
        @keyframes ct-cursor { 50% { opacity: 0 } }
      `}</style>
    </>
  );
}

export default SmartWhiteboard;
