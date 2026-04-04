import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import supportAgentImg from "@/assets/support-agent.png";

export default function DashboardSupportLauncher() {
  const navigate = useNavigate();

  return (
    <motion.button
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.35, type: "spring", stiffness: 220, damping: 18 }}
      onClick={() => navigate("/support")}
      className="fixed bottom-24 left-3 z-40 flex h-16 w-16 items-center justify-center rounded-full shadow-lg shadow-blue-400/30 transition-all hover:-translate-y-1 hover:scale-105 hover:shadow-xl lg:bottom-6 lg:left-6 overflow-hidden border-2 border-blue-200"
      aria-label="فتح صفحة المساعد الذكي"
    >
      <img src={supportAgentImg} alt="المساعد الذكي" className="w-full h-full object-cover" />
      <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-green-400 border-2 border-background animate-pulse" />
    </motion.button>
  );
}
