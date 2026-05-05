import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import brandMark from "@/assets/modrek-brand-symbol.png";
import splashBg from "@/assets/splash-bg-educational.jpg";

/**
 * In-app splash overlay shown briefly on app start. Bridges the native splash
 * to the app UI for a seamless feel. Educational illustrated background +
 * platform name + animated brand mark.
 */
export default function AppSplash() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
          style={{ pointerEvents: "none" }}
        >
          {/* Educational illustrated background */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${splashBg})` }}
          />
          {/* Soft warm overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#FFF8F0]/40 via-transparent to-[#E8F5E9]/60" />

          {/* Floating sparkles */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-primary/40 blur-sm"
              style={{
                width: 8 + (i % 3) * 4,
                height: 8 + (i % 3) * 4,
                top: `${15 + ((i * 17) % 70)}%`,
                left: `${10 + ((i * 23) % 80)}%`,
              }}
              animate={{
                y: [0, -20, 0],
                opacity: [0.3, 0.9, 0.3],
                scale: [1, 1.3, 1],
              }}
              transition={{
                duration: 2.5 + (i % 3) * 0.5,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "easeInOut",
              }}
            />
          ))}

          {/* Centerpiece */}
          <div className="relative flex flex-col items-center">
            {/* Glow halo */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute h-44 w-44 rounded-full bg-gradient-to-br from-emerald-300/60 via-teal-300/40 to-cyan-200/50 blur-3xl"
            />

            {/* Logo card */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex h-32 w-32 items-center justify-center rounded-[28px] bg-white shadow-[0_24px_70px_-15px_rgba(16,185,129,0.45),inset_0_0_0_1px_rgba(16,185,129,0.15)]"
            >
              <motion.img
                src={brandMark}
                alt="مدرك Plus"
                className="relative h-24 w-24 object-contain drop-shadow-md"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>

            {/* Platform name */}
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="mt-6 text-[2.6rem] font-black tracking-tight"
              style={{
                background: "linear-gradient(135deg, #047857 0%, #10B981 50%, #06B6D4 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontFamily: '"Cairo", system-ui, sans-serif',
              }}
            >
              مدرك Plus
            </motion.h1>

            {/* Tagline */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-2 text-sm font-semibold text-emerald-800/80"
              style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}
            >
              منصتك التعليمية الذكية
            </motion.p>

            {/* Animated loading line */}
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 120, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="mt-6 h-[3px] overflow-hidden rounded-full bg-emerald-100"
            >
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: "60%" }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
