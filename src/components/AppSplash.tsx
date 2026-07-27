import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import splashStage2 from "@/assets/splash-stage2.jpg";

/**
 * App splash:
 *  - Shows the approved full educational illustration immediately.
 *  - Native Android launch keeps only the cream background, so the old low-quality
 *    logo-only frame never appears before this screen.
 */
export default function AppSplash() {
  const [show, setShow] = useState(true);
  const { isLoading, user } = useAuth();
  const { pathname } = useLocation();
  const isAuthSurface = pathname === "/auth" || pathname === "/forgot-password" || pathname === "/reset-password";
  const shouldHoldForAuthenticatedRedirect = Boolean(user && (pathname === "/" || pathname === "/auth"));

  // Permanent white-screen guard: auth bootstrap, redirects, storage, or a stale
  // browser state must never keep the first paint hidden indefinitely.
  useEffect(() => {
    const hardCap = setTimeout(() => setShow(false), 4500);
    return () => clearTimeout(hardCap);
  }, []);

  // Hide once auth bootstrap and any initial authenticated redirect are done.
  useEffect(() => {
    if (!isLoading && !shouldHoldForAuthenticatedRedirect) {
      const t = setTimeout(() => setShow(false), 250);
      return () => clearTimeout(t);
    }
  }, [isLoading, shouldHoldForAuthenticatedRedirect]);

  return (
    <AnimatePresence>
      {show && !isAuthSurface && (
        <motion.div
          key="splash-approved"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-white"
          style={{ pointerEvents: "none" }}
        >
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
