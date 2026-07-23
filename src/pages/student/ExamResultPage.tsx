import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Eye, ListChecks, Clock, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import StudentLayout from "@/components/student/StudentLayout";
import PostExamReviewChat from "@/features/modrek-ai/PostExamReviewChat";

export default function ExamResultPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const aiOpen = searchParams.get("ai") === "1";

  const [attempt, setAttempt] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [attemptsCount, setAttemptsCount] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [gradingTimedOut, setGradingTimedOut] = useState(false);
  const [retryingGrade, setRetryingGrade] = useState(false);

  const loadResult = async () => {
      const [{ data: a }, { data: e }] = await Promise.all([
        supabase.from("exam_attempts").select("*").eq("id", attemptId!).maybeSingle(),
        supabase.from("exams").select("*").eq("id", examId!).maybeSingle(),
      ]);
      setAttempt(a); setExam(e);

      if (a && e) {
        const { count } = await supabase
          .from("exam_attempts")
          .select("id", { count: "exact", head: true })
          .eq("exam_id", examId!)
          .eq("student_id", (a as any).student_id);
        if (typeof count === "number") setAttemptsCount(count);
      }
      setLoading(false);
  };

  useEffect(() => {
    loadResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, examId]);

  useEffect(() => {
    if (!attempt || attempt.is_graded) return;
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      loadResult();
      if (ticks >= 60) {
        window.clearInterval(timer);
        setGradingTimedOut(true);
      }
    }, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, attempt?.is_graded]);

  const retryGrading = async () => {
    if (!attemptId) return;
    setRetryingGrade(true);
    setGradingTimedOut(false);
    try {
      const { error } = await supabase.functions.invoke("grade-essay", { body: { attemptId } });
      if (error) throw error;
      toast.success("تم إعادة تشغيل التصحيح الذكي");
      await loadResult();
    } catch (e: any) {
      toast.error("تعذّر إعادة تشغيل التصحيح — سيقوم المعلم بمراجعة إجابتك");
      setGradingTimedOut(true);
    } finally {
      setRetryingGrade(false);
    }
  };

  const passed = attempt?.passed;
  const pct = Number(attempt?.percentage || 0);
  const timeMin = attempt?.time_spent_seconds ? Math.max(0, Math.floor(attempt.time_spent_seconds / 60)) : 0;

  if (loading) return <StudentLayout><div className="p-4 max-w-2xl mx-auto"><Skeleton className="h-[500px]" /></div></StudentLayout>;
  if (!attempt || !exam) return <StudentLayout><div className="p-8 text-center text-muted-foreground">النتيجة غير متاحة</div></StudentLayout>;

  return (
    <StudentLayout>
      <div className="container max-w-2xl mx-auto p-4 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/student/exams")} className="gap-2">
          <ArrowRight className="h-4 w-4" />الامتحانات
        </Button>

        <Card className="overflow-hidden">
          <div className={`p-8 text-center text-white ${passed ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-orange-500 to-red-600"}`}>
            <div className="text-6xl mb-2">{passed ? "🎉" : "📚"}</div>
            <h1 className="text-2xl font-extrabold mb-1">{passed ? "أحسنت! نجحت" : "حاول مرة أخرى"}</h1>
            <p className="opacity-90 text-sm">{exam.title}</p>
            <div className="mt-6 inline-block bg-white/20 backdrop-blur-md rounded-3xl px-8 py-4">
              <div className="text-5xl font-extrabold tabular-nums">{pct}%</div>
              <div className="text-sm mt-1 opacity-90">{attempt.total_score} / {attempt.max_score} درجة</div>
            </div>
          </div>

          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Tile icon={<ListChecks className="h-5 w-5" />} label="المحاولة" value={`#${attempt.attempt_number}`} />
              <Tile icon={<Clock className="h-5 w-5" />} label="الوقت" value={`${timeMin} د`} />
            </div>

            {!attempt.is_graded && !gradingTimedOut && (
              <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <CardContent className="p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 inline ml-1 text-blue-600" />
                  التصحيح الذكي للأسئلة المقالية يعمل الآن — يتم تحديث الدرجة تلقائياً بعد اكتماله
                </CardContent>
              </Card>
            )}

            {!attempt.is_graded && gradingTimedOut && (
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <CardContent className="p-3 text-sm space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                    <div>
                      استغرق التصحيح الذكي وقتاً أطول من المتوقع. لا تقلق — تم حفظ إجابتك وسيتم تحديث الدرجة تلقائياً بمجرد اكتمال التصحيح، أو سيقوم المعلم بمراجعتها.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1"
                    onClick={retryGrading}
                    disabled={retryingGrade}
                  >
                    <RefreshCw className={`h-3 w-3 ${retryingGrade ? "animate-spin" : ""}`} />
                    {retryingGrade ? "جاري إعادة المحاولة..." : "إعادة محاولة التصحيح الذكي"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Button
              variant="outline"
              className="w-full h-11"
              onClick={() => navigate(`/student/exams/${examId}/review/${attemptId}`)}
            >
              <Eye className="h-4 w-4 ml-1" />مراجعة الإجابات
            </Button>
          </CardContent>
        </Card>

        <PostExamReviewChat examId={examId!} attemptId={attemptId!} autoOpen={aiOpen} />
      </div>
    </StudentLayout>
  );
}

function Tile({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-muted/40 text-center">
      <div className="flex justify-center mb-1 text-primary">{icon}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold truncate">{value}</div>
    </div>
  );
}
