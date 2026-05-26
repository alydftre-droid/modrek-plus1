import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronRight,
  ArrowRight,
  Loader2,
  Save,
  GraduationCap,
  BookOpen,
  Users,
  Wallet,
  Sparkles,
  School,
  Layers,
  Hash,
  CheckCircle2,
} from "lucide-react";
import { getStudentDashboardButtons, getBundleSubjectChoices } from "@/lib/studentCategories";
import { cn } from "@/lib/utils";

type EduType = "عام" | "أزهر";

const STAGES = [
  { key: "preparatory", label: "المرحلة الإعدادية", emoji: "🏫" },
  { key: "secondary", label: "المرحلة الثانوية", emoji: "🎓" },
] as const;

function gradesFor(stage: string) {
  return [
    { key: "first", label: "الصف الأول", emoji: "1️⃣" },
    { key: "second", label: "الصف الثاني", emoji: "2️⃣" },
    { key: "third", label: "الصف الثالث", emoji: "3️⃣" },
  ];
}

function needsSection(edu: EduType, stage: string, grade: string) {
  if (stage !== "secondary") return false;
  if (edu === "عام" && grade === "first") return false;
  return true;
}

function sectionsFor(edu: EduType, grade: string): { key: string; label: string; emoji: string }[] {
  if (edu === "أزهر") {
    return [
      { key: "scientific", label: "علمي", emoji: "🔬" },
      { key: "literary", label: "أدبي", emoji: "📚" },
    ];
  }
  if (grade === "third") {
    return [
      { key: "علمي علوم", label: "علمي علوم", emoji: "🔬" },
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
}

const pageVariants = {
  initial: { opacity: 0, x: 40 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: -40 },
};

const CoursePricingManager = () => {
  const [step, setStep] = useState<Step>("edu");
  const [edu, setEdu] = useState<EduType | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  // The selected pricing target (one row per category button, optionally subject-specific)
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
    setEdu(null);
    setStage(null);
    setGrade(null);
    setSection(null);
    setTarget(null);
  };

  // Breadcrumb
  const crumbs = [
    edu && { label: edu, onClick: () => setStep("edu") },
    stage && { label: STAGES.find((s) => s.key === stage)?.label, onClick: () => setStep("stage") },
    grade && { label: gradesFor(stage!).find((g) => g.key === grade)?.label, onClick: () => setStep("grade") },
    section && { label: sectionsFor(edu!, grade!).find((s) => s.key === section)?.label || section, onClick: () => setStep("section") },
    target && { label: target.subjectName || target.label, onClick: () => setStep("subjects") },
  ].filter(Boolean) as { label: string; onClick: () => void }[];

  return (
    <div className="min-h-[70vh] bg-gradient-to-br from-emerald-50/40 via-background to-teal-50/40 rounded-2xl p-3 sm:p-5" dir="rtl">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Wallet className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold">تسعير اشتراكات الكورسات</h2>
            <p className="text-xs text-muted-foreground">حدّد سعراً ثابتاً لكل مادة في كل صف. يُطبَّق على كل المعلمين تلقائياً.</p>
          </div>
        </div>

        {crumbs.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap text-xs">
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">البداية</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground rotate-180" />
                <button
                  onClick={c.onClick}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition-colors",
                    i === crumbs.length - 1
                      ? "bg-emerald-600 text-white font-bold"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  )}
                >
                  {c.label}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {step === "edu" && (
          <motion.div key="edu" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
            <StepWrapper title="اختر نوع التعليم" subtitle="ابدأ بتحديد نوع التعليم لإدارة أسعار مواده">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {(["عام", "أزهر"] as EduType[]).map((t) => (
                  <BigCard
                    key={t}
                    emoji={t === "عام" ? "🏫" : "🕌"}
                    title={t === "عام" ? "التعليم العام" : "التعليم الأزهري"}
                    onClick={() => { setEdu(t); setStage(null); setGrade(null); setSection(null); setStep("stage"); }}
                    gradient={t === "عام" ? "from-sky-500 to-blue-600" : "from-emerald-600 to-teal-700"}
                  />
                ))}
              </div>
            </StepWrapper>
          </motion.div>
        )}

        {step === "stage" && edu && (
          <motion.div key="stage" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
            <StepWrapper title="اختر المرحلة" subtitle={`${edu} — اختر المرحلة الدراسية`} onBack={goBack}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {STAGES.map((s) => (
                  <BigCard
                    key={s.key}
                    emoji={s.emoji}
                    title={s.label}
                    onClick={() => { setStage(s.key); setGrade(null); setSection(null); setStep("grade"); }}
                    gradient="from-emerald-500 to-teal-600"
                  />
                ))}
              </div>
            </StepWrapper>
          </motion.div>
        )}

        {step === "grade" && edu && stage && (
          <motion.div key="grade" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
            <StepWrapper title="اختر الصف" subtitle="اختر الصف الدراسي" onBack={goBack}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {gradesFor(stage).map((g) => (
                  <BigCard
                    key={g.key}
                    emoji={g.emoji}
                    title={g.label}
                    onClick={() => {
                      setGrade(g.key);
                      setSection(null);
                      if (needsSection(edu, stage, g.key)) setStep("section");
                      else setStep("subjects");
                    }}
                    gradient="from-teal-500 to-emerald-600"
                  />
                ))}
              </div>
            </StepWrapper>
          </motion.div>
        )}

        {step === "section" && edu && stage && grade && (
          <motion.div key="section" variants={pageVariants} initial="initial" animate="in" exit="out" transition={{ duration: 0.25 }}>
            <StepWrapper title="اختر الشعبة" subtitle="حدّد الشعبة لعرض المواد المناسبة" onBack={goBack}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {sectionsFor(edu, grade).map((s) => (
                  <BigCard
                    key={s.key}
                    emoji={s.emoji}
                    title={s.label}
                    onClick={() => { setSection(s.key); setStep("subjects"); }}
                    gradient="from-emerald-500 to-cyan-600"
                  />
                ))}
              </div>
            </StepWrapper>
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
  );
};

/* ---------------- Sub-components ---------------- */

const StepWrapper = ({
  title, subtitle, onBack, children,
}: { title: string; subtitle?: string; onBack?: () => void; children: React.ReactNode }) => (
  <Card className="p-5 sm:p-6 border-emerald-100 shadow-sm">
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-lg sm:text-xl font-bold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -mt-1">
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
      )}
    </div>
    {children}
  </Card>
);

