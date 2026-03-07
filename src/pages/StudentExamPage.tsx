import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamQuestion } from "@/components/exam/types";
import {
  Clock, ChevronRight, ChevronLeft, CheckCircle2, XCircle,
  AlertTriangle, Trophy, Loader2, Send, BookOpen, RotateCcw,
} from "lucide-react";

type ExamData = {
  id: string;
  title: string;
  questions: ExamQuestion[];
  duration_minutes: number;
};

type ViewMode = "exam" | "results";

const StudentExamPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const examState = location.state as { exam: ExamData; subjectName: string; subjectId: string } | null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("exam");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // Results
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [essayScores, setEssayScores] = useState<Record<string, number>>({});
  const [essayFeedback, setEssayFeedback] = useState<Record<string, string>>({});
  const [gradingEssays, setGradingEssays] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Anti-cheat
  useEffect(() => {
    const blockCopy = (e: Event) => e.preventDefault();
    document.addEventListener("copy", blockCopy);
    document.addEventListener("cut", blockCopy);
    document.addEventListener("paste", blockCopy);
    document.addEventListener("contextmenu", blockCopy);

    return () => {
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("cut", blockCopy);
      document.removeEventListener("paste", blockCopy);
      document.removeEventListener("contextmenu", blockCopy);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (!examState || viewMode !== "exam") return;
    setTimeLeft(examState.exam.duration_minutes * 60);
  }, [examState, viewMode]);

  useEffect(() => {
    if (viewMode !== "exam" || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [viewMode, timeLeft > 0]);

  // Warn before leaving
  useEffect(() => {
    if (viewMode !== "exam") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [viewMode]);

  if (!examState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background" dir="rtl">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">لا يوجد امتحان</h1>
        <Button onClick={() => navigate(-1)}>الرجوع</Button>
      </div>
    );
  }

  const exam = examState.exam;
  const questions = exam.questions || [];
  const currentQ = questions[currentIndex];

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const setAnswer = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentIndex]: value }));
  };

  const answeredCount = Object.keys(answers).filter(k => answers[Number(k)]?.trim()).length;
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    setShowConfirmSubmit(false);

    try {
      // Grade objective questions
      let objScore = 0;
      const essayQuestions: { index: number; question: string; studentAnswer: string; modelAnswer: string; maxPoints: number }[] = [];

      questions.forEach((q, i) => {
        const studentAnswer = answers[i] || "";
        if (q.type === "essay") {
          essayQuestions.push({
            index: i,
            question: q.question,
            studentAnswer,
            modelAnswer: q.model_answer || "",
            maxPoints: q.points || 1,
          });
        } else {
          if (studentAnswer.trim() === q.correct_answer.trim()) {
            objScore += q.points || 1;
          }
        }
      });

      let finalEssayScores: Record<string, number> = {};
      let finalEssayFeedback: Record<string, string> = {};

      // Grade essays via AI
      if (essayQuestions.length > 0 && essayQuestions.some(eq => eq.studentAnswer.trim())) {
        setGradingEssays(true);
        try {
          const { data, error } = await supabase.functions.invoke("grade-essay", {
            body: { essays: essayQuestions.filter(eq => eq.studentAnswer.trim()) },
          });
          if (!error && data) {
            finalEssayScores = data.scores || {};
            finalEssayFeedback = data.feedback || {};
            Object.values(finalEssayScores).forEach(s => { objScore += s; });
          }
        } catch (e) {
          console.error("Essay grading error:", e);
        }
        setGradingEssays(false);
      }

      setScore(objScore);
      setTotal(totalPoints);
      setEssayScores(finalEssayScores);
      setEssayFeedback(finalEssayFeedback);

      // Save attempt
      if (user) {
        const timeTaken = (exam.duration_minutes * 60) - timeLeft;
        await supabase.from("exam_attempts" as any).insert({
          exam_id: exam.id,
          student_id: user.id,
          answers,
          score: objScore,
          total: totalPoints,
          essay_scores: finalEssayScores,
          essay_feedback: finalEssayFeedback,
          time_taken: timeTaken,
          is_graded: true,
        } as any);
      }

      setViewMode("results");
    } catch (e) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حفظ الإجابات", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ====== RESULTS VIEW ======
  if (viewMode === "results") {
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = percentage >= 50;

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 select-none" dir="rtl">
        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl">
          <div className="container flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-primary">نتيجة الامتحان</span>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)}>العودة</Button>
          </div>
        </header>

        <main className="container px-4 py-8 max-w-3xl mx-auto">
          {/* Score Card */}
          <Card className={`mb-8 border-2 ${passed ? "border-green-500" : "border-red-500"}`}>
            <CardContent className="p-8 text-center">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 ${
                passed ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
              }`}>
                {passed ? <Trophy className="h-12 w-12 text-green-600" /> : <XCircle className="h-12 w-12 text-red-600" />}
              </div>
              <h1 className="text-3xl font-bold mb-2">{exam.title}</h1>
              <p className={`text-5xl font-bold mb-2 ${passed ? "text-green-600" : "text-red-600"}`}>
                {percentage}%
              </p>
              <p className="text-lg text-muted-foreground">{score} من {total} نقطة</p>
              <Badge className={`mt-3 text-base px-4 py-1 ${passed ? "bg-green-600" : "bg-red-600"}`}>
                {passed ? "ناجح ✓" : "لم ينجح ✗"}
              </Badge>
            </CardContent>
          </Card>

          {/* Questions Review */}
          <h2 className="text-xl font-bold mb-4">مراجعة الأسئلة</h2>
          <div className="space-y-4">
            {questions.map((q, i) => {
              const studentAnswer = answers[i] || "";
              const isEssay = q.type === "essay";
              const isCorrect = !isEssay && studentAnswer.trim() === q.correct_answer.trim();
              const essayScore = essayScores[String(i)];
              const feedback = essayFeedback[String(i)];

              return (
                <Card key={i} className={`border-r-4 ${
                  isEssay ? (essayScore !== undefined ? (essayScore > 0 ? "border-r-green-500" : "border-r-red-500") : "border-r-muted")
                  : (isCorrect ? "border-r-green-500" : "border-r-red-500")
                }`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">
                        <span className="text-muted-foreground">س{i + 1}.</span> {q.question}
                      </p>
                      <Badge variant="outline" className="shrink-0">
                        {q.points || 1} نقطة
                      </Badge>
                    </div>

                    {/* MCQ / True-False Review */}
                    {!isEssay && (
                      <div className="space-y-2">
                        {q.options.map((opt, oi) => {
                          const isStudentChoice = studentAnswer === opt;
                          const isCorrectChoice = q.correct_answer === opt;
                          let cls = "border rounded-lg px-3 py-2 text-sm ";
                          if (isCorrectChoice) cls += "bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-600";
                          else if (isStudentChoice && !isCorrectChoice) cls += "bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-600";
                          else cls += "border-border";

                          return (
                            <div key={oi} className={cls}>
                              <div className="flex items-center gap-2">
                                {isCorrectChoice && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                                {isStudentChoice && !isCorrectChoice && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                                <span>{opt}</span>
                              </div>
                            </div>
                          );
                        })}
                        {!studentAnswer && <p className="text-sm text-red-500">لم يتم الإجابة</p>}
                      </div>
                    )}

                    {/* Essay Review */}
                    {isEssay && (
                      <div className="space-y-2">
                        <div className="bg-accent/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">إجابتك:</p>
                          <p className="text-sm">{studentAnswer || "لم يتم الإجابة"}</p>
                        </div>
                        {q.model_answer && (
                          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                            <p className="text-xs text-green-600 mb-1">نموذج الإجابة:</p>
                            <p className="text-sm">{q.model_answer}</p>
                          </div>
                        )}
                        {essayScore !== undefined && (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{essayScore}/{q.points || 1}</Badge>
                            {feedback && <p className="text-sm text-muted-foreground">{feedback}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Button size="lg" onClick={() => navigate(-1)} className="gap-2">
              <RotateCcw className="h-4 w-4" /> العودة للمادة
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ====== EXAM MODE ======
  const timePercent = exam.duration_minutes > 0 ? (timeLeft / (exam.duration_minutes * 60)) * 100 : 100;
  const isLowTime = timeLeft < 60;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 select-none" dir="rtl"
      style={{ userSelect: "none", WebkitUserSelect: "none" }}>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-xl">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm truncate max-w-[200px]">{exam.title}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
              isLowTime ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse" : "bg-accent"
            }`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
            <Badge variant="secondary">{answeredCount}/{questions.length}</Badge>
          </div>
        </div>
        <Progress value={timePercent} className="h-1" />
      </header>

      <div className="container px-4 py-6 flex gap-6 max-w-5xl mx-auto">
        {/* Question Navigation Sidebar */}
        <div className="hidden md:block w-48 shrink-0">
          <Card className="sticky top-20">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-3 font-medium">خريطة الأسئلة</p>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((_, i) => {
                  const answered = !!answers[i]?.trim();
                  const isCurrent = i === currentIndex;
                  return (
                    <button key={i} onClick={() => setCurrentIndex(i)}
                      className={`w-8 h-8 rounded-md text-xs font-bold transition-all ${
                        isCurrent ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                        : answered ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30" />
                  <span>تم الحل ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-muted" />
                  <span>لم يُحل ({questions.length - answeredCount})</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Question Area */}
        <div className="flex-1 min-w-0">
          {currentQ && (
            <Card className="mb-6">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    السؤال {currentIndex + 1} من {questions.length}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {currentQ.points || 1} نقطة • {currentQ.type === "mcq" ? "اختيار متعدد" : currentQ.type === "true_false" ? "صح وخطأ" : "مقالي"}
                  </Badge>
                </div>

                <h2 className="text-xl font-bold leading-relaxed">{currentQ.question}</h2>

                {/* MCQ */}
                {currentQ.type === "mcq" && (
                  <div className="space-y-3">
                    {currentQ.options.map((opt, oi) => (
                      <button key={oi} onClick={() => setAnswer(opt)}
                        className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all ${
                          answers[currentIndex] === opt
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:border-primary/50 hover:bg-accent"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                            answers[currentIndex] === opt ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                          }`}>
                            {String.fromCharCode(1571 + oi)}
                          </div>
                          <span>{opt}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* True/False */}
                {currentQ.type === "true_false" && (
                  <div className="grid grid-cols-2 gap-4">
                    {["صح", "خطأ"].map(opt => (
                      <button key={opt} onClick={() => setAnswer(opt)}
                        className={`px-6 py-6 rounded-xl border-2 text-center text-lg font-bold transition-all ${
                          answers[currentIndex] === opt
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 hover:bg-accent"
                        }`}>
                        {opt === "صح" ? <CheckCircle2 className={`h-8 w-8 mx-auto mb-2 ${answers[currentIndex] === opt ? "text-green-600" : "text-muted-foreground"}`} /> :
                          <XCircle className={`h-8 w-8 mx-auto mb-2 ${answers[currentIndex] === opt ? "text-red-600" : "text-muted-foreground"}`} />}
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Essay */}
                {currentQ.type === "essay" && (
                  <Textarea value={answers[currentIndex] || ""} onChange={e => setAnswer(e.target.value)}
                    placeholder="اكتب إجابتك هنا..." rows={6} className="resize-none text-base" dir="rtl" />
                )}
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0} className="gap-2">
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>

            {/* Mobile question nav */}
            <div className="md:hidden flex gap-1 overflow-x-auto max-w-[200px]">
              {questions.map((_, i) => (
                <button key={i} onClick={() => setCurrentIndex(i)}
                  className={`w-7 h-7 shrink-0 rounded text-xs font-bold ${
                    i === currentIndex ? "bg-primary text-primary-foreground"
                    : answers[i]?.trim() ? "bg-green-100 text-green-700 dark:bg-green-900/30"
                    : "bg-muted text-muted-foreground"
                  }`}>
                  {i + 1}
                </button>
              ))}
            </div>

            {currentIndex < questions.length - 1 ? (
              <Button onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))} className="gap-2">
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => setShowConfirmSubmit(true)} className="gap-2 bg-green-600 hover:bg-green-700">
                <Send className="h-4 w-4" /> إنهاء الامتحان
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Submit Confirmation */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6 text-center space-y-4" dir="rtl">
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
              <h3 className="text-xl font-bold">هل تريد إنهاء الامتحان؟</h3>
              <p className="text-muted-foreground">
                أجبت على {answeredCount} من {questions.length} سؤال
                {answeredCount < questions.length && (
                  <span className="text-amber-600 block mt-1">
                    لا يزال {questions.length - answeredCount} سؤال بدون إجابة
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirmSubmit(false)}>
                  العودة للامتحان
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الإنهاء"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grading overlay */}
      {(submitting || gradingEssays) && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <Card className="max-w-sm w-full">
            <CardContent className="p-8 text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <h3 className="text-lg font-bold">
                {gradingEssays ? "جاري تصحيح الأسئلة المقالية..." : "جاري حفظ الإجابات..."}
              </h3>
              <p className="text-sm text-muted-foreground">يرجى الانتظار</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudentExamPage;
