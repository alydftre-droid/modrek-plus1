import { Headset } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function DashboardSupportLauncher() {
  const navigate = useNavigate();

  return (
    <motion.button
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.35, type: "spring", stiffness: 180, damping: 18 }}
      onClick={() => navigate("/support")}
      className="fixed right-3 bottom-24 z-40 flex items-center gap-3 rounded-2xl border border-primary/20 bg-card/95 px-3 py-3 shadow-xl backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-2xl lg:right-6 lg:bottom-6"
      aria-label="فتح صفحة المساعد الذكي"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Headset className="h-5 w-5" />
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-foreground">المساعد الذكي</p>
        <p className="text-[11px] text-muted-foreground">دعم فوري لحسابك</p>
      </div>
    </motion.button>
  );
}
