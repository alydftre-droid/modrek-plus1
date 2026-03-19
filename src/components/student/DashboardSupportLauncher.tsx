import { Headset } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function DashboardSupportLauncher() {
  const navigate = useNavigate();

  return (
    <motion.button
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.35, type: "spring", stiffness: 220, damping: 18 }}
      onClick={() => navigate("/support")}
      className="fixed bottom-24 left-3 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white shadow-[0_18px_45px_-16px_rgba(147,51,234,0.7)] transition-all hover:-translate-y-1 hover:scale-105 lg:bottom-6 lg:left-6"
      aria-label="فتح صفحة المساعد الذكي"
    >
      <Headset className="h-7 w-7" />
      <span className="absolute right-1 top-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-400" />
    </motion.button>
  );
}
