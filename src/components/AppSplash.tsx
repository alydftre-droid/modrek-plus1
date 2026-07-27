import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import splashStage1 from "@/assets/splash-stage1.png";
import splashStage2 from "@/assets/splash-stage2.jpg";

/**
 * Two-stage in-app splash:
 *  - Stage 1: approved brand mark + name.
 *  - Stage 2: full educational illustration, stays until auth bootstrap is complete.
 * Android's native launch icon is disabled separately so the old low-quality
 * logo-only frame never appears before these two approved screens.
 */
export default function AppSplash() {
  const [stage, setStage] = useState<1 | 2>(1);
  const [show, setShow] = useState(true);
  const { isLoading, user } = useAuth();
  const { pathname } = useLocation();
  const isAuthSurface = pathname === "/auth" || pathname === "/forgot-password" || pathname === "/reset-password";
  const shouldHoldForAuthenticatedRedirect = Boolean(user && (pathname === "/" || pathname === "/auth"));

  // Stage 1 -> Stage 2 after 2 seconds.
  useEffect(() => {
    const t = setTimeout(() => setStage(2), 2000);
    return () => clearTimeout(t);
  }, []);

  // Permanent white-screen guard: auth bootstrap, redirects, storage, or a stale
  // browser state must never keep the first paint hidden indefinitely.
  useEffect(() => {
    const hardCap = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(hardCap);
  }, []);

  // Hide once auth bootstrap and any initial authenticated redirect are done.
  useEffect(() => {
    if (stage !== 2) return;
    if (!isLoading && !shouldHoldForAuthenticatedRedirect) {
      const t = setTimeout(() => setShow(false), 250);
      return () => clearTimeout(t);
    }
  }, [stage, isLoading, shouldHoldForAuthenticatedRedirect]);

  return (
    <AnimatePresence>
      {show && !isAuthSurface && (
        <motion.div
          key={`splash-${stage}`}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-white"
          style={{ pointerEvents: "none" }}
        >
          {stage === 1 ? (
            <motion.img
              key="stage1"
              src={splashStage1}
              alt="مدرك Plus"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="max-h-[70%] max-w-[80%] object-contain"
              draggable={false}
            />
          ) : (
            <motion.img
              key="stage2"
              src={splashStage2}
              alt="مدرك Plus"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="h-full w-full object-cover"
              draggable={false}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
