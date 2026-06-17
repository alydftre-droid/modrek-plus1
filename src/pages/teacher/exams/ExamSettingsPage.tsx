import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Save, Settings, FileText, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

const toLocalInput = (s: string | null) => s ? new Date(s).toISOString().slice(0, 16) : "";

export default function ExamSettingsPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions } = useExamQuestions(examId);
  const update = useUpdateExam();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [resultMode, setResultMode] = useState<"immediate" | "afterEnd" | "hidden">("immediate");
  const [shuffleQ, setShuffleQ] = useState(true);
  const [shuffleO, setShuffleO] = useState(true);
  const [allowBack, setAllowBack] = useState(true);
  const [fullscreen, setFullscreen] = useState(true);
  const [ac, setAC] = useState<AntiCheatState>({
    maxExits: 2, preventCopy: true, preventTabSwitch: true, requireFullscreen: true, preventReload: true, randomSnapshots: true,
  });

  useEffect(() => {
    if (exam) {
      setTitle(exam.title || "");
      setDescription(exam.description || "");
      setInstructions(exam.instructions || "");
      setStartAt(toLocalInput(exam.start_at));
      setEndAt(toLocalInput(exam.end_at));
      setDuration(exam.duration_minutes || 60);
      setShuffleQ(exam.shuffle_questions);
      setShuffleO(exam.shuffle_options);
      setFullscreen(exam.require_fullscreen);
      setResultMode(exam.show_results_immediately ? "immediate" : exam.show_correct_answers ? "afterEnd" : "hidden");
      setAC({
        maxExits: 2,
        preventCopy: exam.prevent_copy_paste,
        preventTabSwitch: exam.prevent_tab_switch,
        requireFullscreen: exam.require_fullscreen,
        preventReload: true,
        randomSnapshots: true,
      });
    }
  }, [exam]);

  const save = async (goNext: boolean) => {
    if (!examId) return;
    if (!title.trim()) { toast.error("الرجاء كتابة عنوان الامتحان"); return; }
    try {
      await update.mutateAsync({
        id: examId,
        patch: {
          title, description, instructions,
          start_at: startAt ? new Date(startAt).toISOString() : null,
          end_at: endAt ? new Date(endAt).toISOString() : null,
          duration_minutes: duration,
          shuffle_questions: shuffleQ, shuffle_options: shuffleO,
          show_results_immediately: resultMode === "immediate",
          show_correct_answers: resultMode !== "hidden",
          require_fullscreen: ac.requireFullscreen,
          prevent_tab_switch: ac.preventTabSwitch,
          prevent_copy_paste: ac.preventCopy,
        },
      });
      toast.success("تم حفظ الإعدادات");
      if (goNext) navigate(`/teacher/exams/${examId}/preview`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحفظ");
    }
  };

  const totalMarks = questions?.reduce((a, q: any) => a + Number(q.marks || 0), 0) || 0;
  const typesSummary = (() => {
    if (!questions) return "";
    const labels: Record<string, string> = { mcq: "اختيار من متعدد", true_false: "صح / خطأ", short_answer: "إجابة قصيرة", essay: "مقالية قصيرة", fill_blank: "ملء الفراغ" };
    const set = new Set(questions.map((q: any) => labels[q.question_type] || q.question_type));
    return Array.from(set).join(" - ");
  })();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/exams/${examId}/review`)} className="gap-2">
            <ArrowRight className="w-4 h-4" /> عودة
          </Button>
          <div className="flex-1 hidden md:block">
            <ExamWizardStepper steps={STEPS} currentStep="settings" />
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => save(false)}>
            <Save className="w-4 h-4" /> حفظ كمسودة
          </Button>
        </div>
        <div className="md:hidden border-t"><ExamWizardStepper steps={STEPS} currentStep="settings" /></div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="text-center space-y-1 mb-5">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center justify-center gap-2">
            <Settings className="w-7 h-7 text-violet-600" /> إعدادات الامتحان
          </h1>
          <p className="text-sm text-muted-foreground">حدد معلومات الامتحان وإعداداته وطريقة ظهوره للطلاب</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-5">
          {/* Main */}
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                <h3 className="font-bold">معلومات الامتحان</h3>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>عنوان الامتحان <span className="text-rose-500">*</span></Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: اختبار الفصل الأول" />
                </div>
                <div className="space-y-1">
                  <Label>وصف الامتحان (يظهر للطلاب)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>تاريخ بداية الامتحان <span className="text-rose-500">*</span></Label>
                  <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>تاريخ نهاية الامتحان <span className="text-rose-500">*</span></Label>
                  <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>المدة الكلية (دقيقة) <span className="text-rose-500">*</span></Label>
                  <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} />
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-3">
              <Label className="text-base font-bold">تعليمات للطلاب (اختياري)</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} placeholder="• اقرأ كل سؤال جيداً قبل الإجابة..." />
            </Card>

            <div className="grid md:grid-cols-2 gap-5">
              <Card className="p-5 space-y-3">
                <h3 className="font-bold">إعدادات أخرى</h3>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">خلط ترتيب الأسئلة</Label>
                  <Switch checked={shuffleQ} onCheckedChange={setShuffleQ} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">خلط ترتيب الاختيارات داخل السؤال</Label>
                  <Switch checked={shuffleO} onCheckedChange={setShuffleO} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">السماح للطلاب بالرجوع للأسئلة السابقة</Label>
                  <Switch checked={allowBack} onCheckedChange={setAllowBack} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">تفعيل وضع ملء الشاشة أثناء الامتحان</Label>
                  <Switch checked={fullscreen} onCheckedChange={setFullscreen} />
                </div>
              </Card>

              <Card className="p-5 space-y-3">
                <h3 className="font-bold">النتيجة وإظهار الدرجات</h3>
                <RadioGroup value={resultMode} onValueChange={(v) => setResultMode(v as any)} className="space-y-2">
                  <div className="flex items-center gap-2"><RadioGroupItem value="immediate" id="r1" /><Label htmlFor="r1" className="text-sm">إظهار النتيجة فوراً بعد تسليم الامتحان</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="afterEnd" id="r2" /><Label htmlFor="r2" className="text-sm">إظهار النتيجة بعد انتهاء الوقت المحدد للامتحان</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="hidden" id="r3" /><Label htmlFor="r3" className="text-sm">لا تظهر النتيجة للطالب</Label></div>
                </RadioGroup>
              </Card>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <ExamSummaryCard
              questionsCount={questions?.length || 0}
              totalMarks={totalMarks}
              durationMinutes={duration}
              difficulty="متوسط"
              typesSummary={typesSummary}
            />
            <AntiCheatPanel value={ac} onChange={setAC} />
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <Button variant="outline" onClick={() => navigate(`/teacher/exams/${examId}/review`)}>السابق</Button>
          <Button size="lg" className="gap-2 bg-violet-600 hover:bg-violet-700" onClick={() => save(true)}>
            التالي: معاينة ونشر
          </Button>
        </div>
      </div>
    </div>
  );
}
