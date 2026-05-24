import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun, ListChecks, ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function BundledPackagesIndex() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <h1 className="text-lg sm:text-xl font-bold text-foreground">الباقات المجمعة</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/bundled-packages/manage")}>
              <ListChecks className="h-4 w-4 ml-1" /> إدارة
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
        <p className="text-center text-sm text-muted-foreground pb-2">اختر نوع التعليم للبدء في إنشاء أو إدارة الباقات</p>

        {[
          { type: "أزهر", label: "التعليم الأزهري", icon: Moon, gradient: "from-amber-500/15 via-amber-500/10 to-transparent", accent: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/30" },
          { type: "عام", label: "التعليم العام", icon: Sun, gradient: "from-primary/15 via-primary/10 to-transparent", accent: "text-primary", ring: "ring-primary/30" },
        ].map((opt, i) => (
          <motion.button
            key={opt.type}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            onClick={() => navigate(`/admin/bundled-packages/${encodeURIComponent(opt.type)}`)}
            className={`group w-full overflow-hidden rounded-3xl border border-border/70 bg-card p-6 sm:p-8 text-right shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-2 ${opt.ring} bg-gradient-to-bl ${opt.gradient}`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className={`rounded-2xl bg-background/80 p-4 shadow-sm ${opt.accent}`}>
                <opt.icon className="h-9 w-9 sm:h-10 sm:w-10" />
              </div>
              <ChevronLeft className={`h-6 w-6 ${opt.accent} transition-transform duration-300 group-hover:-translate-x-1`} />
            </div>
            <div className="mt-6">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{opt.label}</div>
              <div className="mt-2 text-sm text-muted-foreground">اضغط للدخول وعرض المجموعات النشطة</div>
            </div>
          </motion.button>
        ))}
      </main>
    </div>
  );
}
