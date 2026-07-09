import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bold, ClipboardList, Eye, Italic, ListOrdered, RotateCcw, Save, Settings, ShieldCheck, Sun, Underline, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import type { AntiCheatState } from "@/components/exams/teacher/AntiCheatPanel";
import { useExam, useExamQuestions } from "@/hooks/useExams";
import { useUpdateExam } from "@/hooks/useExamMutations";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

const formatLocal = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : "");
const datePart = (value: string) => value.split("T")[0] || "";
const timePart = (value: string) => value.split("T")[1] || "";
const mergeLocal = (current: string, part: "date" | "time", value: string) => {
  const date = part === "date" ? value : datePart(current);
  const time = part === "time" ? value : timePart(current);
  return date && time ? `${date}T${time}` : date ? `${date}T00:00` : "";
};

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
  const [targetSection, setTargetSection] = useState<"all" | "scientific" | "literary">("all");
  const [targetEducationType, setTargetEducationType] = useState<"all" | "general" | "azhar">("all");

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
      maxExits: (exam as any).max_cheat_exits ?? 2,
      preventCopy: exam.prevent_copy_paste,
      preventTabSwitch: exam.prevent_tab_switch,
      requireFullscreen: exam.require_fullscreen,
      preventReload: (exam as any).prevent_reload ?? true,
      randomSnapshots: (exam as any).random_snapshots ?? true,
    });
    const ts = ((exam as any).target_section ?? "all") as "all" | "scientific" | "literary";
    const te = ((exam as any).target_education_type ?? "all") as "all" | "general" | "azhar";
    setTargetSection(ts || "all");
    setTargetEducationType(te || "all");
  }, [exam]);

  const totalMarks = questions.reduce((sum, q: any) => sum + Number(q.marks || 0), 0);
  const typesSummary = Array.from(new Set(questions.map((q: any) => q.question_type))).join(" - ") || "اختيار من متعدد";
  const durationHours = Math.floor(duration / 60);
  const durationMinutes = duration % 60;

  const setAnti = <K extends keyof AntiCheatState>(key: K, next: AntiCheatState[K]) => setAntiCheat((current) => ({ ...current, [key]: next }));

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
          max_cheat_exits: antiCheat.maxExits,
          prevent_reload: antiCheat.preventReload,
          random_snapshots: antiCheat.randomSnapshots,
          target_section: targetSection === "all" ? null : targetSection,
          target_education_type: targetEducationType === "all" ? null : targetEducationType,
        } as any,
      });
      toast.success("تم حفظ إعدادات الامتحان");
      if (goNext) navigate(`/teacher/exams/${examId}/preview`);
    } catch (error: any) {
      toast.error(error?.message || "تعذر حفظ الإعدادات");
    }
  };

  return (
    <div className="exam-review-page exam-settings-page min-h-screen" dir="rtl">
      <header className="review-topbar sticky top-0 z-20">
        <div className="settings-topbar-inner">
          <div className="review-top-actions">
            <Button variant="outline" size="sm" className="review-icon-button" aria-label="الإضاءة">
              <Sun className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="review-small-button" onClick={() => save(false)}>
              <Save className="h-3.5 w-3.5" /> حفظ كمسودة
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/exams/${examId}/review`)} className="review-small-button">
              <ArrowRight className="h-3.5 w-3.5" /> عودة
            </Button>
          </div>

          <div className="review-stepper-wrap">
            <ExamWizardStepper steps={STEPS} currentStep="settings" />
          </div>

          <div className="review-teacher-box">
            <div className="review-avatar"><UserRound className="h-5 w-5" /></div>
            <div className="min-w-0 text-right">
              <p className="review-hello">مرحباً بك أ. محمد 👋</p>
              <p className="review-role">معلم رياضيات · مدرسة الثانوية</p>
            </div>
          </div>
        </div>
      </header>

      <main className="settings-main">
        <section className="review-title-block settings-title-block">
          <h1>
            إعدادات الامتحان <Settings className="h-6 w-6" />
          </h1>
          <p>حدد معلومات الامتحان وإعداداته وطريقة ظهوره للطلاب</p>
        </section>

        <div className="settings-layout">
          <aside className="settings-side-stack">
            <Card className="settings-card settings-summary-card">
              <div className="settings-card-title"><ClipboardList className="h-4 w-4" /><h2>ملخص الامتحان</h2></div>
              <div className="settings-summary-rows">
                <div><span>عدد الأسئلة</span><strong>{questions.length} سؤال</strong></div>
                <div><span>إجمالي الدرجات</span><strong>{totalMarks} درجة</strong></div>
                <div><span>المدة الكلية</span><strong>{String(durationHours).padStart(2, "0")}:{String(durationMinutes).padStart(2, "0")} ساعة</strong></div>
                <div><span>نوع الأسئلة</span><strong>{typesSummary}</strong></div>
                <div><span>المستوى</span><strong><i /> متوسط</strong></div>
              </div>
              <Button variant="outline" className="settings-preview-button" onClick={() => navigate(`/teacher/exams/${examId}/preview`)}>
                <Eye className="h-4 w-4" /> معاينة الأسئلة
              </Button>
            </Card>

            <Card className="settings-card settings-anti-card">
              <div className="settings-card-title"><ShieldCheck className="h-4 w-4" /><h2>إعدادات مكافحة الغش</h2></div>
              <div className="settings-field compact">
                <label>الحد الأقصى للخروج من الامتحان</label>
                <Select value={String(antiCheat.maxExits)} onValueChange={(value) => setAnti("maxExits", Number(value))}>
                  <SelectTrigger className="settings-select-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">عدم السماح إطلاقاً</SelectItem>
                    <SelectItem value="1">مرة واحدة</SelectItem>
                    <SelectItem value="2">مرتان</SelectItem>
                    <SelectItem value="3">3 مرات</SelectItem>
                    <SelectItem value="5">5 مرات</SelectItem>
                  </SelectContent>
                </Select>
                <small>عند تجاوز الحد سيتم تسليم الامتحان تلقائياً</small>
              </div>
              <div className="settings-switch-list">
                <SwitchRow title="منع نسخ المحتوى" desc="منع نسخ النص من الأسئلة" checked={antiCheat.preventCopy} onCheckedChange={(v) => setAnti("preventCopy", v)} />
                <SwitchRow title="منع فتح تطبيقات أخرى" desc="منع فتح تطبيقات أو نوافذ أخرى أثناء الامتحان" checked={antiCheat.preventTabSwitch} onCheckedChange={(v) => setAnti("preventTabSwitch", v)} />
                <SwitchRow title="منع تحميل الصفحة" desc="سيتم تسليم الامتحان عند محاولة تحميل الصفحة" checked={antiCheat.preventReload} onCheckedChange={(v) => setAnti("preventReload", v)} />
                <SwitchRow title="التقاط صورة عشوائية للطالب" desc="يتم التقاط صورة للطالب بشكل عشوائي أثناء الامتحان" checked={antiCheat.randomSnapshots} onCheckedChange={(v) => setAnti("randomSnapshots", v)} />
              </div>
            </Card>
          </aside>

          <section className="settings-content-stack">
            <Card className="settings-card settings-info-card">
              <div className="settings-card-title"><ClipboardList className="h-4 w-4" /><h2>معلومات الامتحان</h2></div>
              <div className="settings-info-grid">
                <div className="settings-field description-field">
                  <label>وصف الامتحان (يظهر للطلاب)</label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={300} className="settings-textarea" placeholder="اكتب وصفاً مختصراً يظهر للطلاب قبل بداية الامتحان" />
                  <small>{description.length}/300</small>
                </div>
                <div className="settings-field title-field">
                  <label>عنوان الامتحان *</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="settings-input" placeholder="اختبار نهاية الوحدة الأولى - المتطابقات" />
                </div>
              </div>

              <div className="settings-date-grid">
                <div className="settings-field"><label>تاريخ بداية الامتحان *</label><Input type="date" value={datePart(startAt)} onChange={(e) => setStartAt((v) => mergeLocal(v, "date", e.target.value))} className="settings-input" /></div>
                <div className="settings-field"><label>وقت بداية الامتحان *</label><Input type="time" value={timePart(startAt)} onChange={(e) => setStartAt((v) => mergeLocal(v, "time", e.target.value))} className="settings-input" /></div>
                <div className="settings-field"><label>تاريخ نهاية الامتحان *</label><Input type="date" value={datePart(endAt)} onChange={(e) => setEndAt((v) => mergeLocal(v, "date", e.target.value))} className="settings-input" /></div>
                <div className="settings-field"><label>وقت نهاية الامتحان *</label><Input type="time" value={timePart(endAt)} onChange={(e) => setEndAt((v) => mergeLocal(v, "time", e.target.value))} className="settings-input" /></div>
                <div className="settings-field"><label>المدة الكلية *</label><Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 0)} className="settings-input" /></div>
              </div>
            </Card>

            <Card className="settings-card settings-instructions-card">
              <h2>تعليمات للطلاب (اختياري)</h2>
              <div className="settings-editor-toolbar" aria-hidden="true">
                <RotateCcw className="h-3.5 w-3.5" /><Bold className="h-3.5 w-3.5" /><Italic className="h-3.5 w-3.5" /><Underline className="h-3.5 w-3.5" /><ListOrdered className="h-3.5 w-3.5" />
              </div>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} maxLength={500} className="settings-editor-textarea" placeholder="مثال: اقرأ كل سؤال جيداً قبل الإجابة، وتأكد من حفظ إجاباتك قبل انتهاء الوقت." />
              <small>{instructions.length}/500</small>
            </Card>

            <div className="settings-two-cols">
              <Card className="settings-card settings-results-card">
                <h2>النتيجة وإظهار الدرجات</h2>
                <RadioChoice label="إظهار النتيجة فوراً بعد تسليم الامتحان" active={resultMode === "immediate"} onClick={() => setResultMode("immediate")} />
                <RadioChoice label="إظهار النتيجة بعد انتهاء الوقت المحدد للامتحان" active={resultMode === "afterEnd"} onClick={() => setResultMode("afterEnd")} />
                <RadioChoice label="لا تظهر النتيجة للطالب" active={resultMode === "hidden"} onClick={() => setResultMode("hidden")} />
              </Card>

              <Card className="settings-card settings-other-card">
                <h2>إعدادات أخرى</h2>
                <SwitchRow title="خلط ترتيب الأسئلة" checked={shuffleQuestions} onCheckedChange={setShuffleQuestions} />
                <SwitchRow title="خلط ترتيب الاختيارات داخل السؤال" checked={shuffleOptions} onCheckedChange={setShuffleOptions} />
                <SwitchRow title="السماح للطلاب بالرجوع للأسئلة السابقة" checked={allowBack} onCheckedChange={setAllowBack} />
                <SwitchRow title="تفعيل وضع ملء الشاشة أثناء الامتحان" checked={antiCheat.requireFullscreen} onCheckedChange={(v) => setAnti("requireFullscreen", v)} />
              </Card>
            </div>
          </section>
        </div>
      </main>

      <footer className="settings-bottom-bar">
        <Button variant="outline" className="settings-bottom-outline" onClick={() => save(false)}><Save className="h-4 w-4" /> حفظ كمسودة</Button>
        <div className="settings-bottom-actions">
          <Button variant="outline" className="settings-bottom-outline" onClick={() => navigate(`/teacher/exams/${examId}/review`)}>السابق <ArrowRight className="h-4 w-4" /></Button>
          <Button className="settings-primary-button" onClick={() => save(true)}>التالي: معاينة ونشر <ArrowLeft className="h-4 w-4" /></Button>
        </div>
      </footer>
    </div>
  );
}

function SwitchRow({ title, desc, checked, onCheckedChange }: { title: string; desc?: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="settings-switch-row">
      <div>
        <span>{title}</span>
        {desc && <small>{desc}</small>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="settings-switch" />
    </div>
  );
}

function RadioChoice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("settings-radio-row", active && "active")}>
      <span className="settings-radio-dot" />
      <span>{label}</span>
    </button>
  );
}
