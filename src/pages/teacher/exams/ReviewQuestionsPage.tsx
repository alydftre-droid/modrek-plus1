import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Save, Plus, RefreshCw, FileSearch, Sparkles, ListChecks, CheckCircle2, GitMerge, AlignLeft, Grid3x3, List as ListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const TYPE_LABEL: Record<EditorQType, { ar: string; color: string }> = {
  mcq: { ar: "اختيار من متعدد", color: "bg-violet-100 text-violet-700" },
  true_false: { ar: "صح / خطأ", color: "bg-emerald-100 text-emerald-700" },
  short_answer: { ar: "إجابة قصيرة", color: "bg-sky-100 text-sky-700" },
  essay: { ar: "مقالية قصيرة", color: "bg-rose-100 text-rose-700" },
  fill_blank: { ar: "ملء الفراغ", color: "bg-fuchsia-100 text-fuchsia-700" },
};

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
  const stats = [
    { type: "mcq" as EditorQType, label: "الاختيار من متعدد", icon: ListChecks, color: "from-violet-500/10 to-violet-500/5 text-violet-700" },
    { type: "true_false" as EditorQType, label: "صح / خطأ", icon: CheckCircle2, color: "from-emerald-500/10 to-emerald-500/5 text-emerald-700" },
    { type: "short_answer" as EditorQType, label: "المطابقة", icon: GitMerge, color: "from-sky-500/10 to-sky-500/5 text-sky-700" },
    { type: "essay" as EditorQType, label: "مقالية قصيرة", icon: AlignLeft, color: "from-rose-500/10 to-rose-500/5 text-rose-700" },
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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-2">
            <ArrowRight className="w-4 h-4" /> عودة
          </Button>
          <div className="flex-1 hidden md:block">
            <ExamWizardStepper steps={STEPS} currentStep="review" />
          </div>
          <Button variant="outline" size="sm" className="gap-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-200" onClick={save} disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? "جاري الحفظ..." : "عودة الآن"}
          </Button>
        </div>
        <div className="md:hidden border-t"><ExamWizardStepper steps={STEPS} currentStep="review" /></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="text-center space-y-1 mb-5">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center justify-center gap-2">
            <FileSearch className="w-7 h-7 text-violet-600" /> مراجعة الأسئلة
          </h1>
          <p className="text-sm text-muted-foreground">راجع الأسئلة المستخرجة وعدّلها وأضف الإجابات الصحيحة</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Main */}
          <div className="space-y-4">
            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="p-3 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 border-violet-100/60 dark:border-violet-900/40">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <span className="text-xs text-muted-foreground">جودة الاستخراج</span>
                </div>
                <p className="text-base font-bold text-violet-700 mt-1">جيدة جداً</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">عدد الأسئلة</p>
                <p className="text-xl font-bold">{questions.length}</p>
              </Card>
              {stats.map((s) => (
                <Card key={s.type} className={cn("p-3 bg-gradient-to-br", s.color)}>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xl font-bold">{counts[s.type] || 0}</p>
                    <s.icon className="w-4 h-4 opacity-60" />
                  </div>
                </Card>
              ))}
            </div>

            <Card className="p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={showAnswers} onCheckedChange={setShowAnswers} />
                <span className="text-sm">عرض الإجابات</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1"><RefreshCw className="w-4 h-4" /> إعادة استخراج</Button>
                <Button size="sm" className="gap-1 bg-violet-600 hover:bg-violet-700" onClick={() => {
                  setQuestions((qs) => [...qs, { id: crypto.randomUUID(), index: qs.length + 1, type: "mcq", text: "", marks: 5, options: Array.from({length: 4}, () => ({ id: crypto.randomUUID(), text: "", isCorrect: false })), modelAnswer: "" }]);
                }}><Plus className="w-4 h-4" /> إضافة سؤال</Button>
              </div>
            </Card>

            <div className="space-y-3">
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
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">قائمة الأسئلة</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Grid3x3 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><ListIcon className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {questions.map((q) => (
                  <div key={q.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-bold w-6">{q.index}</span>
                    <Badge variant="secondary" className={cn("text-[10px] font-medium border-0", TYPE_LABEL[q.type].color)}>
                      {TYPE_LABEL[q.type].ar}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>تقدم المراجعة</span>
                <span className="font-bold">100%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-violet-600 rounded-full" style={{ width: "100%" }} />
              </div>
              <p className="text-xs text-muted-foreground">{questions.length} / {questions.length} سؤال</p>
            </Card>

            <Button size="lg" className="w-full gap-2 bg-violet-600 hover:bg-violet-700" onClick={save} disabled={saving}>
              متابعة إلى إعدادات الامتحان
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
