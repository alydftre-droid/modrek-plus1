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
  CircleDot, ToggleLeft, FileEdit, Star, TrendingDown,
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

  const examState = location.state as { exam: ExamData; groupId?: string; subjectName: string; subjectId: string } | null;

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

  useEffect(() => {
    const verifyAccess = async () => {
      if (!user || !examState?.exam?.id) return;

      const { data: examRow, error: examError } = await supabase
        .from("exams" as any)
        .select("id, is_published, group_id")
        .eq("id", examState.exam.id)
        .maybeSingle();

      if (examError || !examRow || !examRow.is_published) {
        toast({ title: "غير متاح", description: "هذا الامتحان غير متاح الآن", variant: "destructive" });
        navigate(-1);
        return;
      }

      const targetGroupId = examRow.group_id || examState.groupId;
      if (!targetGroupId) {
        toast({ title: "خطأ", description: "تعذر تحديد مجموعة الامتحان", variant: "destructive" });
        navigate(-1);
        return;
      }

      const { data: purchaseRow } = await supabase
        .from("student_group_purchases")
        .select("id")
        .eq("student_id", user.id)
        .eq("group_id", targetGroupId)
        .maybeSingle();

      if (!purchaseRow) {
        toast({ title: "غير مصرح", description: "لا يمكن حل الامتحان إلا بعد الاشتراك في هذه المجموعة", variant: "destructive" });
        navigate(-1);
      }
    };

    void verifyAccess();
  }, [examState, navigate, toast, user]);

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
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
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
      let objScore = 0;
      const essayQuestions: { index: number; question: string; studentAnswer: string; modelAnswer: string; maxPoints: number }[] = [];

      questions.forEach((q, i) => {
        const studentAnswer = answers[i] || "";
        if (q.type === "essay") {
          essayQuestions.push({
            index: i, question: q.question, studentAnswer,
            modelAnswer: q.model_answer || "", maxPoints: q.points || 1,
          });
        } else {
          if (studentAnswer.trim() === q.correct_answer.trim()) objScore += q.points || 1;
        }
      });

      let finalEssayScores: Record<string, number> = {};
      let finalEssayFeedback: Record<string, string> = {};

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
        } catch (e) { console.error("Essay grading error:", e); }
        setGradingEssays(false);
      }

      setScore(objScore);
      setTotal(totalPoints);
      setEssayScores(finalEssayScores);
      setEssayFeedback(finalEssayFeedback);

      if (user) {
        const timeTaken = (exam.duration_minutes * 60) - timeLeft;
        await supabase.from("exam_attempts" as any).insert({
          exam_id: exam.id, student_id: user.id, answers,
          score: objScore, total: totalPoints,
          essay_scores: finalEssayScores, essay_feedback: finalEssayFeedback,
          time_taken: timeTaken, is_graded: true,
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

  const getQuestionTypeIcon = (type: string) => {
    if (type === "mcq") return <CircleDot className="h-4 w-4 text-blue-500" />;
    if (type === "true_false") return <ToggleLeft className="h-4 w-4 text-amber-500" />;
    return <FileEdit className="h-4 w-4 text-purple-500" />;
  };

  // ====== RESULTS VIEW ======
  if (viewMode === "results") {
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = percentage >= 50;
    const excellent = percentage >= 85;

    // Analyze strengths/weaknesses
    const mcqCorrect = questions.filter((q, i) => q.type !== "essay" && (answers[i] || "").trim() === q.correct_answer.trim()).length;
    const mcqTotal = questions.filter(q => q.type !== "essay").length;

    return (
      <div className="min-h-screen select-none" dir="rtl"
        style={{ background: "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--accent)) 100%)" }}>
        
        {/* Header */}
        <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-xl">
          <div className="container flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <span className="font-bold">نتيجة الامتحان</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>العودة</Button>
          </div>
        </header>

        <main className="container px-4 py-8 max-w-3xl mx-auto space-y-6">
          {/* Score Hero */}
          <Card className="overflow-hidden">
            <div className={`p-8 text-center ${excellent ? "bg-gradient-to-br from-yellow-50 via-green-50 to-emerald-50 dark:from-yellow-900/10 dark:via-green-900/10 dark:to-emerald-900/10" : passed ? "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10" : "bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/10 dark:to-orange-900/10"}`}>
              <div className={`inline-flex items-center justify-center w-28 h-28 rounded-full mb-4 ${
                excellent ? "bg-gradient-to-br from-yellow-400 to-green-500 shadow-xl shadow-green-500/20"
                : passed ? "bg-gradient-to-br from-green-400 to-emerald-500 shadow-xl shadow-green-500/20"
                : "bg-gradient-to-br from-red-400 to-orange-500 shadow-xl shadow-red-500/20"
              }`}>
                {excellent ? <Star className="h-14 w-14 text-white" /> :
                  passed ? <Trophy className="h-14 w-14 text-white" /> :
                  <TrendingDown className="h-14 w-14 text-white" />}
              </div>

              <h1 className="text-2xl font-bold mb-1">{exam.title}</h1>
              <p className={`text-6xl font-black my-3 ${excellent ? "text-yellow-600" : passed ? "text-green-600" : "text-red-600"}`}>
                {percentage}%
              </p>
              <p className="text-lg text-muted-foreground font-medium">{score} من {total} نقطة</p>

              <div className="flex items-center justify-center gap-3 mt-4">
                <Badge className={`text-sm px-4 py-1.5 ${
                  excellent ? "bg-gradient-to-r from-yellow-500 to-green-500" :
                  passed ? "bg-green-600" : "bg-red-600"
                } text-white border-0`}>
                  {excellent ? "⭐ ممتاز" : passed ? "✓ ناجح" : "✗ يحتاج تحسين"}
                </Badge>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 divide-x divide-x-reverse border-t">
              <div className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{mcqCorrect}/{mcqTotal}</p>
                <p className="text-xs text-muted-foreground mt-0.5">الأسئلة الموضوعية</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{answeredCount}/{questions.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">الأسئلة المُجابة</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {Math.ceil(((exam.duration_minutes * 60) - timeLeft) / 60)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">دقيقة</p>
              </div>
            </div>
          </Card>

          {/* Questions Review */}
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            مراجعة الأسئلة
          </h2>

          <div className="space-y-3">
            {questions.map((q, i) => {
              const studentAnswer = answers[i] || "";
              const isEssay = q.type === "essay";
              const isCorrect = !isEssay && studentAnswer.trim() === q.correct_answer.trim();
              const essayScore = essayScores[String(i)];
              const feedback = essayFeedback[String(i)];
              const unanswered = !studentAnswer.trim();

              return (
                <Card key={i} className={`overflow-hidden ${
                  isEssay ? (essayScore !== undefined ? (essayScore > 0 ? "ring-1 ring-green-300" : "ring-1 ring-red-300") : "")
                  : unanswered ? "ring-1 ring-amber-300" : (isCorrect ? "ring-1 ring-green-300" : "ring-1 ring-red-300")
                }`}>
                  <div className={`h-1 ${
                    isEssay ? (essayScore !== undefined ? (essayScore > 0 ? "bg-green-500" : "bg-red-500") : "bg-muted")
                    : unanswered ? "bg-amber-400" : (isCorrect ? "bg-green-500" : "bg-red-500")
                  }`} />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {getQuestionTypeIcon(q.type)}
                        <p className="font-semibold text-sm leading-relaxed">{q.question}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isEssay && !unanswered && (isCorrect
                          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                          : <XCircle className="h-5 w-5 text-red-500" />)}
                        {unanswered && <Badge variant="outline" className="text-[10px] text-amber-600">لم يُجب</Badge>}
                      </div>
                    </div>

                    {!isEssay && (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {q.options.map((opt, oi) => {
                          const isStudentChoice = studentAnswer === opt;
                          const isCorrectChoice = q.correct_answer === opt;
                          return (
                            <div key={oi} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                              isCorrectChoice ? "bg-green-50 border border-green-300 dark:bg-green-900/20 font-medium" :
                              isStudentChoice ? "bg-red-50 border border-red-300 dark:bg-red-900/20" :
                              "bg-muted/50 border border-transparent"
                            }`}>
                              {isCorrectChoice && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                              {isStudentChoice && !isCorrectChoice && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                              <span>{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isEssay && (
                      <div className="space-y-2 text-sm">
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">إجابتك:</p>
                          <p>{studentAnswer || "لم يتم الإجابة"}</p>
                        </div>
                        {q.model_answer && (
                          <div className="bg-green-50 dark:bg-green-900/15 rounded-lg p-3 border border-green-200 dark:border-green-800">
                            <p className="text-xs text-green-600 mb-1 font-medium">نموذج الإجابة:</p>
                            <p>{q.model_answer}</p>
                          </div>
                        )}
                        {essayScore !== undefined && (
                          <div className="flex items-center gap-2 p-2 bg-accent rounded-lg">
                            <Badge variant="outline" className="font-bold">{essayScore}/{q.points || 1}</Badge>
                            {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center pt-4 pb-8">
            <Button size="lg" onClick={() => navigate(-1)} className="gap-2 px-8">
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
  const isMedTime = timeLeft < 300 && !isLowTime;

  return (
    <div className="min-h-screen select-none" dir="rtl"
      style={{ userSelect: "none", WebkitUserSelect: "none",
        background: "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--accent) / 0.3) 100%)" }}>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/90 backdrop-blur-xl shadow-sm">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-sm truncate max-w-[180px]">{exam.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-black transition-all ${
              isLowTime ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30"
              : isMedTime ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-primary/10 text-primary"
            }`}>
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
            <Badge variant="secondary" className="font-bold">
              {answeredCount}/{questions.length}
            </Badge>
          </div>
        </div>
        <div className={`h-1 transition-all ${isLowTime ? "bg-red-500" : isMedTime ? "bg-amber-400" : ""}`}>
          <Progress value={timePercent} className="h-1 rounded-none" />
        </div>
      </header>

      <div className="container px-4 py-6 flex gap-6 max-w-5xl mx-auto">
        {/* Sidebar */}
        <div className="hidden md:block w-52 shrink-0">
          <Card className="sticky top-20 shadow-lg">
            <CardContent className="p-4">
              <p className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wider">خريطة الأسئلة</p>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((q, i) => {
                  const answered = !!answers[i]?.trim();
                  const isCurrent = i === currentIndex;
                  return (
                    <button key={i} onClick={() => setCurrentIndex(i)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        isCurrent ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 shadow-md"
                        : answered ? "bg-green-500 text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:scale-105"
                      }`}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-green-500" />
                  <span className="text-muted-foreground">تم الحل ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-muted border" />
                  <span className="text-muted-foreground">لم يُحل ({questions.length - answeredCount})</span>
                </div>
              </div>

              {answeredCount === questions.length && (
                <Button onClick={() => setShowConfirmSubmit(true)}
                  className="w-full mt-4 gap-1.5 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20" size="sm">
                  <Send className="h-3.5 w-3.5" /> إنهاء الامتحان
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Question */}
        <div className="flex-1 min-w-0">
          {currentQ && (
            <Card className="mb-4 shadow-lg overflow-hidden">
              <div className={`h-1.5 ${
                currentQ.type === "mcq" ? "bg-blue-500" : currentQ.type === "true_false" ? "bg-amber-500" : "bg-purple-500"
              }`} />
              <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getQuestionTypeIcon(currentQ.type)}
                    <Badge variant="outline" className="text-xs font-bold">
                      السؤال {currentIndex + 1} من {questions.length}
                    </Badge>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 font-bold">
                    {currentQ.points || 1} نقطة
                  </Badge>
                </div>

                <h2 className="text-xl font-bold leading-relaxed text-foreground">{currentQ.question}</h2>

                {/* MCQ */}
                {currentQ.type === "mcq" && (
                  <div className="space-y-2.5">
                    {currentQ.options.map((opt, oi) => (
                      <button key={oi} onClick={() => setAnswer(opt)}
                        className={`w-full text-right px-5 py-4 rounded-xl border-2 transition-all duration-200 ${
                          answers[currentIndex] === opt
                            ? "border-primary bg-primary/10 shadow-md shadow-primary/10 scale-[1.01]"
                            : "border-border hover:border-primary/40 hover:bg-accent/50 hover:scale-[1.005]"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-black shrink-0 transition-all ${
                            answers[currentIndex] === opt
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          }`}>
                            {String.fromCharCode(1571 + oi)}
                          </div>
                          <span className="font-medium">{opt}</span>
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
                        className={`px-6 py-8 rounded-2xl border-2 text-center transition-all duration-200 ${
                          answers[currentIndex] === opt
                            ? opt === "صح" 
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20 shadow-lg shadow-green-500/10 scale-[1.02]"
                              : "border-red-500 bg-red-50 dark:bg-red-900/20 shadow-lg shadow-red-500/10 scale-[1.02]"
                            : "border-border hover:border-primary/50 hover:bg-accent/50 hover:scale-[1.01]"
                        }`}>
                        {opt === "صح"
                          ? <CheckCircle2 className={`h-10 w-10 mx-auto mb-2 ${answers[currentIndex] === opt ? "text-green-600" : "text-muted-foreground/50"}`} />
                          : <XCircle className={`h-10 w-10 mx-auto mb-2 ${answers[currentIndex] === opt ? "text-red-600" : "text-muted-foreground/50"}`} />}
                        <span className="text-lg font-black">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Essay */}
                {currentQ.type === "essay" && (
                  <Textarea value={answers[currentIndex] || ""} onChange={e => setAnswer(e.target.value)}
                    placeholder="اكتب إجابتك هنا بالتفصيل..." rows={7}
                    className="resize-none text-base leading-relaxed" dir="rtl" />
                )}
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0} className="gap-2 shadow-sm">
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>

            {/* Mobile nav */}
            <div className="md:hidden flex gap-1 overflow-x-auto max-w-[200px] py-1">
              {questions.map((_, i) => (
                <button key={i} onClick={() => setCurrentIndex(i)}
                  className={`w-7 h-7 shrink-0 rounded-lg text-xs font-bold transition-all ${
                    i === currentIndex ? "bg-primary text-primary-foreground shadow"
                    : answers[i]?.trim() ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                  }`}>{i + 1}</button>
              ))}
            </div>

            {currentIndex < questions.length - 1 ? (
              <Button onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
                className="gap-2 shadow-sm">
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => setShowConfirmSubmit(true)}
                className="gap-2 bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20">
                <Send className="h-4 w-4" /> إنهاء الامتحان
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Submit Confirmation */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <CardContent className="p-8 text-center space-y-5" dir="rtl">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-black">هل تريد إنهاء الامتحان؟</h3>
              <div className="text-muted-foreground space-y-1">
                <p>أجبت على <span className="font-bold text-foreground">{answeredCount}</span> من <span className="font-bold text-foreground">{questions.length}</span> سؤال</p>
                {answeredCount < questions.length && (
                  <p className="text-amber-600 font-medium">
                    ⚠️ لا يزال {questions.length - answeredCount} سؤال بدون إجابة
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirmSubmit(false)}>
                  العودة للامتحان
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الإنهاء ✓"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grading overlay */}
      {(submitting || gradingEssays) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Card className="max-w-sm w-full shadow-2xl">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <h3 className="text-lg font-black">
                {gradingEssays ? "جاري تصحيح الأسئلة المقالية..." : "جاري حفظ الإجابات..."}
              </h3>
              <p className="text-sm text-muted-foreground">يرجى الانتظار قليلاً</p>
              <div className="flex gap-1 justify-center">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudentExamPage;
