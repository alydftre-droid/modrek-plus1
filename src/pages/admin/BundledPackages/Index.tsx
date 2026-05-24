import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun, Package, ListChecks, Sparkles, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function BundledPackagesIndex() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-4xl mx-auto p-4">
          <h1 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Package className="h-6 w-6 text-primary" /> الباقات المجمعة
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/bundled-packages/manage")}>
              <ListChecks className="h-4 w-4 ml-1" /> إدارة الباقات
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <Card className="overflow-hidden border-border/70 bg-card/95 shadow-lg">
          <div className="grid gap-5 p-6 md:grid-cols-[1.3fr_0.7fr] md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> إنشاء باقات ديناميكية
              </div>
              <h2 className="mt-3 text-2xl font-bold text-foreground">ابنِ باقات مجمعة واضحة ومتوافقة مع بيانات المنصة</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                اختر نوع التعليم ثم الصف والشعبة، وسيتم سحب المواد الحقيقية مباشرةً لتكوين باقة احترافية قابلة للنشر فورًا.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-secondary/20 p-2 text-secondary"><ShieldCheck className="h-5 w-5" /></div>
                  <div>
                    <div className="font-semibold text-foreground">ألوان أوضح على الهاتف</div>
                    <div className="text-xs text-muted-foreground mt-1">وضوح كامل في الوضع الفاتح والداكن</div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm">
                <div className="font-semibold text-foreground">ربط مباشر بالبيانات</div>
                <div className="text-xs text-muted-foreground mt-1">الصفحات تسحب المواد والباقات من القاعدة بشكل حي</div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { type: "أزهر", label: "التعليم الأزهري", icon: Moon, tint: "secondary", description: "باقات مهيأة للمواد العربية والشرعية والعلمية" },
            { type: "عام", label: "التعليم العام", icon: Sun, tint: "primary", description: "مسارات مرنة للصفوف والشعب والخصومات الذكية" },
          ].map((opt, i) => (
            <motion.div
              key={opt.type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card
                onClick={() => navigate(`/admin/bundled-packages/${encodeURIComponent(opt.type)}`)}
                className="group cursor-pointer overflow-hidden border border-border/70 bg-card/95 p-6 min-h-[240px] shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-2xl p-3 ${opt.tint === "secondary" ? "bg-secondary/20 text-secondary" : "bg-primary/10 text-primary"}`}>
                    <opt.icon className="h-8 w-8" />
                  </div>
                  <BadgeLike label={opt.type} tone={opt.tint === "secondary" ? "secondary" : "primary"} />
                </div>

                <div className="mt-10 space-y-3">
                  <h2 className="text-2xl font-bold text-foreground">{opt.label}</h2>
                  <p className="text-sm leading-7 text-muted-foreground">{opt.description}</p>
                </div>

                <div className="mt-6 flex items-center justify-between text-sm font-semibold">
                  <span className="text-muted-foreground">ابدأ اختيار الصفوف والمواد</span>
                  <span className="text-primary transition-transform duration-300 group-hover:-translate-x-1">المتابعة ←</span>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}

function BadgeLike({ label, tone }: { label: string; tone: "primary" | "secondary" }) {
  return (
    <div className={`rounded-full px-3 py-1 text-xs font-semibold ${tone === "secondary" ? "bg-secondary/20 text-secondary" : "bg-primary/10 text-primary"}`}>
      {label}
    </div>
  );
}
