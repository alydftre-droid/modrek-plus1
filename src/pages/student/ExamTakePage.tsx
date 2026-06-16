import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamQuestions, useMyAttempts, useSaveAnswer, useSubmitAttempt } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Clock, Flag, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Send, Maximize } from "lucide-react";
import { toast } from "sonner";
import type { ExamQuestion } from "@/types/exam";

type AnswerState = {
  selectedOptionIds: string[];
  answerText: string;
  flagged: boolean;
};

export default function ExamTakePage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { data: exam, isLoading: examLoading } = useExam(examId);
  const { data: questionsRaw = [], isLoading: qLoading } = useExamQuestions(examId);
  const { data: attempts = [] } = useMyAttempts(examId);
  const saveAnswer = useSaveAnswer();
  const submit = useSubmitAttempt();

  const attempt = attempts.find(a => a.status === "in_progress");
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [showWarning, setShowWarning] = useState<string | null>(null);

  // Shuffle questions if needed
  const questions = useMemo(() => {
    if (!exam?.shuffle_questions) return questionsRaw;
    return [...questionsRaw].sort(() => {
      // stable per-attempt shuffle: use attempt id as seed string for deterministic-ish order
      return (attempt?.id || "").localeCompare(String(Math.random()));
    });
  }, [questionsRaw, exam?.shuffle_questions, attempt?.id]);

  // Timer
  useEffect(() => {
    if (!exam || !attempt) return;
    const started = new Date(attempt.started_at).getTime();
    const endsAt = started + exam.duration_minutes * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) doSubmit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, attempt]);

  // Anti-cheat
  useEffect(() => {
    if (!exam) return;
    const onVis = () => {
      if (document.hidden && exam.prevent_tab_switch) {
        setTabSwitches(v => v + 1);
        setShowWarning("⚠️ تم رصد محاولة تبديل التبويب");
      }
    };
    const onCopy = (e: ClipboardEvent) => { if (exam.prevent_copy_paste) e.preventDefault(); };
    const onContext = (e: MouseEvent) => { if (exam.prevent_copy_paste) e.preventDefault(); };
    const onFsChange = () => {
      if (exam.require_fullscreen && !document.fullscreenElement) {
        setFullscreenExits(v => v + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onCopy);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onCopy);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [exam]);

  // Local draft (offline-safe)
  const draftKey = `exam-draft-${examId}-${attempt?.id || "init"}`;
  useEffect(() => {
    if (!attempt) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setAnswers(JSON.parse(raw));
    } catch {}
  }, [draftKey, attempt]);
  useEffect(() => {
    if (!attempt) return;
    try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch {}
  }, [answers, draftKey, attempt]);

  const updateAnswer = useCallback((qId: string, patch: Partial<AnswerState>) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: { selectedOptionIds: [], answerText: "", flagged: false, ...prev[qId], ...patch },
    }));
  }, []);

  // Debounced server-side autosave per question
  const saveTimers = useRef<Record<string, any>>({});
  const queueSave = useCallback((qId: string) => {
    if (!attempt) return;
    if (saveTimers.current[qId]) clearTimeout(saveTimers.current[qId]);
    saveTimers.current[qId] = setTimeout(() => {
      const a = answers[qId];
      if (!a) return;
      saveAnswer.mutate({
        attemptId: attempt.id,
        questionId: qId,
        selectedOptionIds: a.selectedOptionIds,
        answerText: a.answerText,
        flagged: a.flagged,
      });
    }, 800);
  }, [answers, attempt, saveAnswer]);

  const doSubmit = async (auto = false) => {
    if (!attempt) return;
    setSubmitOpen(false);
    try {
      // Flush pending saves
      for (const qId of Object.keys(answers)) {
        const a = answers[qId];
        await saveAnswer.mutateAsync({
          attemptId: attempt.id,
          questionId: qId,
          selectedOptionIds: a.selectedOptionIds,
          answerText: a.answerText,
          flagged: a.flagged,
        }).catch(() => {});
      }
      const res = await submit.mutateAsync({ attemptId: attempt.id, tabSwitches, fullscreenExits });
      if (res?.success) {
        try { localStorage.removeItem(draftKey); } catch {}
        if (auto) toast.info("انتهى الوقت — تم التسليم تلقائياً");
        else toast.success("تم تسليم الامتحان");
        navigate(`/student/exams/${examId}/result/${attempt.id}`, { replace: true });
      } else {
        toast.error(res?.error || "تعذّر التسليم");
      }
    } catch (e: any) {
      toast.error(e?.message || "خطأ في التسليم");
    }
  };

  const requestFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  if (examLoading || qLoading) {
    return <div className="p-4 space-y-3 max-w-3xl mx-auto"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;
  }
  if (!exam || !attempt) {
    return (
      <div className="p-8 text-center space-y-4">
        <p>لم يتم العثور على محاولة جارية</p>
        <Button onClick={() => navigate(`/student/exams/${examId}`)}>العودة لصفحة الامتحان</Button>
      </div>
    );
  }
  if (questions.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">لا توجد أسئلة في هذا الامتحان</div>;
  }

  const currentQ = questions[currentIdx];
  const answered = Object.keys(answers).filter(k => {
    const a = answers[k];
    return a && (a.selectedOptionIds.length > 0 || (a.answerText && a.answerText.trim().length > 0));
  }).length;
  const progress = (answered / questions.length) * 100;

  const mins = Math.floor((secondsLeft || 0) / 60);
  const secs = (secondsLeft || 0) % 60;
  const timeWarning = secondsLeft !== null && secondsLeft < 60;

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container max-w-4xl mx-auto p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-sm truncate">{exam.title}</h1>
              <div className="text-xs text-muted-foreground">سؤال {currentIdx + 1} من {questions.length} • تم الإجابة: {answered}</div>
            </div>
            <Badge variant={timeWarning ? "destructive" : "default"} className="gap-1 text-base px-3 py-1.5 font-mono">
              <Clock className="h-4 w-4" />
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </Badge>
            {exam.require_fullscreen && !document.fullscreenElement && (
              <Button size="sm" variant="outline" onClick={requestFullscreen}><Maximize className="h-4 w-4" /></Button>
            )}
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Warning overlay */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-sm">
            <CardContent className="p-6 text-center space-y-3">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
              <p className="font-bold">{showWarning}</p>
              <p className="text-sm text-muted-foreground">عدد التحذيرات: {tabSwitches}</p>
              <Button onClick={() => setShowWarning(null)} className="w-full">فهمت</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="container max-w-4xl mx-auto p-4 space-y-4">
        {/* Question Navigator */}
        <Card>
          <CardContent className="p-3">
            <div className="flex gap-1.5 flex-wrap">
              {questions.map((q, i) => {
                const a = answers[q.id];
                const isAnswered = a && (a.selectedOptionIds.length > 0 || (a.answerText && a.answerText.trim().length > 0));
                const isFlagged = a?.flagged;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIdx(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                      i === currentIdx
                        ? "bg-primary text-primary-foreground scale-110 shadow-lg"
                        : isFlagged
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500"
                        : isAnswered
                        ? "bg-green-500/20 text-green-700 dark:text-green-300"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Question */}
        <QuestionView
          q={currentQ}
          state={answers[currentQ.id]}
          shuffleOptions={!!exam.shuffle_options}
          onChange={(patch) => { updateAnswer(currentQ.id, patch); queueSave(currentQ.id); }}
        />

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" disabled={currentIdx === 0} onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}>
            <ChevronRight className="h-4 w-4 ml-1" />السابق
          </Button>
          <Button
            variant={answers[currentQ.id]?.flagged ? "default" : "outline"}
            onClick={() => { updateAnswer(currentQ.id, { flagged: !answers[currentQ.id]?.flagged }); queueSave(currentQ.id); }}
          >
            <Flag className="h-4 w-4 ml-1" />{answers[currentQ.id]?.flagged ? "ملغى" : "مراجعة"}
          </Button>
          {currentIdx === questions.length - 1 ? (
            <Button onClick={() => setSubmitOpen(true)} className="bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 ml-1" />تسليم
            </Button>
          ) : (
            <Button onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}>
              التالي<ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تسليم الامتحان</AlertDialogTitle>
            <AlertDialogDescription>
              تم الإجابة على {answered} من {questions.length} سؤال.
              {answered < questions.length && <span className="block text-destructive mt-1">يوجد {questions.length - answered} سؤال بدون إجابة</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => doSubmit(false)}><CheckCircle2 className="h-4 w-4 ml-1" />نعم سلّم</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionView({ q, state, shuffleOptions, onChange }: {
  q: ExamQuestion;
  state?: AnswerState;
  shuffleOptions: boolean;
  onChange: (p: Partial<AnswerState>) => void;
}) {
  const opts = useMemo(() => {
    const o = q.options || [];
    if (!shuffleOptions) return o;
    return [...o].sort((a, b) => a.id.localeCompare(b.id));
  }, [q.options, shuffleOptions]);

  const selected = state?.selectedOptionIds || [];

  return (
    <Card className="shadow-mudrik">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline">{q.marks} درجة</Badge>
          <Badge variant="secondary">
            {q.question_type === "mcq" ? "اختيار من متعدد" :
             q.question_type === "true_false" ? "صح / خطأ" :
             q.question_type === "short_answer" ? "إجابة قصيرة" :
             q.question_type === "essay" ? "مقالي" : "فراغات"}
          </Badge>
        </div>
        <h2 className="text-lg font-bold leading-relaxed">{q.question_text}</h2>
        {q.image_url && <img src={q.image_url} alt="" className="rounded-xl max-h-64 object-contain mx-auto" />}

        {(q.question_type === "mcq" || q.question_type === "true_false") && (
          <div className="space-y-2">
            {opts.map((opt) => {
              const isSelected = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => onChange({ selectedOptionIds: [opt.id] })}
                  className={`w-full text-right p-4 rounded-2xl border-2 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-md scale-[1.01]"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
                    }`}>
                      {isSelected && <CheckCircle2 className="h-4 w-4" />}
                    </div>
                    <span className="flex-1">{opt.option_text}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {(q.question_type === "short_answer" || q.question_type === "fill_blank") && (
          <Input
            value={state?.answerText || ""}
            onChange={(e) => onChange({ answerText: e.target.value })}
            placeholder="اكتب إجابتك هنا..."
            className="text-base"
          />
        )}

        {q.question_type === "essay" && (
          <Textarea
            value={state?.answerText || ""}
            onChange={(e) => onChange({ answerText: e.target.value })}
            placeholder="اكتب إجابتك التفصيلية هنا..."
            rows={8}
            className="text-base"
          />
        )}
      </CardContent>
    </Card>
  );
}
