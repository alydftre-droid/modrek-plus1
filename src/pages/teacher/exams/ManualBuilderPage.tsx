import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  FileText,
  Plus,
  Save,
  Settings,
  Star,
  ListChecks,
  CheckCircle2,
  FileEdit,
  MoreHorizontal,
  ListOrdered,
} from "lucide-react";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import QuestionEditorCard, { type EditorQuestion, type EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { useCreateExam, useReplaceExamQuestions } from "@/hooks/useExamMutations";
import { useExamQuestions } from "@/hooks/useExams";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

const QUICK_TYPES: { type: EditorQType; label: string; icon: any; iconBg: string; iconColor: string }[] = [
  { type: "mcq", label: "اختيار من متعدد", icon: ListChecks, iconBg: "bg-slate-50", iconColor: "text-slate-700" },
  { type: "true_false", label: "صح / خطأ", icon: CheckCircle2, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  { type: "essay", label: "مقالي", icon: FileEdit, iconBg: "bg-rose-50", iconColor: "text-rose-500" },
  { type: "fill_blank", label: "ملء فراغ", icon: MoreHorizontal, iconBg: "bg-orange-50", iconColor: "text-orange-500" },
];

function createQuestion(type: EditorQType, index: number): EditorQuestion {
  const base: EditorQuestion = {
    id: crypto.randomUUID(),
    index,
    type,
    text: "",
    marks: type === "essay" ? 10 : type === "mcq" ? 5 : type === "fill_blank" ? 3 : 2,
    options: [],
    modelAnswer: "",
  };
  if (type === "mcq") {
    base.options = Array.from({ length: 4 }, (_, i) => ({
      id: crypto.randomUUID(),
      text: `الخيار ${i + 1}`,
      isCorrect: i === 0,
    }));
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

function createSection(index: number): EditorQuestion {
  return {
    id: crypto.randomUUID(),
    index,
    type: "section",
    text: "",
    marks: 0,
    options: [],
    sectionTotal: 5,
  };
}

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
  let questionNumber = 0;
  return list.map((q) => {
    if (q.type === "section") {
      sectionIdx += 1;
      return {
        ...q,
        sectionTitle: SECTION_TITLES[sectionIdx] || `السؤال ${sectionIdx + 1}`,
        sectionAllocated: allocations[sectionIdx] || 0,
      };
    }
    questionNumber += 1;
    return { ...q, index: questionNumber };
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
    setQuestions((current) => [...current, createSection(current.length + 1)]);
    toast.success("تم إضافة قسم جديد");
  };

  const decorated = useMemo(() => decorateSections(questions), [questions]);

  const nonSection = questions.filter((q) => q.type !== "section");
  const totalMarks = nonSection.reduce((sum, q) => sum + Number(q.marks || 0), 0);

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
    <div className="min-h-screen bg-[#fafbff] pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(createHomePath)}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="رجوع"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-extrabold text-slate-900 md:text-2xl">إنشاء امتحان يدوي</h1>
          <button
            type="button"
            onClick={() => draftId && navigate(`/teacher/exams/${draftId}/settings`)}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100"
            aria-label="إعدادات"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
        <div className="border-t border-slate-100">
          <div className="mx-auto max-w-3xl px-3 py-3">
            <ExamWizardStepper steps={STEPS} currentStep="create" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-4">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-500">
              <Star className="h-5 w-5" />
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-500">إجمالي الدرجات</div>
              <div className="text-xl font-extrabold text-slate-900">{totalMarks}</div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-500">
              <FileText className="h-5 w-5" />
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-500">عدد الأسئلة</div>
              <div className="text-xl font-extrabold text-slate-900">{nonSection.length}</div>
            </div>
          </div>
        </div>

        {/* Quick-add type grid */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => appendQuestion(t.type)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:border-violet-200 hover:bg-violet-50/30"
            >
              <div className={`grid h-12 w-12 place-items-center rounded-2xl ${t.iconBg} ${t.iconColor}`}>
                <t.icon className="h-6 w-6" />
              </div>
              <div className="text-sm font-bold text-slate-800">{t.label}</div>
              <Plus className="h-5 w-5 text-violet-500" />
            </button>
          ))}
        </div>

        {/* Organize sections small action */}
        <div className="mt-3 flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-violet-600 hover:bg-violet-50">
                <ListOrdered className="h-4 w-4" /> تنظيم الأسئلة (إضافة قسم)
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              <DropdownMenuLabel>اختر القسم لإضافته</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SECTION_TITLES.map((title) => (
                <DropdownMenuItem key={title} onSelect={() => appendSection()}>
                  {title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Questions stack */}
        <div className="mt-4 space-y-3">
          {decorated.map((question) => (
            <QuestionEditorCard
              key={question.id}
              question={question}
              total={nonSection.length}
              onChange={(next) => setQuestions((current) => current.map((item) => (item.id === question.id ? next : item)))}
              onDelete={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}
              onDuplicate={() => setQuestions((current) => [...current, { ...question, id: crypto.randomUUID(), index: current.length + 1 }])}
            />
          ))}
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3">
          <Button
            variant="outline"
            onClick={() => saveDraft(false)}
            disabled={saving}
            className="h-12 flex-1 rounded-2xl border-violet-200 bg-white text-sm font-bold text-violet-600 hover:bg-violet-50"
          >
            <Save className="ml-1.5 h-4 w-4" /> حفظ كمسودة
          </Button>
          <Button
            variant="outline"
            onClick={() => draftId && navigate(`/teacher/exams/${draftId}/preview`)}
            className="h-12 flex-1 rounded-2xl border-violet-200 bg-white text-sm font-bold text-violet-600 hover:bg-violet-50"
          >
            <Eye className="ml-1.5 h-4 w-4" /> معاينة الامتحان
          </Button>
          <Button
            onClick={() => saveDraft(true)}
            disabled={saving}
            className="h-12 flex-[1.4] rounded-2xl bg-violet-600 text-sm font-bold text-white hover:bg-violet-700 shadow-[0_8px_20px_rgba(124,58,237,0.25)]"
          >
            التالي: إعدادات الامتحان <ArrowLeft className="mr-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
