import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Save, Eye, Send, Bookmark, ChevronRight, ChevronLeft, Sparkles, ShieldCheck, Clock, Award, HelpCircle, BarChart2 } from "lucide-react";
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

const TYPE_LABEL: Record<string, { ar: string; color: string }> = {
  mcq: { ar: "اختيار من متعدد", color: "bg-violet-100 text-violet-700" },
  true_false: { ar: "صح / خطأ", color: "bg-violet-100 text-violet-700" },
  short_answer: { ar: "إجابة قصيرة", color: "bg-sky-100 text-sky-700" },
  essay: { ar: "مقالية", color: "bg-rose-100 text-rose-700" },
  fill_blank: { ar: "ملء الفراغ", color: "bg-fuchsia-100 text-fuchsia-700" },
};

export default function PreviewPublishPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [] } = useExamQuestions(examId);
  const publish = usePublishExam();
  const [idx, setIdx] = useState(0);
  const perPage = 2;
  const pageCount = Math.max(1, Math.ceil(questions.length / perPage));
  const currentSlice = questions.slice(idx * perPage, idx * perPage + perPage);
  const totalMarks = questions.reduce((a, q: any) => a + Number(q.marks || 0), 0);

  const doPublish = async () => {
    if (!examId) return;
    try {
      await publish.mutateAsync(examId);
      toast.success("تم نشر الامتحان بنجاح!");
      navigate("/teacher/exams");
    } catch (e: any) { toast.error(e?.message || "تعذر النشر"); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/exams/${examId}/settings`)} className="gap-2">
            <ArrowRight className="w-4 h-4" /> عودة
          </Button>
          <div className="flex-1 hidden md:block">
            <ExamWizardStepper steps={STEPS} currentStep="preview" />
          </div>
          <Button variant="outline" size="sm" className="gap-2"><Save className="w-4 h-4" /> حفظ كمسودة</Button>
        </div>
        <div className="md:hidden border-t"><ExamWizardStepper steps={STEPS} currentStep="preview" /></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="text-center space-y-1 mb-5">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center justify-center gap-2">
            <Eye className="w-7 h-7 text-violet-600" /> معاينة الامتحان
          </h1>
          <p className="text-sm text-muted-foreground">راجع شكل الامتحان كما سيراه الطلاب</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          {/* Main */}
          <div className="space-y-4">
            <Card className="p-5 space-y-4">
              <h2 className="text-xl font-bold text-center">{exam?.title || "—"}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg border p-2 flex items-center justify-center gap-2"><HelpCircle className="w-4 h-4 text-violet-600" /> {questions.length} سؤال</div>
                <div className="rounded-lg border p-2 flex items-center justify-center gap-2"><Clock className="w-4 h-4 text-sky-600" /> {Math.floor((exam?.duration_minutes || 60) / 60).toString().padStart(2, "0")}:{((exam?.duration_minutes || 60) % 60).toString().padStart(2, "0")} ساعة</div>
                <div className="rounded-lg border p-2 flex items-center justify-center gap-2"><Award className="w-4 h-4 text-amber-600" /> الدرجة الكلية: {totalMarks} درجة</div>
                <div className="rounded-lg border p-2 flex items-center justify-center gap-2"><BarChart2 className="w-4 h-4 text-violet-600" /> متوسط</div>
              </div>
            </Card>

            <div className="space-y-3">
              {currentSlice.map((q: any, i) => {
                const number = idx * perPage + i + 1;
                const t = TYPE_LABEL[q.question_type] || { ar: q.question_type, color: "bg-muted" };
                return (
                  <Card key={q.id} className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Bookmark className="w-4 h-4" /></Button>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("border-0", t.color)}>{t.ar}</Badge>
                        <Badge variant="outline">سؤال {number}</Badge>
                      </div>
                    </div>
                    <p className="font-medium mb-4 text-end">{q.question_text}</p>
                    {(q.question_type === "mcq" || q.question_type === "true_false") && (
                      <div className="space-y-2">
                        {q.options?.map((o: any, oi: number) => (
                          <div key={o.id} className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                            o.is_correct ? "border-violet-400 bg-violet-50/50 dark:bg-violet-500/10" : "",
                          )}>
                            <div className={cn(
                              "w-5 h-5 rounded-full border-2 shrink-0",
                              o.is_correct ? "border-violet-500 bg-violet-500" : "border-muted-foreground/40",
                            )} />
                            <span className="flex-1">{o.option_text}</span>
                            <span className="text-xs text-muted-foreground">({String.fromCharCode(0x0623 + oi)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(q.question_type === "essay" || q.question_type === "short_answer" || q.question_type === "fill_blank") && (
                      <div className="rounded-lg border-2 border-dashed p-4 text-sm text-muted-foreground text-center">منطقة كتابة إجابة الطالب</div>
                    )}
                  </Card>
                );
              })}
            </div>

            <Card className="p-3 flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="gap-1">
                <ChevronRight className="w-4 h-4" /> السابق
              </Button>
              <span className="text-sm text-muted-foreground">{idx + 1} من {pageCount}</span>
              <Button variant="outline" size="sm" onClick={() => setIdx((i) => Math.min(pageCount - 1, i + 1))} disabled={idx >= pageCount - 1} className="gap-1">
                التالي <ChevronLeft className="w-4 h-4" />
              </Button>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-5 space-y-3">
              <h3 className="font-bold flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> ملخص الامتحان</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">عنوان الامتحان</span><span className="font-medium text-end">{exam?.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">عدد الأسئلة</span><span className="font-bold">{questions.length} سؤال</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الدرجة الكلية</span><span className="font-bold">{totalMarks} درجة</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المدة</span><span className="font-bold">{exam?.duration_minutes || 60} دقيقة</span></div>
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-violet-600" /> مكافحة الغش</h3>
              <div className="space-y-1.5 text-xs">
                {exam?.prevent_copy_paste && <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-violet-500 rounded-full" /> منع نسخ المحتوى</div>}
                {exam?.prevent_tab_switch && <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-violet-500 rounded-full" /> منع فتح تطبيقات أخرى</div>}
                {exam?.require_fullscreen && <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-violet-500 rounded-full" /> ملء الشاشة</div>}
                <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-violet-500 rounded-full" /> منع تحميل الصفحة</div>
                <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-violet-500 rounded-full" /> التقاط صورة عشوائية للطالب</div>
              </div>
            </Card>

            <Card className="p-5 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 border-violet-100/60 dark:border-violet-900/40 space-y-2 text-center">
              <Sparkles className="w-6 h-6 text-violet-600 mx-auto" />
              <h4 className="font-bold text-violet-700 dark:text-violet-300">جاهز للنشر</h4>
              <p className="text-xs text-muted-foreground">تم إعداد الامتحان بالكامل ويمكنك نشره الآن. سيصل للطلاب في الموعد المحدد تلقائياً.</p>
            </Card>

            <Button
              size="lg"
              className="w-full h-14 gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-lg"
              onClick={doPublish}
              disabled={publish.isPending}
            >
              <Send className="w-5 h-5" /> {publish.isPending ? "جاري النشر..." : "نشر الامتحان الآن"}
            </Button>

            <Button variant="outline" className="w-full gap-2"><Save className="w-4 h-4" /> حفظ كمسودة</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
