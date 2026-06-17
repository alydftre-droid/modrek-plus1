import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Pencil, Star, ShieldCheck, Check, Image as ImageIcon, FileText, Type, Link as LinkIcon, FileCheck, ListChecks, CheckCircle2, ListOrdered, AlignLeft, MoreHorizontal, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function FeatureRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check className="w-4 h-4 text-violet-500 shrink-0" />
      <span className="text-foreground/80">{children}</span>
    </div>
  );
}

function SourceChip({ icon: Icon, label, sub, color }: any) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 md:p-3 rounded-xl border border-border/50 bg-card hover:shadow-sm transition-all">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-[11px] font-semibold text-center">{label}</span>
      {sub && <span className="text-[10px] text-muted-foreground text-center">{sub}</span>}
    </div>
  );
}

export default function CreateMethodPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams")} className="gap-2">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2 relative">
          <div className="absolute -top-2 right-1/4 text-violet-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">اختر طريقة إنشاء الامتحان</h1>
          <p className="text-muted-foreground text-sm md:text-base">اختر الطريقة التي تناسبك لإنشاء امتحان احترافي بسهولة وذكاء</p>
          <div className="w-16 h-0.5 bg-violet-500 mx-auto rounded-full" />
        </motion.div>

        {/* Two cards */}
        <div className="grid grid-cols-2 gap-3 md:gap-5">
          {/* AI Card */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="relative overflow-hidden border-0 ring-1 ring-violet-200/60 dark:ring-violet-500/20 p-6 bg-gradient-to-br from-violet-50 via-fuchsia-50/40 to-background dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-background h-full flex flex-col">
              <div className="absolute top-4 right-4">
                <Badge className="bg-violet-600 text-white gap-1 border-0">
                  <Star className="w-3 h-3 fill-white" /> الأقوى والذكى
                </Badge>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-violet-700 dark:text-violet-300">نظام المساعد الذكي</h2>
                <Sparkles className="w-5 h-5 text-violet-600" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">أنشئ امتحانات احترافية في دقائق باستخدام الذكاء الاصطناعي</p>

              <div className="flex-1 space-y-2 mb-4">
                <FeatureRow>استخراج الأسئلة من الصور والملفات والنصوص</FeatureRow>
                <FeatureRow>تحويل امتحان ورقي إلى امتحان إلكتروني</FeatureRow>
                <FeatureRow>توليد أسئلة متنوعة ومستويات مختلفة</FeatureRow>
                <FeatureRow>اقتراح الإجابات النموذجية</FeatureRow>
                <FeatureRow>توفير الوقت والجهد بشكل كبير</FeatureRow>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-center text-muted-foreground">يدعم العديد من المصادر</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <SourceChip icon={ImageIcon} label="صور الكتاب" color="bg-violet-100 text-violet-600" />
                  <SourceChip icon={FileText} label="ملفات PDF" color="bg-rose-100 text-rose-600" />
                  <SourceChip icon={FileCheck} label="امتحانات ورقية" color="bg-sky-100 text-sky-600" />
                  <SourceChip icon={Type} label="نصوص الدروس" color="bg-violet-100 text-violet-600" />
                  <SourceChip icon={LinkIcon} label="روابط المواقع" color="bg-amber-100 text-amber-600" />
                </div>
              </div>

              <Button
                size="lg"
                onClick={() => navigate("/teacher/exams/new/ai")}
                className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white gap-2 shadow-md shadow-violet-500/20"
              >
                <Sparkles className="w-4 h-4" /> إنشاء باستخدام المساعد الذكي
              </Button>
            </Card>
          </motion.div>

          {/* Manual Card */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="relative overflow-hidden border-0 ring-1 ring-sky-200/60 dark:ring-sky-500/20 p-6 bg-gradient-to-br from-sky-50 via-blue-50/40 to-background dark:from-sky-950/30 dark:via-blue-950/20 dark:to-background h-full flex flex-col">
              <div className="absolute top-4 right-4">
                <Badge className="bg-sky-600 text-white gap-1 border-0">
                  <ShieldCheck className="w-3 h-3" /> تحكم كامل
                </Badge>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-sky-700 dark:text-sky-300">الإنشاء اليدوي</h2>
                <Pencil className="w-5 h-5 text-sky-600" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">أنشئ امتحانك بنفسك خطوة بخطوة</p>

              <div className="flex-1 space-y-2 mb-4">
                <FeatureRow>تحكم كامل في جميع الأسئلة والخيارات</FeatureRow>
                <FeatureRow>بناء الأسئلة من الصفر أو من بنك الأسئلة</FeatureRow>
                <FeatureRow>دعم جميع أنواع الأسئلة المتقدمة</FeatureRow>
                <FeatureRow>ترتيب الأسئلة والخيارات يدوياً</FeatureRow>
                <FeatureRow>مرونة كاملة في الإعدادات والتنسيق</FeatureRow>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-center text-muted-foreground">يدعم جميع أنواع الأسئلة</p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <SourceChip icon={ListChecks} label="اختيار من متعدد" color="bg-violet-100 text-violet-600" />
                  <SourceChip icon={CheckCircle2} label="صح / خطأ" color="bg-violet-100 text-violet-600" />
                  <SourceChip icon={ListOrdered} label="إجابات متعددة" color="bg-sky-100 text-sky-600" />
                  <SourceChip icon={AlignLeft} label="مقالي" color="bg-amber-100 text-amber-600" />
                  <SourceChip icon={MoreHorizontal} label="والمزيد..." color="bg-muted text-muted-foreground" />
                </div>
              </div>

              <Button
                size="lg"
                onClick={() => navigate("/teacher/exams/new/manual")}
                className="w-full h-12 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white gap-2 shadow-md shadow-sky-500/20"
              >
                <Pencil className="w-4 h-4" /> إنشاء امتحان يدوي
              </Button>
            </Card>
          </motion.div>
        </div>

        <Card className="p-4 flex items-center gap-3 bg-sky-50/50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/40">
          <Lightbulb className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold">نصيحة:</span> إذا كان لديك وقت محدود وتريد توفير الجهد، استخدم نظام المساعد الذكي للحصول على امتحان جاهز في دقائق
          </p>
        </Card>
      </div>
    </div>
  );
}
