import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, Save, Eye, ListChecks, CheckCircle2, AlignLeft, FileText, ListOrdered, GitMerge, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import QuestionEditorCard, { type EditorQuestion, type EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import ExamSummaryCard from "@/components/exams/teacher/ExamSummaryCard";
import { useCreateExam, useReplaceExamQuestions, useUpdateExam } from "@/hooks/useExamMutations";
import { useExam, useExamQuestions } from "@/hooks/useExams";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "create", label: "إنشاء الامتحان" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

const TYPE_PALETTE: { type: EditorQType; label: string; icon: any; color: string }[] = [
  { type: "mcq", label: "اختيار من متعدد", icon: ListChecks, color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15" },
  { type: "true_false", label: "صح / خطأ", icon: CheckCircle2, color: "bg-violet-100 text-violet-600 dark:bg-violet-500/15" },
  { type: "short_answer", label: "إجابة قصيرة", icon: AlignLeft, color: "bg-sky-100 text-sky-600 dark:bg-sky-500/15" },
  { type: "essay", label: "مقال (إجابة مطولة)", icon: FileText, color: "bg-amber-100 text-amber-600 dark:bg-amber-500/15" },
  { type: "fill_blank", label: "ملء الفراغ", icon: MoreHorizontal, color: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15" },
];

function newQuestion(type: EditorQType, index: number): EditorQuestion {
  const base: EditorQuestion = { id: crypto.randomUUID(), index, type, text: "", marks: 5, options: [], modelAnswer: "" };
  if (type === "mcq") base.options = Array.from({ length: 4 }, (_, i) => ({ id: crypto.randomUUID(), text: "", isCorrect: i === 0 }));
  if (type === "true_false") base.options = [
    { id: crypto.randomUUID(), text: "صح", isCorrect: true },
    { id: crypto.randomUUID(), text: "خطأ", isCorrect: false },
  ];
  return base;
}

export default function ManualBuilderPage() {
  const navigate = useNavigate();
  const { examId: paramId } = useParams();
  const [examId, setExamId] = useState<string | undefined>(paramId);
  const [questions, setQuestions] = useState<EditorQuestion[]>([newQuestion("mcq", 1)]);
  const [saving, setSaving] = useState(false);

  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const replaceQuestions = useReplaceExamQuestions();
  const { data: exam } = useExam(examId);
  const { data: existingQs } = useExamQuestions(examId);

  useEffect(() => {
    if (existingQs && existingQs.length > 0 && questions.length === 1 && !questions[0].text) {
      setQuestions(existingQs.map((q: any, i: number) => ({
        id: q.id, index: i + 1, type: q.question_type, text: q.question_text, marks: Number(q.marks),
        modelAnswer: q.correct_answer || "",
        options: (q.options || []).map((o: any) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct })),
      })));
    }
  }, [existingQs]);

  const addQuestion = (type: EditorQType) => {
    setQuestions((qs) => [...qs, newQuestion(type, qs.length + 1)]);
  };

  const updateQ = (id: string, q: EditorQuestion) => {
    setQuestions((qs) => qs.map((x) => (x.id === id ? q : x)));
  };
  const deleteQ = (id: string) => {
    setQuestions((qs) => qs.filter((x) => x.id !== id).map((x, i) => ({ ...x, index: i + 1 })));
  };

  const totalMarks = questions.reduce((a, q) => a + (q.marks || 0), 0);
  const typeCounts = questions.reduce<Record<string, number>>((a, q) => ({ ...a, [q.type]: (a[q.type] || 0) + 1 }), {});

  const saveAndNext = async () => {
    if (questions.length === 0) { toast.error("أضف سؤالاً واحداً على الأقل"); return; }
    if (questions.some((q) => !q.text.trim())) { toast.error("هناك أسئلة بدون نص"); return; }
    setSaving(true);
    try {
      let id = examId;
      if (!id) {
        const ex = await createExam.mutateAsync({ title: "امتحان جديد", duration_minutes: 60, difficulty: "medium" });
        id = ex.id;
        setExamId(id);
      }
      await replaceQuestions.mutateAsync({ examId: id, questions });
      toast.success("تم حفظ الأسئلة");
      navigate(`/teacher/exams/${id}/settings`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/teacher/exams/new")} className="gap-2">
            <ArrowRight className="w-4 h-4" /> العودة
          </Button>
          <div className="flex-1 hidden md:block">
            <ExamWizardStepper steps={STEPS} currentStep="create" />
          </div>
          <Button variant="outline" size="sm" className="gap-2" disabled={saving} onClick={saveAndNext}>
            <Save className="w-4 h-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="md:hidden border-t"><ExamWizardStepper steps={STEPS} currentStep="create" /></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Main */}
          <div className="space-y-4">
            <div className="text-center md:text-start space-y-1">
              <h1 className="text-2xl font-bold flex items-center gap-2 justify-center md:justify-start">
                <FileText className="w-6 h-6 text-sky-600" /> إنشاء امتحان يدوي
              </h1>
              <p className="text-sm text-muted-foreground">قم بإضافة الأسئلة وتنظيمها كما تريد</p>
            </div>

            <Card className="p-4 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">إجمالي الأسئلة: <span className="font-bold text-foreground">{questions.length}</span></span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => addQuestion("mcq")}>
                  <Plus className="w-4 h-4" /> إضافة سؤال
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => examId && navigate(`/teacher/exams/${examId}/preview`)}>
                  <Eye className="w-4 h-4" /> معاينة الامتحان
                </Button>
              </div>
            </Card>

            <div className="space-y-3">
              {questions.map((q) => (
                <QuestionEditorCard
                  key={q.id}
                  question={q}
                  total={questions.length}
                  onChange={(nq) => updateQ(q.id, nq)}
                  onDelete={() => deleteQ(q.id)}
                  onDuplicate={() => setQuestions((qs) => [...qs, { ...q, id: crypto.randomUUID(), index: qs.length + 1 }])}
                />
              ))}

              <Button variant="outline" className="w-full h-14 border-dashed gap-2 text-muted-foreground hover:text-primary" onClick={() => addQuestion("mcq")}>
                <Plus className="w-4 h-4" /> إضافة قسم جديد
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="lg" onClick={saveAndNext} disabled={saving} className="gap-2">
                التالي: إعدادات الامتحان <ArrowRight className="w-4 h-4 rotate-180" />
              </Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-bold mb-1">أنواع الأسئلة</h3>
              <p className="text-xs text-muted-foreground mb-3">اختر نوع السؤال لإضافته</p>
              <div className="space-y-2">
                {TYPE_PALETTE.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => addQuestion(t.type)}
                    className="w-full flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/60 transition-colors text-start"
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", t.color)}>
                        <t.icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium">{t.label}</span>
                    </div>
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-bold">ملخص الامتحان</h3>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">إجمالي الأسئلة</span><span className="font-bold">{questions.length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">إجمالي الدرجات</span><span className="font-bold">{totalMarks} درجة</span></div>
              <div className="pt-2 border-t space-y-1.5 text-xs">
                {TYPE_PALETTE.filter((t) => typeCounts[t.type]).map((t) => (
                  <div key={t.type} className="flex justify-between">
                    <span className="flex items-center gap-1.5"><t.icon className="w-3.5 h-3.5" /> {t.label}</span>
                    <span className="font-bold">{typeCounts[t.type]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Button size="lg" onClick={saveAndNext} disabled={saving} className="w-full gap-2 bg-violet-600 hover:bg-violet-700">
              التالي: إعدادات الامتحان
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
