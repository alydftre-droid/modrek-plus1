import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Bookmark, Clock3, Eye, HelpCircle, Save, Send, ShieldCheck, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import { useExam, useExamQuestions } from "@/hooks/useExams";
import { usePublishExam } from "@/hooks/useExamMutations";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

const TYPE_LABELS: Record<string, { label: string; className: string }> = {
  mcq: { label: "اختيار من متعدد", className: "bg-violet-100 text-violet-700" },
  true_false: { label: "صح / خطأ", className: "bg-sky-100 text-sky-700" },
  short_answer: { label: "إجابة قصيرة", className: "bg-blue-100 text-blue-700" },
  essay: { label: "مقالية", className: "bg-amber-100 text-amber-700" },
  fill_blank: { label: "ملء الفراغ", className: "bg-pink-100 text-pink-700" },
};

export default function PreviewPublishPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [] } = useExamQuestions(examId);
  const publishExam = usePublishExam();
  const [page, setPage] = useState(0);
  const pageSize = 2;
  const currentQuestions = questions.slice(page * pageSize, page * pageSize + pageSize);
  const pagesCount = Math.max(1, Math.ceil(questions.length / pageSize));
  const totalMarks = questions.reduce((sum, q: any) => sum + Number(q.marks || 0), 0);

  const publish = async () => {
    if (!examId) return;
    try {
      await publishExam.mutateAsync(examId);
      toast.success("تم نشر الامتحان بنجاح");
      navigate("/teacher/exams");
    } catch (error: any) {
      toast.error(error?.message || "تعذر نشر الامتحان");
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcff]">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <Button variant="outline" onClick={() => navigate(`/teacher/exams/${examId}/settings`)} className="h-12 rounded-2xl border-slate-200 px-5 text-base">
            <ArrowRight className="ml-2 h-4 w-4" /> عودة
          </Button>
          <div className="hidden flex-1 md:block">
            <ExamWizardStepper steps={STEPS} currentStep="preview" />
          </div>
          <Button variant="outline" className="h-12 rounded-2xl border-slate-200 px-5 text-base text-violet-700">
            <Save className="ml-2 h-4 w-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="border-t border-slate-100 md:hidden">
          <ExamWizardStepper steps={STEPS} currentStep="preview" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 text-center">
          <h1 className="mb-2 flex items-center justify-center gap-2 text-3xl font-bold text-slate-900 md:text-5xl">
            معاينة الامتحان <Eye className="h-8 w-8 text-violet-500" />
          </h1>
          <p className="text-base text-slate-500">راجع شكل الامتحان كما سيراه الطلاب</p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <h2 className="mb-5 text-center text-3xl font-bold text-slate-900">{exam?.title || "اختبار جديد"}</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 p-3"><HelpCircle className="h-4 w-4 text-violet-600" /> {questions.length} سؤال</div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 p-3"><Clock3 className="h-4 w-4 text-violet-600" /> {exam?.duration_minutes || 90} دقيقة</div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 p-3"><Star className="h-4 w-4 text-violet-600" /> الدرجة الكلية: {totalMarks} درجة</div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 p-3">متوسط</div>
              </div>
            </Card>

            {currentQuestions.map((question: any, index) => {
              const type = TYPE_LABELS[question.question_type] || { label: question.question_type, className: "bg-slate-100 text-slate-700" };
              const questionNumber = page * pageSize + index + 1;
              return (
                <Card key={question.id} className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
                  <div className="mb-4 flex items-start justify-between">
                    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-400">
                      <Bookmark className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("rounded-full border-0 px-3 py-1 text-xs font-semibold", type.className)}>{type.label}</Badge>
                      <Badge variant="outline" className="rounded-full px-3 py-1">سؤال {questionNumber}</Badge>
                    </div>
                  </div>

                  <p className="mb-5 text-right text-2xl font-semibold leading-10 text-slate-900">{question.question_text}</p>

                  {(question.question_type === "mcq" || question.question_type === "true_false") && (
                    <div className="space-y-3">
                      {(question.options || []).map((option: any, optionIndex: number) => (
                        <div key={option.id} className={cn("flex items-center gap-3 rounded-2xl border px-4 py-4", option.is_correct ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white")}>
                          <div className={cn("h-5 w-5 rounded-full border-2", option.is_correct ? "border-violet-500 bg-violet-500" : "border-slate-300 bg-white")} />
                          <span className="flex-1 text-right text-lg text-slate-800">{option.option_text}</span>
                          <span className="text-slate-500">({String.fromCharCode(0x0623 + optionIndex)})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(question.question_type === "essay" || question.question_type === "short_answer" || question.question_type === "fill_blank") && (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-slate-400">منطقة كتابة إجابة الطالب</div>
                  )}
                </Card>
              );
            })}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setPage((value) => Math.max(0, value - 1))} className="h-12 rounded-2xl border-slate-200 px-5">السابق</Button>
              <span className="text-sm text-slate-500">{page + 1} من {pagesCount}</span>
              <Button variant="outline" onClick={() => setPage((value) => Math.min(pagesCount - 1, value + 1))} className="h-12 rounded-2xl border-slate-200 px-5">التالي</Button>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center gap-2">
                <Eye className="h-5 w-5 text-violet-600" />
                <h3 className="text-2xl font-bold text-slate-900">ملخص الامتحان</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">عنوان الامتحان</span><span className="text-right font-semibold text-slate-900">{exam?.title}</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">عدد الأسئلة</span><span className="font-semibold text-slate-900">{questions.length} سؤال</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">الدرجة الكلية</span><span className="font-semibold text-slate-900">{totalMarks} درجة</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-slate-500">المدة</span><span className="font-semibold text-slate-900">{exam?.duration_minutes || 90} دقيقة</span></div>
              </div>
            </Card>

            <Card className="rounded-[24px] border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-violet-600" />
                <h3 className="text-2xl font-bold text-slate-900">مكافحة الغش</h3>
              </div>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" /> الحد الأقصى للخروج من الامتحان: مرتان</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" /> منع نسخ المحتوى</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" /> منع فتح تطبيقات أخرى</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" /> منع تحميل الصفحة</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-500" /> التقاط صورة عشوائية للطالب</div>
              </div>
            </Card>

            <Card className="rounded-[24px] border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 text-center shadow-[0_12px_40px_rgba(15,23,42,0.04)]">
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-violet-600" />
              <h4 className="mb-2 text-2xl font-bold text-violet-700">جاهز للنشر</h4>
              <p className="text-sm leading-7 text-slate-500">تم إعداد الامتحان بالكامل ويمكنك نشره الآن. سيصل للطلاب في الموعد المحدد تلقائياً.</p>
            </Card>

            <Button onClick={publish} disabled={publishExam.isPending} className="h-14 w-full rounded-2xl bg-violet-600 text-base hover:bg-violet-700">
              <Send className="ml-2 h-4 w-4" /> {publishExam.isPending ? "جاري النشر..." : "نشر الامتحان الآن"}
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-2xl border-slate-200 text-violet-700">
              <Save className="ml-2 h-4 w-4" /> حفظ كمسودة
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
