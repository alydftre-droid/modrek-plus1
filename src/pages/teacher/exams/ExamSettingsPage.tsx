import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Eye, Save, Settings, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import ExamSummaryCard from "@/components/exams/teacher/ExamSummaryCard";
import AntiCheatPanel, { type AntiCheatState } from "@/components/exams/teacher/AntiCheatPanel";
import { useExam, useExamQuestions } from "@/hooks/useExams";
import { useUpdateExam } from "@/hooks/useExamMutations";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

const formatLocal = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : "");

export default function ExamSettingsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [] } = useExamQuestions(examId);
  const updateExam = useUpdateExam();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [duration, setDuration] = useState(90);
  const [resultMode, setResultMode] = useState<"immediate" | "afterEnd" | "hidden">("immediate");
  const [antiCheat, setAntiCheat] = useState<AntiCheatState>({
    maxExits: 2,
    preventCopy: true,
    preventTabSwitch: true,
    requireFullscreen: true,
    preventReload: true,
    randomSnapshots: true,
  });
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [allowBack, setAllowBack] = useState(true);

  useEffect(() => {
    if (!exam) return;
    setTitle(exam.title || "");
    setDescription(exam.description || "");
    setInstructions(exam.instructions || "");
    setStartAt(formatLocal(exam.start_at));
    setEndAt(formatLocal(exam.end_at));
    setDuration(exam.duration_minutes || 90);
    setResultMode(exam.show_results_immediately ? "immediate" : exam.show_correct_answers ? "afterEnd" : "hidden");
    setShuffleQuestions(exam.shuffle_questions);
    setShuffleOptions(exam.shuffle_options);
    setAntiCheat({
      maxExits: 2,
      preventCopy: exam.prevent_copy_paste,
      preventTabSwitch: exam.prevent_tab_switch,
      requireFullscreen: exam.require_fullscreen,
      preventReload: true,
      randomSnapshots: true,
    });
  }, [exam]);

  const totalMarks = questions.reduce((sum, q: any) => sum + Number(q.marks || 0), 0);
  const typesSummary = Array.from(new Set(questions.map((q: any) => q.question_type))).join(" - ");

  const save = async (goNext?: boolean) => {
    if (!examId) return;
    if (!title.trim()) {
      toast.error("اكتب عنوان الامتحان أولاً");
      return;
    }

    try {
      await updateExam.mutateAsync({
        id: examId,
        patch: {
          title,
          description,
          instructions,
          start_at: startAt ? new Date(startAt).toISOString() : null,
          end_at: endAt ? new Date(endAt).toISOString() : null,
          duration_minutes: duration,
          show_results_immediately: resultMode === "immediate",
          show_correct_answers: resultMode !== "hidden",
          shuffle_questions: shuffleQuestions,
          shuffle_options: shuffleOptions,
          require_fullscreen: antiCheat.requireFullscreen,
          prevent_tab_switch: antiCheat.preventTabSwitch,
          prevent_copy_paste: antiCheat.preventCopy,
        },
      });
      toast.success("تم حفظ إعدادات الامتحان");
      if (goNext) navigate(`/teacher/exams/${examId}/preview`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ الإعدادات");
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcff]">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <Button variant="outline" onClick={() => navigate(`/teacher/exams/${examId}/review`)} className="h-12 rounded-2xl border-slate-200 px-5 text-base">
            <ArrowRight className="ml-2 h-4 w-4" /> عودة
          </Button>
          <div className="hidden flex-1 md:block">
            <ExamWizardStepper steps={STEPS} currentStep="settings" />
          </div>
          <Button variant="outline" onClick={() => save(false)} className="h-12 rounded-2xl border-slate-200 px-5 text-base text-violet-700">
            <Save className="ml-2 h-4 w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="border-t border-slate-100 md:hidden">
          <ExamWizardStepper steps={STEPS} currentStep="settings" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 text-center">
          <h1 className="mb-2 flex items-center justify-center gap-2 text-3xl font-bold text-slate-900 md:text-5xl">
            إعدادات الامتحان <Settings className="h-8 w-8 text-violet-500" />
          </h1>
          <p className="text-base text-slate-500">حدد معلومات الامتحان وإعداداته وطريقة ظهوره للطلاب</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-violet-600" />
                <h3 className="text-2xl font-bold text-slate-900">معلومات الامتحان</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">وصف الامتحان (يظهر للطلاب)</label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={300} className="rounded-2xl border-slate-200" />
                  <p className="mt-2 text-xs text-slate-400">{description.length}/300</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">عنوان الامتحان *</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 rounded-2xl border-slate-200" />
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">تاريخ بداية الامتحان *</label>
                      <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-12 rounded-2xl border-slate-200" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">تاريخ نهاية الامتحان *</label>
                      <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="h-12 rounded-2xl border-slate-200" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">المدة الكلية *</label>
                      <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} className="h-12 rounded-2xl border-slate-200" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <h3 className="mb-3 text-2xl font-bold text-slate-900">تعليمات للطلاب (اختياري)</h3>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} className="rounded-2xl border-slate-200" />
              <p className="mt-2 text-xs text-slate-400">{instructions.length}/500</p>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
                <h3 className="mb-4 text-2xl font-bold text-slate-900">النتيجة وإظهار الدرجات</h3>
                <div className="space-y-4 text-sm">
                  <label className="flex items-center gap-3"><input type="radio" checked={resultMode === "immediate"} onChange={() => setResultMode("immediate")} /> إظهار النتيجة فوراً بعد تسليم الامتحان</label>
                  <label className="flex items-center gap-3"><input type="radio" checked={resultMode === "afterEnd"} onChange={() => setResultMode("afterEnd")} /> إظهار النتيجة بعد انتهاء الوقت المحدد للامتحان</label>
                  <label className="flex items-center gap-3"><input type="radio" checked={resultMode === "hidden"} onChange={() => setResultMode("hidden")} /> لا تظهر النتيجة للطالب</label>
                </div>
              </Card>

              <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
                <h3 className="mb-4 text-2xl font-bold text-slate-900">إعدادات أخرى</h3>
                <div className="space-y-4 text-sm">
                  <label className="flex items-center justify-between gap-3"><span>خلط ترتيب الأسئلة</span><input type="checkbox" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} /></label>
                  <label className="flex items-center justify-between gap-3"><span>خلط ترتيب الاختيارات داخل السؤال</span><input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} /></label>
                  <label className="flex items-center justify-between gap-3"><span>السماح للطلاب بالرجوع للأسئلة السابقة</span><input type="checkbox" checked={allowBack} onChange={(e) => setAllowBack(e.target.checked)} /></label>
                  <label className="flex items-center justify-between gap-3"><span>تفعيل وضع ملء الشاشة أثناء الامتحان</span><input type="checkbox" checked={antiCheat.requireFullscreen} onChange={(e) => setAntiCheat((current) => ({ ...current, requireFullscreen: e.target.checked }))} /></label>
                </div>
              </Card>
            </div>
          </div>

          <div className="space-y-4">
            <ExamSummaryCard title={title} questionsCount={questions.length} totalMarks={totalMarks} durationMinutes={duration} difficulty="متوسط" typesSummary={typesSummary} />
            <Button variant="outline" onClick={() => navigate(`/teacher/exams/${examId}/preview`)} className="h-12 w-full rounded-2xl border-violet-200 text-violet-700">
              <Eye className="ml-2 h-4 w-4" /> معاينة الأسئلة
            </Button>
            <AntiCheatPanel value={antiCheat} onChange={setAntiCheat} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate(`/teacher/exams/${examId}/review`)} className="h-12 rounded-2xl border-slate-200 px-6">السابق</Button>
          <Button onClick={() => save(true)} className="h-12 rounded-2xl bg-violet-600 px-6 text-base hover:bg-violet-700">التالي: معاينة ونشر</Button>
        </div>
      </div>
    </div>
  );
}
