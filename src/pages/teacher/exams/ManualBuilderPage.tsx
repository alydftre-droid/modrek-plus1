import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Eye, FileText, Plus, Save, ListChecks, CheckCircle2, AlignLeft, MoreHorizontal, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import QuestionEditorCard, { type EditorQuestion, type EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import ExamSummaryCard from "@/components/exams/teacher/ExamSummaryCard";
import { useCreateExam, useReplaceExamQuestions } from "@/hooks/useExamMutations";
import { useExamQuestions } from "@/hooks/useExams";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "create", label: "إنشاء الامتحان" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

const SECTION_TITLES = [
  "السؤال الأول",
  "السؤال الثاني",
  "السؤال الثالث",
  "السؤال الرابع",
  "السؤال الخامس",
  "السؤال السادس",
  "السؤال السابع",
  "السؤال الثامن",
  "السؤال التاسع",
  "السؤال العاشر",
];

const TYPE_ITEMS: { type: EditorQType; label: string; icon: any; color: string }[] = [
  { type: "mcq", label: "اختيار من متعدد", icon: ListChecks, color: "bg-violet-100 text-violet-700" },
  { type: "true_false", label: "صح / خطأ", icon: CheckCircle2, color: "bg-sky-100 text-sky-700" },
  { type: "short_answer", label: "إجابة قصيرة", icon: AlignLeft, color: "bg-blue-100 text-blue-700" },
  { type: "essay", label: "مقال (إجابة مطولة)", icon: FileText, color: "bg-amber-100 text-amber-700" },
  { type: "fill_blank", label: "ملء الفراغ", icon: MoreHorizontal, color: "bg-pink-100 text-pink-700" },
];

function createQuestion(type: EditorQType, index: number): EditorQuestion {
  const base: EditorQuestion = {
    id: crypto.randomUUID(),
    index,
    type,
    text: "",
    marks: 5,
    options: [],
    modelAnswer: "",
  };

  if (type === "mcq") {
    base.options = Array.from({ length: 4 }, (_, i) => ({ id: crypto.randomUUID(), text: `الخيار ${i + 1}`, isCorrect: i === 0 }));
  }

  if (type === "true_false") {
    base.options = [
      { id: crypto.randomUUID(), text: "صح", isCorrect: true },
      { id: crypto.randomUUID(), text: "خطأ", isCorrect: false },
    ];
  }

  if (type === "section") {
    base.marks = 0;
    base.sectionTotal = 5;
  }

  return base;
}

function createSection(index: number, defaultTotal = 5): EditorQuestion {
  return {
    id: crypto.randomUUID(),
    index,
    type: "section",
    text: "",
    marks: 0,
    options: [],
    sectionTotal: defaultTotal,
  };
}

/** Compute section titles (1st section -> السؤال الأول) and marks allocated per section. */
function decorateSections(list: EditorQuestion[]): EditorQuestion[] {
  let sectionIdx = -1;
  const allocations: number[] = [];
  list.forEach((q) => {
    if (q.type === "section") {
      sectionIdx += 1;
      allocations[sectionIdx] = 0;
    } else if (sectionIdx >= 0) {
      allocations[sectionIdx] = (allocations[sectionIdx] || 0) + Number(q.marks || 0);
    }
  });
  sectionIdx = -1;
  return list.map((q) => {
    if (q.type === "section") {
      sectionIdx += 1;
      return {
        ...q,
        sectionTitle: SECTION_TITLES[sectionIdx] || `السؤال ${sectionIdx + 1}`,
        sectionAllocated: allocations[sectionIdx] || 0,
      };
    }
    return q;
  });
}

export default function ManualBuilderPage() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const [params] = useSearchParams();
  const [draftId, setDraftId] = useState<string | undefined>(examId);
  const [questions, setQuestions] = useState<EditorQuestion[]>([createQuestion("mcq", 1)]);
  const [saving, setSaving] = useState(false);
  const createExam = useCreateExam();
  const replaceQuestions = useReplaceExamQuestions();
  const { data: existingQuestions } = useExamQuestions(draftId);
  const creationQuery = params.toString();
  const createHomePath = `/teacher/exams${creationQuery ? `?${creationQuery}` : ""}`;

  useEffect(() => {
    if (!existingQuestions?.length) return;
    setQuestions(
      existingQuestions.map((q: any, i: number) => {
        if (q.question_type === "section") {
          let total = 0;
          try {
            const parsed = q.correct_answer ? JSON.parse(q.correct_answer) : null;
            if (parsed && typeof parsed.total === "number") total = parsed.total;
          } catch {}
          return {
            id: q.id,
            index: i + 1,
            type: "section" as EditorQType,
            text: q.question_text || "",
            marks: 0,
            sectionTotal: total,
            options: [],
          };
        }
        return {
          id: q.id,
          index: i + 1,
          type: q.question_type as EditorQType,
          text: q.question_text,
          marks: Number(q.marks || 0),
          modelAnswer: q.correct_answer || "",
          options: (q.options || []).map((o: any) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct })),
        };
      })
    );
  }, [existingQuestions]);

  const appendQuestion = (type: EditorQType) => {
    setQuestions((current) => [...current, createQuestion(type, current.length + 1)]);
  };

  const appendSection = () => {
    const sectionCount = questions.filter((q) => q.type === "section").length;
    setQuestions((current) => [...current, createSection(current.length + 1)]);
    toast.success(`تم إضافة ${SECTION_TITLES[sectionCount] || "قسم جديد"}`);
  };

  const decorated = useMemo(() => decorateSections(questions), [questions]);

  const nonSection = questions.filter((q) => q.type !== "section");
  const sectionsCount = questions.length - nonSection.length;
  const totalMarks = nonSection.reduce((sum, q) => sum + Number(q.marks || 0), 0);
  const typeSummary = TYPE_ITEMS.filter((item) => questions.some((q) => q.type === item.type)).map((item) => item.label).join(" - ");

  // validate sections allocations
  const sectionErrors = decorated
    .filter((q) => q.type === "section")
    .filter((q) => Number(q.sectionAllocated || 0) !== Number(q.sectionTotal || 0));

  const saveDraft = async (goNext?: boolean) => {
    if (questions.some((q) => q.type !== "section" && !q.text.trim())) {
      toast.error("يجب كتابة نص كل الأسئلة أولاً");
      return;
    }

    setSaving(true);
    try {
      let activeId = draftId;
      if (!activeId) {
        const exam = await createExam.mutateAsync({
          title: "امتحان يدوي جديد",
          duration_minutes: 90,
          difficulty: "medium",
          subject_id: params.get("subject_id") || undefined,
          group_id: params.get("group_id") || undefined,
          term: params.get("term") || undefined,
        });
        activeId = exam.id;
        setDraftId(exam.id);
      }

      if (sectionErrors.length) {
        toast.error("مجموع درجات الأسئلة الفرعية لا يساوي الدرجة الكلية للقسم");
        setSaving(false);
        return;
      }

      await replaceQuestions.mutateAsync({ examId: activeId, questions });
      toast.success("تم حفظ مسودة الامتحان");
      if (goNext && activeId) navigate(`/teacher/exams/${activeId}/settings`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ الامتحان");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcff]">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <Button variant="outline" onClick={() => navigate(createHomePath)} className="h-12 rounded-2xl border-slate-200 px-5 text-base">
            <ArrowRight className="ml-2 h-4 w-4" /> العودة
          </Button>
          <div className="hidden flex-1 md:block">
            <ExamWizardStepper steps={STEPS} currentStep="create" />
          </div>
          <Button variant="outline" onClick={() => saveDraft(false)} className="h-12 rounded-2xl border-slate-200 px-5 text-base text-violet-700">
            <Save className="ml-2 h-4 w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="border-t border-slate-100 md:hidden">
          <ExamWizardStepper steps={STEPS} currentStep="create" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 text-center">
          <h1 className="mb-2 flex items-center justify-center gap-2 text-3xl font-bold text-slate-900 md:text-5xl">
            إنشاء امتحان يدوي <FileText className="h-8 w-8 text-sky-500" />
          </h1>
          <p className="text-base text-slate-500">قم بإضافة الأسئلة وتنظيمها كما تريد</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card className="rounded-[24px] border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-semibold text-slate-600">إجمالي الأسئلة: <span className="text-slate-900">{questions.length}</span></div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => draftId && navigate(`/teacher/exams/${draftId}/preview`)} className="h-12 rounded-2xl border-violet-200 px-5 text-base text-violet-700">
                    <Eye className="ml-2 h-4 w-4" /> معاينة الامتحان
                  </Button>
                  <Button onClick={() => appendQuestion("mcq")} className="h-12 rounded-2xl bg-white px-5 text-base text-violet-700 shadow-none border border-violet-200 hover:bg-violet-50">
                    <Plus className="ml-2 h-4 w-4" /> إضافة سؤال
                  </Button>
                </div>
              </div>
            </Card>

            {decorated.map((question) => (
              <QuestionEditorCard
                key={question.id}
                question={question}
                total={nonSection.length}
                onChange={(next) => setQuestions((current) => current.map((item) => (item.id === question.id ? next : item)))}
                onDelete={() => setQuestions((current) => current.filter((item) => item.id !== question.id).map((item, index) => ({ ...item, index: index + 1 })))}
                onDuplicate={() => setQuestions((current) => [...current, { ...question, id: crypto.randomUUID(), index: current.length + 1 }])}
              />
            ))}

            <button
              type="button"
              onClick={() => appendQuestion("mcq")}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-violet-300 bg-white text-base font-semibold text-violet-600"
            >
              <Plus className="h-5 w-5" /> إضافة قسم جديد
            </button>

            <div className="flex justify-start xl:hidden">
              <Button onClick={() => saveDraft(true)} disabled={saving} className="h-14 rounded-2xl bg-violet-600 px-7 text-base hover:bg-violet-700">
                التالي: إعدادات الامتحان <ArrowRight className="mr-2 h-4 w-4 rotate-180" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <h3 className="mb-1 text-2xl font-bold text-slate-900">أنواع الأسئلة</h3>
              <p className="mb-4 text-sm text-slate-500">اختر نوع السؤال لإضافته</p>
              <div className="space-y-2">
                {TYPE_ITEMS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => appendQuestion(item.type)}
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-right hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", item.color)}>
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span className="font-semibold text-slate-800">{item.label}</span>
                    </div>
                    <Plus className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
              </div>
            </Card>

            <ExamSummaryCard
              questionsCount={questions.length}
              totalMarks={totalMarks}
              durationMinutes={90}
              typesSummary={typeSummary}
            />

            <Button onClick={() => saveDraft(true)} disabled={saving} className="hidden h-14 w-full rounded-2xl bg-violet-600 text-base hover:bg-violet-700 xl:flex">
              التالي: إعدادات الامتحان
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
