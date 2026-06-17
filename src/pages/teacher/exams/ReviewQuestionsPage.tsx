import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Save, Plus, RefreshCw, FileSearch, Sparkles, ListChecks, CheckCircle2, GitMerge, AlignLeft, HelpCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import QuestionEditorCard, { type EditorQuestion, type EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { useExam, useExamQuestions } from "@/hooks/useExams";
import { useReplaceExamQuestions } from "@/hooks/useExamMutations";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

export default function ReviewQuestionsPage() {
  const navigate = useNavigate();
  const { examId } = useParams<{ examId: string }>();
  const { data: exam } = useExam(examId);
  const { data: dbQs } = useExamQuestions(examId);
  const [questions, setQuestions] = useState<EditorQuestion[]>([]);
  const [showAnswers, setShowAnswers] = useState(true);
  const [saving, setSaving] = useState(false);
  const replace = useReplaceExamQuestions();

  useEffect(() => {
    if (dbQs) {
      setQuestions(dbQs.map((q: any, i) => ({
        id: q.id, index: i + 1, type: q.question_type as EditorQType,
        text: q.question_text, marks: Number(q.marks), modelAnswer: q.correct_answer || "",
        options: (q.options || []).map((o: any) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct })),
      })));
    }
  }, [dbQs]);

  const counts = questions.reduce<Record<string, number>>((a, q) => ({ ...a, [q.type]: (a[q.type] || 0) + 1 }), {});

  const stats: Array<{ label: string; value: string | number; icon: any; bg: string; fg: string }> = [
    { label: "جودة الاستخراج", value: "جيدة جداً", icon: Sparkles, bg: "bg-violet-100", fg: "text-violet-600" },
    { label: "عدد الأسئلة", value: questions.length, icon: HelpCircle, bg: "bg-amber-100", fg: "text-amber-600" },
    { label: "اختيار من متعدد", value: counts["mcq"] || 0, icon: ListChecks, bg: "bg-emerald-100", fg: "text-emerald-600" },
    { label: "صح / خطأ", value: counts["true_false"] || 0, icon: CheckCircle2, bg: "bg-orange-100", fg: "text-orange-600" },
    { label: "المطابقة", value: counts["short_answer"] || 0, icon: GitMerge, bg: "bg-sky-100", fg: "text-sky-600" },
    { label: "مقالية قصيرة", value: counts["essay"] || counts["fill_blank"] || 0, icon: AlignLeft, bg: "bg-rose-100", fg: "text-rose-600" },
  ];

  const save = async () => {
    if (!examId) return;
    setSaving(true);
    try {
      await replace.mutateAsync({ examId, questions });
      toast.success("تم حفظ التعديلات");
      navigate(`/teacher/exams/${examId}/settings`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحفظ");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-background" dir="rtl">
      {/* Top bar with stepper */}
      <div className="border-b bg-card/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 md:px-6 py-2.5 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5 h-8 text-xs rounded-lg border-slate-200">
            <ArrowRight className="w-3.5 h-3.5" /> عودة
          </Button>
          <div className="flex-1 min-w-0">
            <ExamWizardStepper steps={STEPS} currentStep="review" />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs rounded-lg border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-700" onClick={save} disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? "جاري..." : "حفظ الآن"}
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 md:px-6 py-5 md:py-8 space-y-5 md:space-y-6">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center justify-center gap-2 text-slate-900 dark:text-foreground">
            <FileSearch className="w-6 h-6 md:w-7 md:h-7 text-violet-600" />
            مراجعة الأسئلة
          </h1>
          <p className="text-xs md:text-sm text-slate-500">راجع الأسئلة المستخرجة وعدّلها وأضف الإجابات الصحيحة</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
          {stats.map((s) => (
            <Card key={s.label} className="p-3 md:p-3.5 rounded-2xl border-slate-200/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] md:text-xs text-slate-500 truncate">{s.label}</p>
                  <p className={cn("text-lg md:text-xl font-extrabold mt-1 truncate", s.fg)}>{s.value}</p>
                </div>
                <div className={cn("w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shrink-0", s.bg)}>
                  <s.icon className={cn("w-4 h-4 md:w-4.5 md:h-4.5", s.fg)} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Toolbar */}
        <Card className="p-2.5 md:p-3 rounded-2xl border-slate-200/70 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={showAnswers} onCheckedChange={setShowAnswers} className="data-[state=checked]:bg-violet-600" />
            <span className="text-xs md:text-sm font-medium text-slate-700 dark:text-foreground">عرض الإجابات</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-lg border-slate-200">
              <RefreshCw className="w-3.5 h-3.5" /> إعادة استخراج
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white" onClick={() => {
              setQuestions((qs) => [...qs, { id: crypto.randomUUID(), index: qs.length + 1, type: "mcq", text: "", marks: 5, options: Array.from({length: 4}, () => ({ id: crypto.randomUUID(), text: "", isCorrect: false })), modelAnswer: "" }]);
            }}>
              <Plus className="w-3.5 h-3.5" /> إضافة سؤال
            </Button>
          </div>
        </Card>

        {/* Questions full width */}
        <div className="space-y-3 md:space-y-4">
          {questions.map((q) => (
            <QuestionEditorCard
              key={q.id}
              question={q}
              total={questions.length}
              onChange={(nq) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? nq : x)))}
              onDelete={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id).map((x, i) => ({ ...x, index: i + 1 })))}
            />
          ))}
        </div>

        {/* Continue */}
        <div className="pt-2">
          <Button
            size="lg"
            className="w-full md:w-auto md:min-w-[280px] md:mx-auto md:flex gap-2 h-12 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-md shadow-violet-600/20"
            onClick={save}
            disabled={saving}
          >
            متابعة إلى إعدادات الامتحان
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
