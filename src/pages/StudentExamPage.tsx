import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  XCircle,
  Trophy,
  ArrowRight,
  Loader2,
  Clock,
  ChevronLeft,
} from "lucide-react";
import type { ExamQuestion } from "@/components/exam/types";

type ExamPageState = {
  exam: {
    id: string;
    title: string;
    questions: ExamQuestion[];
    duration_minutes: number;
  };
  subjectName: string;
  subjectId: string;
};

const SESSION_KEY = "active_exam_session";

type SavedSession = {
  examId: string;
  currentIndex: number;
  answers: Record<number, string>;
  startTime: number;
  endTime: number;
};

const StudentExamPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const examState = location.state as ExamPageState | null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startTime] = useState(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitCalledRef = useRef(false);

  const exam = examState?.exam;
  const questions = exam?.questions || [];
  const subjectName = examState?.subjectName || "";
  const subjectId = examState?.subjectId || "";
  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex] || null;
  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;

  // Restore session from sessionStorage on mount
  useEffect(() => {
    if (!exam) return;

    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const session: SavedSession = JSON.parse(saved);
        if (session.examId === exam.id) {
          setCurrentIndex(session.currentIndex);
          setAnswers(session.answers);
          const remaining = Math.max(0, Math.floor((session.endTime - Date.now()) / 1000));
          setTimeLeft(remaining);
          return;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // New session
    const durationSeconds = (exam.duration_minutes || 30) * 60;
    setTimeLeft(durationSeconds);

    const session: SavedSession = {
      examId: exam.id,
      currentIndex: 0,
      answers: {},
      startTime: Date.now(),
      endTime: Date.now() + durationSeconds * 1000,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [exam]);

  // Save progress to sessionStorage
  useEffect(() => {
    if (!exam || isFinished) return;
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const session: SavedSession = JSON.parse(saved);
        if (session.examId === exam.id) {
          session.currentIndex = currentIndex;
          session.answers = answers;
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
      } catch {
        // Ignore
      }
    }
  }, [currentIndex, answers, exam, isFinished]);

  // Timer
  useEffect(() => {
    if (isFinished || !exam) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Auto-submit
          if (!submitCalledRef.current) {
            submitCalledRef.current = true;
            handleFinish();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinished, exam]);

  // Calculate results
  const calculateResults = useCallback(() => {
    let score = 0;
    const details: { index: number; correct: boolean; userAnswer: string; correctAnswer: string }[] = [];

    questions.forEach((q, i) => {
      const userAnswer = answers[i] || "";
      const isCorrect = userAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
      if (isCorrect) score++;
      details.push({
        index: i,
        correct: isCorrect,
        userAnswer,
        correctAnswer: q.correct_answer,
      });
    });

    return {
      score,
      total: questions.length,
      percentage: questions.length > 0 ? Math.round((score / questions.length) * 100) : 0,
      details,
    };
  }, [questions, answers]);

  // Save results to DB
  const saveResults = useCallback(
    async (results: { score: number; total: number }) => {
      if (!user || !exam || hasSaved) return;
      setIsSaving(true);
      setHasSaved(true);

      const timeTaken = Math.floor((Date.now() - startTime) / 1000);

      try {
        const { error } = await supabase.from("exam_attempts" as any).insert({
          exam_id: exam.id,
          student_id: user.id,
          answers,
          score: results.score,
          total: results.total,
          time_taken: timeTaken,
        } as any);

        if (error) {
          console.error("Error saving results:", error);
          toast({
            title: "تنبيه",
            description: "تم عرض النتيجة لكن فشل حفظها",
            variant: "destructive",
          });
        }
      } catch (e) {
        console.error("Error saving results:", e);
      } finally {
        setIsSaving(false);
        // Clear session
        sessionStorage.removeItem(SESSION_KEY);
      }
    },
    [user, exam, hasSaved, answers, startTime, toast]
  );

  const handleFinish = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsFinished(true);
  }, []);

  // Save when finished
  useEffect(() => {
    if (isFinished && !hasSaved && exam) {
      const results = calculateResults();
      saveResults(results);
    }
  }, [isFinished, hasSaved, exam, calculateResults, saveResults]);

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // No exam data
  if (!examState || !exam || questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <h2 className="text-lg font-semibold">لا يوجد امتحان</h2>
            <p className="text-muted-foreground mt-2">لم يتم تمرير بيانات الامتحان.</p>
            <Button className="mt-4" onClick={() => navigate(-1)}>
              رجوع
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle answer selection
  const handleAnswer = (answer: string) => {
    setAnswers((prev) => ({ ...prev, [currentIndex]: answer }));
  };

  // Go to next question (no going back)
  const goNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // Results screen
  if (isFinished) {
    const results = calculateResults();
    const passColor = results.percentage >= 50 ? "text-green-500" : "text-red-500";
    const passBg =
      results.percentage >= 50
        ? "bg-green-50 dark:bg-green-950/30"
        : "bg-red-50 dark:bg-red-950/30";

    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-2xl px-4 py-8">
          <Card className="mb-6 overflow-hidden">
            <div className={`p-6 text-center ${passBg}`}>
              <Trophy className={`h-16 w-16 mx-auto mb-4 ${passColor}`} />
              <h1 className="text-2xl font-bold text-foreground mb-1">نتيجة الامتحان</h1>
              <p className="text-muted-foreground">
                {exam.title} - {subjectName}
              </p>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-3xl font-bold text-primary">{results.score}</p>
                  <p className="text-sm text-muted-foreground">الإجابات الصحيحة</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">{results.total}</p>
                  <p className="text-sm text-muted-foreground">إجمالي الأسئلة</p>
                </div>
                <div>
                  <p className={`text-3xl font-bold ${passColor}`}>{results.percentage}%</p>
                  <p className="text-sm text-muted-foreground">النسبة المئوية</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Answers */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold">تفاصيل الإجابات</h2>
            {questions.map((q, i) => {
              const detail = results.details[i];
              const userAnswer = answers[i] || "لم تتم الإجابة";

              return (
                <Card
                  key={i}
                  className={`border-r-4 ${detail.correct ? "border-r-green-500" : "border-r-red-500"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 mt-0.5">
                        {detail.correct ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground mb-2">
                          {i + 1}. {q.question}
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">إجابتك: </span>
                          <span className={detail.correct ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {userAnswer}
                          </span>
                        </p>
                        {!detail.correct && (
                          <p className="text-sm mt-1">
                            <span className="text-muted-foreground">الإجابة الصحيحة: </span>
                            <span className="text-green-600 font-medium">{q.correct_answer}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Button className="w-full gap-2" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4" />
            رجوع للمادة
          </Button>

          {isSaving && (
            <div className="mt-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري حفظ النتيجة...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Exam-taking screen
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const isTimeLow = timeLeft <= 60;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl px-4 py-8">
        {/* Header with Timer */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-bold text-foreground">{exam.title}</h1>
              <p className="text-sm text-muted-foreground">{subjectName}</p>
            </div>
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold ${
                isTimeLow
                  ? "bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400 animate-pulse"
                  : "bg-muted text-foreground"
              }`}
            >
              <Clock className="h-5 w-5" />
              {formatTime(timeLeft)}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              السؤال {currentIndex + 1} من {totalQuestions}
            </span>
            <span className="text-sm font-medium text-primary">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question */}
        {currentQuestion && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="mb-1 text-xs text-muted-foreground">اختيار من متعدد</div>
              <h2 className="text-lg font-semibold text-foreground mb-6">{currentQuestion.question}</h2>

              <div className="space-y-3">
                {currentQuestion.options.map((option, oi) => {
                  const isSelected = answers[currentIndex] === option;
                  return (
                    <button
                      key={oi}
                      onClick={() => handleAnswer(option)}
                      className={`w-full text-right p-4 rounded-lg border-2 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-accent/50"
                      }`}
                    >
                      <span className="font-medium text-foreground">{option}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation - Forward only */}
        <div className="flex items-center justify-between gap-3">
          {/* Question indicators */}
          <div className="flex gap-1 flex-wrap justify-center max-w-[200px]">
            {questions.map((_, i) => (
              <div
                key={i}
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  i === currentIndex
                    ? "bg-primary scale-125"
                    : i < currentIndex
                    ? answers[i] !== undefined
                      ? "bg-primary/40"
                      : "bg-red-300"
                    : "bg-border"
                }`}
              />
            ))}
          </div>

          {isLastQuestion ? (
            <Button onClick={handleFinish} className="gap-2" variant="default">
              إنهاء الامتحان
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={goNext} className="gap-2">
              التالي
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentExamPage;
