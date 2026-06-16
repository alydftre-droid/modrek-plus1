import { ReactNode } from "react";
import { motion } from "framer-motion";

interface Props {
  children: ReactNode;
}

/**
 * Native-like page transitions. Subtle slide + fade — feels like a real app,
 * not a website reload.
 */
export default function PageTransition({ children }: Props) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
      style={{ minHeight: "100dvh" }}
    >
      {children}
    </motion.div>
  );
}
