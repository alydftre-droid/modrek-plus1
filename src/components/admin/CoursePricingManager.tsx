import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ArrowRight,
  Loader2,
  Save,
  Users,
  Wallet,
  Sparkles,
  Layers,
  CheckCircle2,
  Crown,
  TrendingUp,
} from "lucide-react";
import { getStudentDashboardButtons, getBundleSubjectChoices } from "@/lib/studentCategories";
import { cn } from "@/lib/utils";

type EduType = "عام" | "أزهر";

const STAGES = [
  { key: "preparatory", label: "المرحلة الإعدادية", emoji: "🏫", hint: "الصفوف الأول والثاني والثالث الإعدادي" },
  { key: "secondary", label: "المرحلة الثانوية", emoji: "🎓", hint: "الصفوف الأول والثاني والثالث الثانوي" },
] as const;

function gradesFor(_stage: string) {
  return [
    { key: "first", label: "الصف الأول", num: "1" },
    { key: "second", label: "الصف الثاني", num: "2" },
    { key: "third", label: "الصف الثالث", num: "3" },
  ];
}

function needsSection(edu: EduType, stage: string, grade: string) {
  if (stage !== "secondary") return false;
  if (edu === "عام" && grade === "first") return false;
  return true;
}

function sectionsFor(edu: EduType, grade: string) {
  if (edu === "أزهر") {
    return [
      { key: "scientific", label: "علمي", emoji: "🔬" },
      { key: "literary", label: "أدبي", emoji: "📚" },
    ];
  }
  if (grade === "third") {
    return [
      { key: "علمي علوم", label: "علمي علوم", emoji: "🧬" },
      { key: "علمي رياضة", label: "علمي رياضة", emoji: "📐" },
      { key: "literary", label: "أدبي", emoji: "📚" },
    ];
  }
  return [
    { key: "scientific", label: "علمي", emoji: "🔬" },
    { key: "literary", label: "أدبي", emoji: "📚" },
  ];
}

type Step = "edu" | "stage" | "grade" | "section" | "subjects" | "detail";

interface PriceRow {
  id?: string;
  price: number;
  shared_subject_key?: string | null;
}

function sharedPriceKey(category: string, subjectName?: string | null) {
  const c = (category || "").trim();
  const n = (subjectName || "").trim();

  if (c === "math" || n === "الرياضيات") return "math";
  if (c === "english" || n === "اللغة الإنجليزية") return "english";
  if (c === "french" || n === "اللغة الفرنسية") return "french";
  if (c === "integrated_science") return "integrated_science";
  if (c === "studies" || c === "social") return "social_studies";
  if (c === "literary" && n === "التاريخ") return "history";
  if (c === "literary" && n === "الجغرافيا") return "geography";
  if ((c === "science" || c === "scientific") && n === "الفيزياء") return "physics";
  if ((c === "science" || c === "scientific") && n === "الكيمياء") return "chemistry";
  if ((c === "science" || c === "scientific") && (n === "الأحياء" || n === "الاحياء")) return "biology";
  if ((c === "science" || c === "scientific") && n === "الجيولوجيا") return "geology";
  if (c === "science" && !n) return "science";

  return "";
}

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -16 },
};