const BigCard = ({
  emoji, title, onClick, gradient,
}: { emoji: string; title: string; onClick: () => void; gradient: string }) => (
  <button
    onClick={onClick}
    className={cn(
      "group relative overflow-hidden rounded-2xl p-5 sm:p-6 text-right",
      "bg-gradient-to-br shadow-md hover:shadow-xl transition-all duration-300",
      "hover:-translate-y-1 active:scale-95",
      gradient
    )}
  >
    <div className="relative z-10 flex items-center justify-between">
      <div>
        <div className="text-4xl sm:text-5xl mb-2">{emoji}</div>
        <div className="text-white font-extrabold text-lg sm:text-xl drop-shadow-sm">{title}</div>
      </div>
      <ChevronRight className="h-6 w-6 text-white/80 group-hover:-translate-x-1 transition-transform" />
    </div>
    <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/10 blur-xl" />
  </button>
);

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

  // Flatten "hasSubjects" parents into their individual subject choices
  const items = useMemo(() => {
    const out: { key: string; label: string; emoji: string; category: string; subjectName?: string | null }[] = [];
    buttons.forEach((b) => {
      if (b.hasSubjects) {
        const choices = getBundleSubjectChoices(b.key, { stage, grade, section });
        choices.forEach((c) => {
          out.push({
            key: `${b.key}:${c.name}`,
            label: c.name,
            emoji: c.emoji,
            category: c.name === "الرياضيات" ? "math" : "science",
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

  return (
    <StepWrapper
      title="المواد المتاحة"
      subtitle="اختر مادة لعرض سعرها الحالي وتعديله"
      onBack={onBack}
    >
      {items.length === 0 ? (
        <p className="text-center py-10 text-muted-foreground">لا توجد مواد لهذا التصنيف</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onSelect({ label: it.label, category: it.category, subjectName: it.subjectName, emoji: it.emoji })}
              className="group relative overflow-hidden rounded-2xl p-4 text-right bg-gradient-to-br from-white to-emerald-50/60 border border-emerald-100 hover:border-emerald-400 hover:shadow-lg transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <div className="text-3xl mb-2">{it.emoji}</div>
              <div className="font-bold text-sm sm:text-base text-foreground">{it.label}</div>
              <div className="mt-2 text-[10px] text-emerald-700/70 flex items-center gap-1">
                اضغط للتسعير
                <ChevronRight className="h-3 w-3 rotate-180" />
              </div>
              <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-emerald-200/30 blur-lg" />
            </button>
          ))}
        </div>
      )}
    </StepWrapper>
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
      // Load existing default price
      const { data: pr } = await supabase
        .from("subject_default_prices" as any)
        .select("*")
        .eq("education_type", edu)
        .eq("stage", stage)
        .eq("grade", grade)
        .eq("category", target.category);
      const filtered = (pr || []).filter((r: any) => {
        const matchSection = (r.section || "") === (sectionKey || "");
        const matchName = (r.subject_name || "") === (target.subjectName || "");
        return matchSection && matchName;
      });
      const row = filtered[0] as any;
      if (row) {
        setExisting({ id: row.id, price: Number(row.price) });
        setPriceInput(String(row.price));
      } else {
        setExisting(null);
        setPriceInput("");
      }

      // Load matching subjects → count active paid subscribers + content_groups
      let sq = supabase
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
      const payload: any = {
        education_type: edu,
        stage,
        grade,
        section: sectionKey,
        category: target.category,
        subject_name: target.subjectName || null,
        price,
      };
      if (existing?.id) {
        const { error } = await supabase.from("subject_default_prices" as any).update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subject_default_prices" as any).insert(payload);
        if (error) throw error;
      }
      toast.success("تم حفظ السعر الجديد");

      // Apply to all existing groups
      setApplying(true);
      const { data: updatedCount, error: rpcErr } = await supabase.rpc("apply_default_price_to_existing_groups" as any, {
        p_education_type: edu,
        p_stage: stage,
        p_grade: grade,
        p_section: sectionKey,
        p_category: target.category,
        p_subject_name: target.subjectName || null,
        p_price: price,
      });
      if (rpcErr) {
        console.warn(rpcErr);
        toast.warning("تم حفظ السعر لكن لم يتم تحديث الكورسات القديمة");
      } else {
        toast.success(`تم تطبيق السعر على ${updatedCount || 0} كورس قائم`);
      }
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
    <Card className="p-0 overflow-hidden border-emerald-100">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 p-6 text-white">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-white hover:bg-white/20 mb-3 gap-1">
          <ArrowRight className="h-4 w-4" />
          رجوع للمواد
        </Button>
        <div className="flex items-center gap-4">
          <div className="text-5xl drop-shadow">{target.emoji || "📘"}</div>
          <div className="flex-1">
            <div className="text-xs opacity-80 mb-1">
              {edu} · {STAGES.find((s) => s.key === stage)?.label} · {gradesFor(stage).find((g) => g.key === grade)?.label}
              {section ? ` · ${section}` : ""}
            </div>
            <h3 className="text-2xl font-extrabold drop-shadow">{target.subjectName || target.label}</h3>
          </div>
        </div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {loading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatTile icon={<Wallet className="h-4 w-4" />} label="السعر الحالي" value={existing ? `${existing.price} ج` : "—"} accent="emerald" />
              <StatTile icon={<Users className="h-4 w-4" />} label="مشتركون فعّالون" value={String(activeSubs)} accent="blue" />
              <StatTile icon={<Layers className="h-4 w-4" />} label="مجموعات الكورسات" value={String(groupCount)} accent="amber" />
            </div>

            {/* Price editor */}
            <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/30 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <h4 className="font-bold">تغيير السعر الموحَّد</h4>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
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
                    className="h-12 text-lg font-bold text-center pr-14"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">جنيه</span>
                </div>
                <Button
                  onClick={saveAndApply}
                  disabled={saving || applying}
                  className="h-12 gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 px-6"
                >
                  {saving || applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  حفظ وتطبيق على الجميع
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              التغيير سيُطبَّق على كل المعلمين عند إنشاء أي مجموعة جديدة في هذه المادة لهذا الصف.
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

const StatTile = ({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent: "emerald" | "blue" | "amber" }) => {
  const colors = {
    emerald: "from-emerald-500/15 to-teal-500/10 text-emerald-700 border-emerald-200",
    blue: "from-blue-500/15 to-sky-500/10 text-blue-700 border-blue-200",
    amber: "from-amber-500/15 to-orange-500/10 text-amber-700 border-amber-200",
  }[accent];
  return (
    <div className={cn("rounded-xl border bg-gradient-to-br p-3 flex flex-col gap-1", colors)}>
      <div className="flex items-center gap-1 text-[10px] font-medium opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-base sm:text-lg font-extrabold">{value}</div>
    </div>
  );
};

export default CoursePricingManager;
