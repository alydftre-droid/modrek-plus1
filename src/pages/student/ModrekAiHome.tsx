import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import StudentLayout from "@/components/student/StudentLayout";
import { MessageSquare, Lock } from "lucide-react";
import mascot from "@/assets/modrek-ai-mascot.png";

type AiCard = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  toneClass: string;
  path?: string;
  soon?: boolean;
};

const CARDS: AiCard[] = [
  { id: "study", title: "المساعد الدراسي", subtitle: "شرح وحل وأسئلة", emoji: "📘", toneClass: "dashboard-category-ai", path: "/ai/study" },
  { id: "exams", title: "مساعد الامتحانات", subtitle: "إنشاء امتحانات فورية", emoji: "📝", toneClass: "dashboard-category-science", path: "/ai/exams" },
  { id: "voice", title: "مساعد الصوت", subtitle: "قريبًا", emoji: "🎤", toneClass: "dashboard-category-arabic", soon: true },
  { id: "library", title: "مساعد المكتبة", subtitle: "قريبًا", emoji: "📚", toneClass: "dashboard-category-religious", soon: true },
];

export default function ModrekAiHome() {
  const navigate = useNavigate();

  return (
    <StudentLayout title="Modrek AI">
      <div className="px-4 pt-3 pb-24 lg:pb-6 max-w-2xl mx-auto space-y-5">
        {/* Hero identity — mascot + name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="dashboard-category-ai shadow-dashboard-soft relative overflow-hidden rounded-[22px] p-5 text-white"
        >
          <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-white/10 -translate-x-10 -translate-y-10" />
          <div className="absolute bottom-0 right-0 h-24 w-24 rounded-full bg-white/10 translate-x-8 translate-y-8" />
          <div className="relative flex items-center gap-4">
            <img src={mascot} alt="Modrek AI" width={72} height={72} className="h-[72px] w-[72px] object-contain drop-shadow-lg shrink-0" loading="lazy" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black">Modrek AI</h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white text-primary">جديد</span>
              </div>
              <p className="text-[13px] text-white/90 mt-1 leading-relaxed">
                مساعدك الذكي — يعرف مرحلتك ومنهجك ويشرح ويحل ويصنع لك امتحانات.
              </p>
            </div>
          </div>
        </motion.div>

        {/* 2×2 grid of assistants — matches dashboard category cards exactly */}
        <div>
          <h2 className="text-lg font-black text-foreground mb-3">اختر المساعد</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-[14px]">
            {CARDS.map((c, i) => (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.06 + i * 0.05, type: "spring", stiffness: 210, damping: 18 }}
                disabled={c.soon}
                onClick={() => c.path && navigate(c.path)}
                className={`${c.toneClass} shadow-dashboard-soft group relative h-[130px] overflow-hidden rounded-[20px] p-4 text-white transition-all duration-300 hover:-translate-y-1 active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
              >
                <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-white/10 -translate-x-8 -translate-y-7" />
                <div className="absolute bottom-0 right-0 h-20 w-20 rounded-full bg-white/10 translate-x-6 translate-y-6" />
                {c.soon && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-white/95 text-foreground">
                    <Lock className="h-2.5 w-2.5" /> قريبًا
                  </span>
                )}
                <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
                  <span className="text-[44px] leading-none drop-shadow-sm">{c.emoji}</span>
                  <span className="text-base font-semibold drop-shadow-sm">{c.title}</span>
                  <span className="text-[11px] text-white/80">{c.subtitle}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          onClick={() => navigate("/ai/conversations")}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary/10 text-primary font-bold hover:bg-primary/15 transition-colors"
        >
          <MessageSquare className="h-4 w-4" /> إدارة جميع محادثاتي
        </motion.button>
      </div>
    </StudentLayout>
  );
}
