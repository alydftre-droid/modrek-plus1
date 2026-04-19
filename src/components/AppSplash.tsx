import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import brandMark from "@/assets/modrek-brand-symbol.png";

/**
 * In-app splash overlay shown briefly on first load. Bridges the native splash
 * to the app UI for a seamless feel. Auto-hides after 900ms.
 */
export default function AppSplash() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShow(false), 420);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
          style={{ pointerEvents: "none" }}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-[#0F172A] shadow-[0_20px_60px_-20px_rgba(15,23,42,0.6)]"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-3xl bg-primary/30 blur-2xl"
            />
            <img src={brandMark} alt="Modrek Plus" className="relative h-20 w-20 object-contain" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.24 }}
            className="mt-5 text-2xl font-extrabold text-foreground"
          >
            مدرك Plus
          </motion.h1>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 80 }}
            transition={{ delay: 0.15, duration: 0.25 }}
            className="mt-3 h-[3px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