const CoursePricingManager = () => {
  const [step, setStep] = useState<Step>("edu");
  const [edu, setEdu] = useState<EduType | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    label: string;
    category: string;
    subjectName?: string | null;
    emoji?: string;
  } | null>(null);

  const goBack = () => {
    if (step === "detail") return setStep("subjects");
    if (step === "subjects") {
      if (needsSection(edu!, stage!, grade!)) return setStep("section");
      return setStep("grade");
    }
    if (step === "section") return setStep("grade");
    if (step === "grade") return setStep("stage");
    if (step === "stage") return setStep("edu");
  };

  const reset = () => {
    setStep("edu");
    setEdu(null); setStage(null); setGrade(null); setSection(null); setTarget(null);
  };

  const stepIndex = ["edu", "stage", "grade", needsSection(edu!, stage!, grade!) ? "section" : null, "subjects", "detail"].filter(Boolean).indexOf(step);
  const totalSteps = needsSection(edu!, stage!, grade!) ? 6 : 5;

  const crumbs = [
    edu && { label: edu, onClick: () => setStep("edu") },
    stage && { label: STAGES.find((s) => s.key === stage)?.label, onClick: () => setStep("stage") },
    grade && { label: gradesFor(stage!).find((g) => g.key === grade)?.label, onClick: () => setStep("grade") },
    section && { label: sectionsFor(edu!, grade!).find((s) => s.key === section)?.label || section, onClick: () => setStep("section") },
    target && { label: target.subjectName || target.label, onClick: () => setStep("subjects") },
  ].filter(Boolean) as { label: string; onClick: () => void }[];

  return (
    <div
      dir="rtl"
      className="relative min-h-[85vh] -mx-3 sm:-mx-5 -mt-4 rounded-3xl overflow-hidden"
      style={{
        background: "radial-gradient(1200px 600px at 100% -10%, rgba(99,102,241,.18), transparent 60%), radial-gradient(900px 500px at 0% 0%, rgba(168,85,247,.14), transparent 55%), linear-gradient(180deg, #0b0f1e 0%, #0a0e1c 100%)",
      }}
    >
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute top-10 right-10 h-72 w-72 rounded-full blur-3xl opacity-30" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }} />
      <div className="pointer-events-none absolute bottom-10 left-10 h-80 w-80 rounded-full blur-3xl opacity-20" style={{ background: "linear-gradient(135deg, #06b6d4, #3b82f6)" }} />

      <div className="relative z-10 px-4 sm:px-8 py-6 sm:py-8">
        {/* Top brand bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-md opacity-60" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }} />
              <div className="relative h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>
                <Crown className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-indigo-300/80">PRICING · 2026</div>
              <h1 className="text-lg sm:text-2xl font-black text-white">تسعير اشتراكات الكورسات</h1>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-white/60 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            تطبيق فوري على كل المعلمين
          </div>
        </div>

        {/* Progress stepper */}
        <div className="mb-6 flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-500",
                i <= stepIndex ? "bg-gradient-to-r from-indigo-400 to-fuchsia-400" : "bg-white/8"
              )}
            />
          ))}
        </div>

        {/* Breadcrumbs */}
        {crumbs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-6">
            <button onClick={reset} className="px-2.5 py-1 rounded-full bg-white/5 text-white/70 hover:bg-white/10 border border-white/10">
              البداية
            </button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronLeft className="h-3 w-3 text-white/40" />
                <button
                  onClick={c.onClick}
                  className={cn(
                    "px-2.5 py-1 rounded-full border transition-all",
                    i === crumbs.length - 1
                      ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white border-transparent font-bold shadow-lg shadow-indigo-500/30"
                      : "bg-white/5 text-white/80 hover:bg-white/10 border-white/10"
                  )}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === "edu" && (
            <motion.div key="edu" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
              <StepHeader title="اختر نوع التعليم" subtitle="ابدأ بتحديد نوع التعليم لإدارة أسعار مواده" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <HeroCard
                  emoji="🏫"
                  title="التعليم العام"
                  hint="مدارس الحكومة واللغات"
                  onClick={() => { setEdu("عام"); setStage(null); setGrade(null); setSection(null); setStep("stage"); }}
                  gradient="linear-gradient(135deg, #0ea5e9, #6366f1)"
                />
                <HeroCard
                  emoji="🕌"
                  title="التعليم الأزهري"
                  hint="معاهد أزهرية"
                  onClick={() => { setEdu("أزهر"); setStage(null); setGrade(null); setSection(null); setStep("stage"); }}
                  gradient="linear-gradient(135deg, #10b981, #14b8a6)"
                />
              </div>
            </motion.div>
          )}

          {step === "stage" && edu && (
            <motion.div key="stage" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
              <StepHeader title="اختر المرحلة" subtitle={`${edu} — حدّد المرحلة الدراسية`} onBack={goBack} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {STAGES.map((s, i) => (
                  <HeroCard
                    key={s.key}
                    emoji={s.emoji}
                    title={s.label}
                    hint={s.hint}
                    onClick={() => { setStage(s.key); setGrade(null); setSection(null); setStep("grade"); }}
                    gradient={i === 0 ? "linear-gradient(135deg, #f59e0b, #ef4444)" : "linear-gradient(135deg, #8b5cf6, #ec4899)"}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {step === "grade" && edu && stage && (
            <motion.div key="grade" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
              <StepHeader title="اختر الصف" subtitle="حدّد الصف الدراسي" onBack={goBack} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {gradesFor(stage).map((g, i) => (
                  <GradeCard
                    key={g.key}
                    num={g.num}
                    title={g.label}
                    index={i}
                    onClick={() => {
                      setGrade(g.key); setSection(null);
                      if (needsSection(edu, stage, g.key)) setStep("section");
                      else setStep("subjects");
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {step === "section" && edu && stage && grade && (
            <motion.div key="section" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
              <StepHeader title="اختر الشعبة" subtitle="حدّد الشعبة لعرض المواد المناسبة" onBack={goBack} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {sectionsFor(edu, grade).map((s, i) => (
                  <HeroCard
                    key={s.key}
                    emoji={s.emoji}
                    title={s.label}
                    onClick={() => { setSection(s.key); setStep("subjects"); }}
                    gradient={
                      i === 0 ? "linear-gradient(135deg, #06b6d4, #3b82f6)" :
                      i === 1 ? "linear-gradient(135deg, #8b5cf6, #d946ef)" :
                      "linear-gradient(135deg, #f59e0b, #ec4899)"
                    }
                  />
                ))}
              </div>
            </motion.div>
          )}

          {step === "subjects" && edu && stage && grade && (
            <motion.div key="subjects" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
              <SubjectsList
                edu={edu}
                stage={stage}
                grade={grade}
                section={section}
                onBack={goBack}
                onSelect={(t) => { setTarget(t); setStep("detail"); }}
              />
            </motion.div>
          )}

          {step === "detail" && edu && stage && grade && target && (
            <motion.div key="detail" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
              <SubjectDetail
                edu={edu}
                stage={stage}
                grade={grade}
                section={section}
                target={target}
                onBack={goBack}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ---------------- Sub-components ---------------- */

const StepHeader = ({
  title, subtitle, onBack,
}: { title: string; subtitle?: string; onBack?: () => void }) => (
  <div className="mb-6 flex items-start justify-between gap-3">
    <div>
      <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-white/60 mt-1.5">{subtitle}</p>}
    </div>
    {onBack && (
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1.5 text-white/80 hover:text-white hover:bg-white/10 border border-white/10 rounded-full backdrop-blur"
      >
        <ArrowRight className="h-4 w-4" />
        رجوع
      </Button>
    )}
  </div>
);

const HeroCard = ({
  emoji, title, hint, onClick, gradient,
}: { emoji: string; title: string; hint?: string; onClick: () => void; gradient: string }) => (
  <button
    onClick={onClick}
    className="group relative overflow-hidden rounded-3xl p-6 sm:p-7 text-right transition-all duration-500 hover:-translate-y-1 active:scale-[0.98]"
    style={{ background: gradient }}
  >
    {/* glass overlay */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" />
    <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-white/15 blur-2xl group-hover:scale-125 transition-transform duration-700" />
    <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl" />

    <div className="relative z-10 flex items-center justify-between gap-4">
      <div className="text-right">
        <div className="text-5xl sm:text-6xl mb-3 drop-shadow-2xl group-hover:scale-110 transition-transform duration-500 inline-block">
          {emoji}
        </div>
        <div className="text-white font-black text-xl sm:text-2xl drop-shadow">{title}</div>
        {hint && <div className="text-white/80 text-xs sm:text-sm mt-1.5 drop-shadow">{hint}</div>}
      </div>
      <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center group-hover:bg-white/30 group-hover:-translate-x-1 transition-all">
        <ChevronLeft className="h-5 w-5 text-white" />
      </div>
    </div>
  </button>
);

const GradeCard = ({
  num, title, onClick, index,
}: { num: string; title: string; onClick: () => void; index: number }) => {
  const gradients = [
    "linear-gradient(135deg, #6366f1, #8b5cf6)",
    "linear-gradient(135deg, #ec4899, #f43f5e)",
    "linear-gradient(135deg, #14b8a6, #06b6d4)",
  ];
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-3xl p-6 text-center transition-all duration-500 hover:-translate-y-1 active:scale-[0.98]"
      style={{ background: gradients[index % 3] }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/20" />
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/15 blur-2xl group-hover:scale-150 transition-transform duration-700" />
      <div className="relative z-10">
        <div className="mx-auto mb-3 h-20 w-20 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center text-5xl font-black text-white shadow-2xl">
          {num}
        </div>
        <div className="text-white font-black text-lg drop-shadow">{title}</div>
      </div>
    </button>
  );
};

const SubjectsList = ({
  edu, stage, grade, section, onBack, onSelect,
}: {
  edu: EduType; stage: string; grade: string; section: string | null;
  onBack: () => void;
  onSelect: (t: { label: string; category: string; subjectName?: string | null; emoji?: string }) => void;
}) => {
  const buttons = useMemo(
    () => getStudentDashboardButtons({ educationType: edu, stage, grade, section }),
    [edu, stage, grade, section]
  );

  const items = useMemo(() => {
    const out: { key: string; label: string; emoji: string; category: string; subjectName?: string | null }[] = [];
    buttons.forEach((b) => {
      if (b.hasSubjects) {
        const choices = getBundleSubjectChoices(b.key, { stage, grade, section });
        choices.forEach((c) => {
          const category = b.key === "history_geo"
            ? "literary"
            : c.name === "الرياضيات"
              ? "math"
              : "science";
          out.push({
            key: `${b.key}:${c.name}`,
            label: c.name,
            emoji: c.emoji,
            category,
            subjectName: c.name,
          });
        });
      } else {
        out.push({
          key: b.key,
          label: b.name,
          emoji: b.emoji,
          category: categoryForButton(b.key),
          subjectName: null,
        });
      }
    });
    return out;
  }, [buttons, stage, grade, section]);

  const subjectGradient = (key: string): string => {
    if (key.includes("arabic")) return "linear-gradient(135deg,#f59e0b,#ef4444)";
    if (key.includes("religious")) return "linear-gradient(135deg,#10b981,#14b8a6)";
    if (key.includes("english")) return "linear-gradient(135deg,#3b82f6,#6366f1)";
    if (key.includes("math") || key.includes("الرياضيات")) return "linear-gradient(135deg,#8b5cf6,#ec4899)";
    if (key.includes("physics") || key.includes("الفيزياء")) return "linear-gradient(135deg,#eab308,#f59e0b)";
    if (key.includes("chemistry") || key.includes("الكيمياء")) return "linear-gradient(135deg,#14b8a6,#06b6d4)";
    if (key.includes("biology") || key.includes("الأحياء")) return "linear-gradient(135deg,#22c55e,#10b981)";
    if (key.includes("science")) return "linear-gradient(135deg,#06b6d4,#3b82f6)";
    if (key.includes("social") || key.includes("history") || key.includes("geo")) return "linear-gradient(135deg,#f97316,#ef4444)";
    return "linear-gradient(135deg,#6366f1,#a855f7)";
  };

  return (
    <>
      <StepHeader title="المواد المتاحة" subtitle="اختر مادة لعرض سعرها الحالي وتعديله" onBack={onBack} />
      {items.length === 0 ? (
        <p className="text-center py-16 text-white/60">لا توجد مواد لهذا التصنيف</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onSelect({ label: it.label, category: it.category, subjectName: it.subjectName, emoji: it.emoji })}
              className="group relative overflow-hidden rounded-3xl p-5 text-right transition-all duration-500 hover:-translate-y-1 active:scale-[0.98]"
              style={{ background: subjectGradient(it.key) }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/15 blur-2xl group-hover:scale-150 transition-transform" />
              <div className="relative z-10">
                <div className="text-4xl sm:text-5xl mb-3 drop-shadow inline-block group-hover:scale-110 transition-transform">{it.emoji}</div>
                <div className="font-black text-sm sm:text-base text-white drop-shadow">{it.label}</div>
                <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-white/20 backdrop-blur px-2 py-1 rounded-full">
                  اضغط للتسعير
                  <ChevronLeft className="h-3 w-3" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
};

function categoryForButton(key: string): string {
  switch (key) {
    case "arabic": return "arabic";
    case "religious": return "sharia";
    case "english": return "english";
    case "math": return "math";
    case "science": return "science";
    case "integrated_science": return "integrated_science";
    case "social": return "studies";
    case "history_geo":
    case "history":
    case "geography":
      return "literary";
    default: return key;
  }
}

const SubjectDetail = ({
  edu, stage, grade, section, target, onBack,
}: {
  edu: EduType; stage: string; grade: string; section: string | null;
  target: { label: string; category: string; subjectName?: string | null; emoji?: string };
  onBack: () => void;
}) => {
  const sectionKey = section || null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [existing, setExisting] = useState<PriceRow | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [activeSubs, setActiveSubs] = useState(0);
  const [groupCount, setGroupCount] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const { data: pr } = await supabase
        .rpc("get_subject_default_prices" as any, {
          p_education_type: edu,
          p_stage: stage,
          p_grade: grade,
        });
      const filtered = (pr || []).filter((r: any) => {
        const targetSharedKey = sharedPriceKey(target.category, target.subjectName);
        if (targetSharedKey && r.shared_subject_key === targetSharedKey) return true;

        const matchSection = !r.section || (r.section || "") === (sectionKey || "");
        const matchName = (r.subject_name || "") === (target.subjectName || "");
        return r.category === target.category && matchSection && matchName;
      });
      const row = filtered[0] as any;
      if (row) {
        setExisting({ id: row.id, price: Number(row.price), shared_subject_key: row.shared_subject_key || null });
        setPriceInput(String(row.price));
      } else {
        setExisting(null);
        setPriceInput("");
      }

      const sq = supabase
        .from("subjects")
        .select("id,name,section")
        .eq("stage", stage)
        .eq("grade", grade)
        .eq("category", target.category);
      const { data: subs } = await sq;
      const filteredSubs = (subs || []).filter((s: any) => {
        const sec = s.section || "";
        const matchSec = !sectionKey ? !sec : (!sec || sec === sectionKey);
        const matchName = !target.subjectName || s.name === target.subjectName;
        return matchSec && matchName;
      });
      const subjectIds = filteredSubs.map((s: any) => s.id);

      if (subjectIds.length > 0) {
        const { count: subsCount } = await supabase
          .from("subscriptions")
          .select("*", { count: "exact", head: true })
          .in("subject_id", subjectIds)
          .eq("is_active", true)
          .gt("end_date", new Date().toISOString());
        setActiveSubs(subsCount || 0);

        const { count: gc } = await supabase
          .from("content_groups")
          .select("*", { count: "exact", head: true })
          .in("subject_id", subjectIds);
        setGroupCount(gc || 0);
      } else {
        setActiveSubs(0);
        setGroupCount(0);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edu, stage, grade, section, target.category, target.subjectName]);

  const saveAndApply = async () => {
    const price = Number(priceInput);
    if (!priceInput || Number.isNaN(price) || price < 0) {
      toast.error("أدخل سعراً صالحاً");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_subject_default_price" as any, {
        p_education_type: edu,
        p_stage: stage,
        p_grade: grade,
        p_category: target.category,
        p_subject_name: target.subjectName || null,
        p_price: price,
      });
      if (error) throw error;
      toast.success("تم حفظ السعر الجديد. سيُطبَّق تلقائياً على المجموعات الجديدة فقط، والمجموعات الحالية تحتفظ بأسعارها.");
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
      setApplying(false);
    }
  };

  return (
    <>
      <StepHeader title={target.subjectName || target.label} subtitle="عرض البيانات الحالية وتغيير السعر الموحَّد" onBack={onBack} />

      {/* Hero card */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 mb-5" style={{ background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)" }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        <div className="relative z-10 flex items-center gap-5">
          <div className="text-7xl drop-shadow-2xl">{target.emoji || "📘"}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold tracking-widest text-white/80 mb-1">SUBJECT PRICING</div>
            <div className="text-2xl sm:text-3xl font-black text-white drop-shadow truncate">
              {target.subjectName || target.label}
            </div>
            <div className="text-xs text-white/80 mt-1">
              {edu} · {STAGES.find((s) => s.key === stage)?.label} · {gradesFor(stage).find((g) => g.key === grade)?.label}
              {section ? ` · ${section}` : ""}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full bg-white/5" />
          <Skeleton className="h-48 w-full bg-white/5" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatTile icon={<Wallet className="h-4 w-4" />} label="السعر الحالي" value={existing ? `${existing.price} ج` : "—"} gradient="linear-gradient(135deg,#10b981,#14b8a6)" />
            <StatTile icon={<Users className="h-4 w-4" />} label="مشتركون فعّالون" value={String(activeSubs)} gradient="linear-gradient(135deg,#3b82f6,#6366f1)" />
            <StatTile icon={<Layers className="h-4 w-4" />} label="مجموعات الكورسات" value={String(groupCount)} gradient="linear-gradient(135deg,#f59e0b,#ef4444)" />
          </div>

          {/* Price editor */}
          <div className="relative rounded-3xl p-6 sm:p-7 backdrop-blur-xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="absolute -bottom-12 -right-12 w-40 h-40 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h4 className="font-black text-white text-lg">تغيير السعر الموحَّد</h4>
              </div>
              <p className="text-xs text-white/60 mb-5 leading-relaxed">
                سيتم تطبيق السعر الجديد فوراً على جميع كورسات هذه المادة لكل المعلمين، ويُطبَّق تلقائياً على أي مجموعة جديدة.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="h-14 text-2xl font-black text-center bg-white/10 border-white/20 text-white placeholder:text-white/30 pl-16"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/60">جنيه</span>
                </div>
                <Button
                  onClick={saveAndApply}
                  disabled={saving || applying}
                  className="h-14 px-7 gap-2 font-black text-base border-0 shadow-2xl shadow-fuchsia-500/40"
                  style={{ background: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)" }}
                >
                  {saving || applying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  حفظ وتطبيق على الجميع
                </Button>
              </div>

              <div className="mt-5 flex items-start gap-2 text-xs text-white/70 bg-emerald-500/10 border border-emerald-400/20 rounded-2xl p-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" />
                <div>
                  التغيير يُطبَّق على كل المعلمين عند إنشاء أي مجموعة جديدة في هذه المادة لهذا الصف،
                  وعلى جميع المجموعات الموجودة حالياً.
                </div>
              </div>
            </div>
          </div>

          {/* Info badge */}
          <div className="mt-4 flex items-center gap-2 text-[11px] text-white/60">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-300" />
            <span>السعر يربط تلقائياً بكل كورسات المعلمين الحاليين والمستقبليين</span>
          </div>
        </>
      )}
    </>
  );
};

const StatTile = ({
  icon, label, value, gradient,
}: { icon: React.ReactNode; label: string; value: string; gradient: string }) => (
  <div className="relative overflow-hidden rounded-2xl p-3 sm:p-4" style={{ background: gradient }}>
    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
    <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/20 blur-xl" />
    <div className="relative z-10 text-white">
      <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-90 mb-1">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg sm:text-2xl font-black drop-shadow">{value}</div>
    </div>
  </div>
);

export default CoursePricingManager;
