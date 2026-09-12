import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, RefreshCw, FileSearch, Sparkles, ListChecks, CheckCircle2, GitMerge, AlignLeft, HelpCircle, ChevronDown, Eye, Sun, CloudUpload, UserRound, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import ExamWizardStepper from "@/components/exams/teacher/ExamWizardStepper";
import QuestionEditorCard, { type EditorQuestion, type EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { useExamQuestions } from "@/hooks/useExams";
import { useReplaceExamQuestions } from "@/hooks/useExamMutations";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { cn } from "@/lib/utils";
import StoredImage from "@/components/common/StoredImage";

const STEPS = [
  { id: "ai", label: "المساعد الذكي" },
  { id: "review", label: "مراجعة الأسئلة" },
  { id: "settings", label: "إعدادات الامتحان" },
  { id: "preview", label: "معاينة ونشر" },
];

export default function ReviewQuestionsPage() {
  const navigate = useNavigate();
  const { examId } = useParams<{ examId: string }>();
  const [params] = useSearchParams();
  const creationQuery = params.toString();
  const { data: dbQs } = useExamQuestions(examId);
  const { data: teacherProfile } = useTeacherProfile();
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
  const teacherName = teacherProfile?.full_name || "محمد";
  const stats: Array<{ label: string; value: string | number; icon: any; tone: string }> = [
    { label: "جودة الاستخراج", value: "جيدة جداً", icon: Sparkles, tone: "spark" },
    { label: "عدد الأسئلة", value: questions.length, icon: HelpCircle, tone: "violet" },
    { label: "اختيار من متعدد", value: counts["mcq"] || 0, icon: ListChecks, tone: "mint" },
    { label: "صح / خطأ", value: counts["true_false"] || 0, icon: CheckCircle2, tone: "orange" },
    { label: "المطابقة", value: counts["short_answer"] || 0, icon: GitMerge, tone: "blue" },
    { label: "مقالية قصيرة", value: counts["essay"] || counts["fill_blank"] || 0, icon: AlignLeft, tone: "rose" },
  ];

  const save = async () => {
    if (!examId) return;
    setSaving(true);
    try {
      await replace.mutateAsync({ examId, questions });
      toast.success("تم حفظ التعديلات");
      navigate(`/teacher/exams/${examId}/settings${creationQuery ? `?${creationQuery}` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحفظ");
    } finally { setSaving(false); }
  };

  return (
    <div className="exam-review-page min-h-screen" dir="rtl">
      <header className="review-topbar sticky top-0 z-20">
        <div className="review-topbar-inner">
          <div className="review-top-actions">
            <Button variant="outline" size="sm" className="review-icon-button" aria-label="الإضاءة">
              <Sun className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="review-small-button" onClick={save} disabled={saving}>
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
              {saving ? "جاري الحفظ" : "حفظ الآن"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="review-small-button">
              <ArrowRight className="h-3.5 w-3.5" /> عودة
            </Button>
          </div>

          <div className="review-stepper-wrap">
            <ExamWizardStepper steps={STEPS} currentStep="review" />
          </div>

          <div className="review-teacher-box">
            <div className="review-avatar">
              {teacherProfile?.avatar_url ? <StoredImage source={teacherProfile.avatar_url} alt={teacherName} /> : <UserRound className="h-5 w-5" />}
            </div>
            <div className="min-w-0 text-right">
              <p className="review-hello">مرحباً بك أ. {teacherName} 👋</p>
              <p className="review-role">معلم رياضيات · مدرسة الثانوية</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </div>
        </div>
      </header>

      <main className="review-main">
        <section className="review-title-block">
          <h1>
            <FileSearch className="h-6 w-6" />
            مراجعة الأسئلة
          </h1>
          <p>راجع الأسئلة المستخرجة وعدّلها وأضف الإجابات الصحيحة</p>
        </section>

        <div className="review-layout">
          <section className="review-content">
            <div className="review-stats-grid">
              {stats.map((s) => (
                <Card key={s.label} className="review-stat-card">
                  <div className="review-stat-text">
                    <span>{s.label}</span>
                    <strong className={cn(`tone-${s.tone}`)}>{s.value}</strong>
                  </div>
                  <div className={cn("review-stat-icon", `tone-${s.tone}`)}>
                    <s.icon className="h-4 w-4" />
                  </div>
                </Card>
              ))}
            </div>

            <Card className="review-toolbar-card">
              <div className="review-toggle-box">
                <span className="review-eye"><Eye className="h-4 w-4" /></span>
                <span>عرض الإجابات</span>
                <Switch checked={showAnswers} onCheckedChange={setShowAnswers} className="review-switch" />
              </div>
              <div className="review-toolbar-actions">
                <Button variant="outline" size="sm" className="review-outline-action">
                  <RefreshCw className="h-3.5 w-3.5" /> إعادة استخراج
                </Button>
                <Button size="sm" className="review-add-action" onClick={() => {
                  setQuestions((qs) => [...qs, { id: crypto.randomUUID(), index: qs.length + 1, type: "mcq", text: "", marks: 5, options: Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), text: "", isCorrect: false })), modelAnswer: "" }]);
                }}>
                  <Plus className="h-4 w-4" /> إضافة سؤال
                </Button>
              </div>
            </Card>

            <div className="review-questions-stack">
              {questions.map((q) => (
                <QuestionEditorCard
                  key={q.id}
                  question={q}
                  total={questions.length}
                  showAnswers={showAnswers}
                  onChange={(nq) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? nq : x)))}
                  onDuplicate={() => setQuestions((qs) => qs.flatMap((x) => x.id === q.id ? [x, { ...x, id: crypto.randomUUID(), index: x.index + 1, options: x.options.map((o) => ({ ...o, id: crypto.randomUUID() })) }] : [x]).map((x, i) => ({ ...x, index: i + 1 })))}
                  onDelete={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id).map((x, i) => ({ ...x, index: i + 1 })))}
                />
              ))}
            </div>

            <Card className="review-footer-card">
              <Button className="review-next-button" onClick={save} disabled={saving}>
                متابعة إلى إعدادات الامتحان
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
