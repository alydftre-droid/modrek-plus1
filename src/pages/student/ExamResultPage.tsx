import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, ArrowRight, Eye, BarChart3, ListChecks, CheckCircle2, XCircle } from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";

export default function ExamResultPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from("exam_attempts").select("*").eq("id", attemptId!).maybeSingle();
      const { data: e } = await supabase.from("exams").select("*").eq("id", examId!).maybeSingle();
      setAttempt(a); setExam(e);
      if (a) {
        const { data: lb } = await supabase.rpc("get_exam_leaderboard", { _exam_id: examId!, _limit: 200 } as any);
        const idx = (lb as any[])?.findIndex(r => r.student_id === a.student_id);
        if (idx !== undefined && idx >= 0) setRank(idx + 1);
      }
      setLoading(false);
    })();
  }, [attemptId, examId]);

  if (loading) return <StudentLayout><div className="p-4 max-w-2xl mx-auto"><Skeleton className="h-96" /></div></StudentLayout>;
  if (!attempt || !exam) return <StudentLayout><div className="p-8 text-center text-muted-foreground">النتيجة غير متاحة</div></StudentLayout>;

  const passed = attempt.passed;
  const pct = Number(attempt.percentage);

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
            <div className="grid grid-cols-3 gap-3">
              <Tile icon={<Trophy className="h-5 w-5" />} label="ترتيبك" value={rank ? `#${rank}` : "—"} />
              <Tile icon={<ListChecks className="h-5 w-5" />} label="المحاولة" value={`#${attempt.attempt_number}`} />
              <Tile icon={<BarChart3 className="h-5 w-5" />} label="الوقت" value={`${Math.floor(attempt.time_spent_seconds / 60)} د`} />
            </div>

            {attempt.tab_switch_count > 0 && (
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <CardContent className="p-3 flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-amber-600" />
                  تم رصد {attempt.tab_switch_count} محاولة تبديل تبويب أثناء الامتحان
                </CardContent>
              </Card>
            )}

            {!attempt.is_graded && (
              <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <CardContent className="p-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 inline ml-1 text-blue-600" />
                  بعض الأسئلة تحتاج تصحيح من المعلم — ستظهر الدرجة النهائية لاحقاً
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-2">
              {exam.show_correct_answers && (
                <Button variant="outline" onClick={() => navigate(`/student/exams/${examId}/review/${attemptId}`)}>
                  <Eye className="h-4 w-4 ml-1" />مراجعة الإجابات
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate(`/student/exams/${examId}/leaderboard`)}>
                <Trophy className="h-4 w-4 ml-1" />الترتيب
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
}

function Tile({ icon, label, value }: any) {
  return (
    <div className="p-3 rounded-xl bg-muted/40 text-center">
      <div className="flex justify-center mb-1 text-primary">{icon}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
