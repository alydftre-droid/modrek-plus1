import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Pencil, Star, ShieldCheck, Check, Lightbulb, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { normalizeEducationType, normalizeSectionForSubjects } from "@/lib/educationSection";
import aiBot from "@/assets/ai-bot-mascot.png";


function FeatureRow({ children, color = "text-violet-500" }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] md:text-sm leading-relaxed">
      <Check className={`w-3 h-3 md:w-4 md:h-4 ${color} shrink-0 mt-0.5`} />
      <span className="text-foreground/80">{children}</span>
    </div>
  );
}

type EduTarget = "both" | "عام" | "أزهر";
type SectionTarget = "both" | "scientific" | "literary";

export default function CreateMethodPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("return_to") || "";
  const groupId = params.get("group_id") || params.get("groupId") || "";
  const subjectId = params.get("subject_id") || params.get("subjectId") || "";

  const [eduTarget, setEduTarget] = useState<EduTarget>("both");
  const [sectionTarget, setSectionTarget] = useState<SectionTarget>("both");
  const [showEduTarget, setShowEduTarget] = useState(false);
  const [showSectionTarget, setShowSectionTarget] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!subjectId) return;
      const [{ data: subj }, { data: group }] = await Promise.all([
        supabase
        .from("subjects")
        .select("name, stage, grade, category, section")
        .eq("id", subjectId)
        .maybeSingle(),
        groupId
          ? supabase.from("content_groups").select("education_type").eq("id", groupId).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled || !subj) return;
      const groupEducationType = normalizeEducationType((group as any)?.education_type);
      if (groupEducationType) setEduTarget(groupEducationType);
      const cat = String(subj.category || "").toLowerCase();
      const isArabic = cat === "arabic" || cat.includes("عرب");
      const isSharia = cat === "sharia" || cat === "religious" || cat.includes("شرع");
      const isSecondary = subj.stage === "secondary";
      setShowEduTarget(isSecondary && !(isArabic || isSharia) && !groupEducationType);

      // Only show section selector when subject has two section variants
      const { data: variants } = await supabase
        .from("subjects")
        .select("section")
        .eq("name", subj.name)
        .eq("stage", subj.stage)
        .eq("grade", subj.grade)
        .eq("is_active", true);
      const uniq = new Set((variants || []).map((r: any) => normalizeSectionForSubjects(r.section)).filter(Boolean));
      const isSingleSectionCategory = ["science", "scientific", "integrated_science", "literary", "history_geo"].includes(cat);
      setShowSectionTarget(isSecondary && uniq.size >= 2 && !isSingleSectionCategory);
    })();
    return () => { cancelled = true; };
  }, [subjectId, groupId]);

  const buildQuery = useMemo(() => {
    const next = new URLSearchParams(params);
    if (showEduTarget && eduTarget !== "both") next.set("target_education_type", eduTarget);
    else next.delete("target_education_type");
    if (showSectionTarget && sectionTarget !== "both") next.set("target_section", sectionTarget);
    else next.delete("target_section");
    return next.toString();
  }, [params, eduTarget, sectionTarget, showEduTarget, showSectionTarget]);

  const withCreationQuery = (path: string) => buildQuery ? `${path}?${buildQuery}` : path;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-3 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(returnTo || withCreationQuery("/teacher/exams"))} className="gap-2 h-9 rounded-xl text-xs md:text-sm">
            <ArrowRight className="w-4 h-4" /> الرجوع
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-1.5 md:space-y-2 relative">
          <h1 className="text-lg md:text-3xl font-bold flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 md:w-6 md:h-6 text-violet-500" />
            اختر طريقة إنشاء الامتحان
          </h1>
          <p className="text-muted-foreground text-[11px] md:text-base px-4">اختر الطريقة التي تناسبك لإنشاء امتحان احترافي بسهولة وذكاء</p>
          <div className="w-12 md:w-16 h-0.5 bg-violet-500 mx-auto rounded-full" />
        </motion.div>

        {(showEduTarget || showSectionTarget) && (
          <Card className="p-3 md:p-5 border-violet-200/60 bg-violet-50/40 dark:bg-violet-950/20 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 md:w-5 md:h-5 text-violet-600" />
              <h3 className="text-sm md:text-base font-bold text-violet-800 dark:text-violet-300">من هم الطلاب المستهدفون؟</h3>
            </div>
            <p className="text-[11px] md:text-xs text-muted-foreground -mt-2 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> اختر الفئة المناسبة حتى لا يظهر الامتحان لطلاب غير مقصودين.
            </p>

            {showEduTarget && (
              <div className="space-y-1.5">
                <label className="text-[11px] md:text-xs font-semibold text-slate-700 dark:text-slate-300">نوع التعليم</label>
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  {([
                    { v: "both", label: "الاثنين (عام + أزهر)" },
                    { v: "عام", label: "عام فقط" },
                    { v: "أزهر", label: "أزهر فقط" },
                  ] as { v: EduTarget; label: string }[]).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setEduTarget(opt.v)}
                      className={cn(
                        "px-2 py-2 rounded-xl border text-[11px] md:text-sm font-semibold transition-colors",
                        eduTarget === opt.v
                          ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showSectionTarget && (
              <div className="space-y-1.5">
                <label className="text-[11px] md:text-xs font-semibold text-slate-700 dark:text-slate-300">الشعبة</label>
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  {([
                    { v: "both", label: "علمي + أدبي" },
                    { v: "scientific", label: "علمي فقط" },
                    { v: "literary", label: "أدبي فقط" },
                  ] as { v: SectionTarget; label: string }[]).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setSectionTarget(opt.v)}
                      className={cn(
                        "px-2 py-2 rounded-xl border text-[11px] md:text-sm font-semibold transition-colors",
                        sectionTarget === opt.v
                          ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}


        <div className="grid grid-cols-2 gap-2.5 md:gap-5">
          {/* AI Card */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="relative overflow-hidden border-0 ring-1 ring-violet-200/60 dark:ring-violet-500/20 p-3 md:p-6 bg-gradient-to-br from-violet-50 via-fuchsia-50/40 to-background dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-background h-full flex flex-col">
              <div className="absolute top-2.5 right-2.5 md:top-4 md:right-4">
                <Badge className="bg-violet-600 text-white gap-1 border-0 text-[9px] md:text-xs px-1.5 md:px-2.5 py-0.5">
                  <Star className="w-2.5 h-2.5 md:w-3 md:h-3 fill-white" /> الأقوى
                </Badge>
              </div>

              <div className="flex flex-col items-center text-center mb-2 mt-6 md:mt-2">
                <img src={aiBot} alt="AI" className="w-16 h-16 md:w-28 md:h-28 object-contain mb-2" />
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 md:w-5 md:h-5 text-violet-600" />
                  <h2 className="text-sm md:text-xl font-bold text-violet-700 dark:text-violet-300">المساعد الذكي</h2>
                </div>
              </div>
              <p className="text-[10px] md:text-sm text-muted-foreground mb-3 text-center leading-relaxed">أنشئ امتحانات احترافية بالذكاء الاصطناعي</p>

              <div className="flex-1 space-y-1.5 md:space-y-2 mb-3 md:mb-4">
                <FeatureRow>استخراج الأسئلة من الصور والملفات</FeatureRow>
                <FeatureRow>تحويل ورقي إلى إلكتروني</FeatureRow>
                <FeatureRow>توليد أسئلة متنوعة</FeatureRow>
                <FeatureRow>اقتراح إجابات نموذجية</FeatureRow>
                <FeatureRow>توفير الوقت والجهد</FeatureRow>
              </div>

              <Button
                onClick={() => navigate(withCreationQuery("/teacher/exams/new/ai"))}
                className="w-full h-9 md:h-12 text-[11px] md:text-sm text-white gap-1.5 rounded-xl border-0 hover:opacity-95 transition"
                style={{
                  background: "linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)",
                  boxShadow: "0 8px 20px -8px rgba(124,58,237,0.55)",
                }}
              >
                <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" /> إنشاء بالذكاء
              </Button>
            </Card>
          </motion.div>

          {/* Manual Card */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <Card className="relative overflow-hidden border-0 ring-1 ring-sky-200/60 dark:ring-sky-500/20 p-3 md:p-6 bg-gradient-to-br from-sky-50 via-blue-50/40 to-background dark:from-sky-950/30 dark:via-blue-950/20 dark:to-background h-full flex flex-col">
              <div className="absolute top-2.5 right-2.5 md:top-4 md:right-4">
                <Badge className="bg-sky-600 text-white gap-1 border-0 text-[9px] md:text-xs px-1.5 md:px-2.5 py-0.5">
                  <ShieldCheck className="w-2.5 h-2.5 md:w-3 md:h-3" /> تحكم كامل
                </Badge>
              </div>

              <div className="flex flex-col items-center text-center mb-2 mt-6 md:mt-2">
                <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/40 dark:to-blue-900/40 flex items-center justify-center mb-2">
                  <Pencil className="w-8 h-8 md:w-14 md:h-14 text-sky-600" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5 md:w-5 md:h-5 text-sky-600" />
                  <h2 className="text-sm md:text-xl font-bold text-sky-700 dark:text-sky-300">الإنشاء اليدوي</h2>
                </div>
              </div>
              <p className="text-[10px] md:text-sm text-muted-foreground mb-3 text-center leading-relaxed">أنشئ امتحانك بنفسك خطوة بخطوة</p>

              <div className="flex-1 space-y-1.5 md:space-y-2 mb-3 md:mb-4">
                <FeatureRow color="text-sky-500">تحكم كامل في جميع الأسئلة</FeatureRow>
                <FeatureRow color="text-sky-500">بناء من الصفر أو بنك الأسئلة</FeatureRow>
                <FeatureRow color="text-sky-500">دعم جميع أنواع الأسئلة</FeatureRow>
                <FeatureRow color="text-sky-500">ترتيب يدوي للأسئلة</FeatureRow>
                <FeatureRow color="text-sky-500">مرونة كاملة في التنسيق</FeatureRow>
              </div>

              <Button
                onClick={() => navigate(withCreationQuery("/teacher/exams/new/manual"))}
                className="w-full h-9 md:h-12 text-[11px] md:text-sm bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white gap-1.5 shadow-md shadow-sky-500/20 rounded-xl"
              >
                <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" /> إنشاء يدوي
              </Button>
            </Card>
          </motion.div>
        </div>

        <Card className="p-3 md:p-4 flex items-start gap-2 md:gap-3 bg-sky-50/50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/40">
          <Lightbulb className="w-4 h-4 md:w-5 md:h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] md:text-sm leading-relaxed">
            <span className="font-semibold">نصيحة:</span> استخدم المساعد الذكي للحصول على امتحان جاهز في دقائق، وتأكد من اختيار الفئة المستهدفة أعلاه.
          </p>
        </Card>
      </div>
    </div>
  );
}
