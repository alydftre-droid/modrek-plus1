import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trophy, ArrowRight, Eye, ListChecks,
  CheckCircle2, XCircle, HelpCircle, Clock, Calendar,
  BookOpen, Star, Sparkles, RotateCw,
} from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";
import PostExamReviewChat from "@/features/modrek-ai/PostExamReviewChat";

export default function ExamResultPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const aiOpen = searchParams.get("ai") === "1";

  const [attempt, setAttempt] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [questionStats, setQuestionStats] = useState<{ total: number; correct: number; wrong: number; unanswered: number }>({ total: 0, correct: 0, wrong: 0, unanswered: 0 });
  const [attemptsCount, setAttemptsCount] = useState<number>(1);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: e }] = await Promise.all([
        supabase.from("exam_attempts").select("*").eq("id", attemptId!).maybeSingle(),
        supabase.from("exams").select("*").eq("id", examId!).maybeSingle(),
      ]);
      setAttempt(a); setExam(e);

      if ((e as any)?.subject_id) {
        const { data: s } = await supabase.from("subjects").select("name_ar").eq("id", (e as any).subject_id).maybeSingle();
        setSubjectName((s as any)?.name_ar || null);
      }

      if (a && e) {
        // Question stats (real questions only, excluding "section" rows)
        const { data: qs } = await supabase
          .from("exam_questions")
          .select("id, question_type")
          .eq("exam_id", examId!);
        const realQs = (qs || []).filter((q: any) => q.question_type !== "section");
        const { data: ans } = await supabase
          .from("exam_answers")
          .select("question_id, is_correct")
          .eq("attempt_id", attemptId!);
        const answeredIds = new Set((ans || []).map((x: any) => x.question_id));
        const correct = (ans || []).filter((x: any) => x.is_correct === true).length;
        const wrong = (ans || []).filter((x: any) => x.is_correct === false).length;
        const unanswered = realQs.filter((q: any) => !answeredIds.has(q.id)).length;
        setQuestionStats({ total: realQs.length, correct, wrong, unanswered });

        // Total attempts count for this student on this exam
        const { count } = await supabase
          .from("exam_attempts")
          .select("id", { count: "exact", head: true })
          .eq("exam_id", examId!)
          .eq("student_id", (a as any).student_id);
        if (typeof count === "number") setAttemptsCount(count);

        // Rank
        try {
          const { data: lb } = await supabase.rpc("get_exam_leaderboard", { _exam_id: examId!, _limit: 200 } as any);
          const idx = (lb as any[])?.findIndex((r: any) => r.student_id === (a as any).student_id);
          if (idx !== undefined && idx >= 0) setRank(idx + 1);
        } catch { /* ignore */ }
      }
      setLoading(false);
    })();
  }, [attemptId, examId]);

  const isTraining = (exam as any)?.source === "modrek_ai";
  const passed = attempt?.passed;
  const pct = Number(attempt?.percentage || 0);
  const timeMin = attempt?.time_spent_seconds ? Math.max(0, Math.floor(attempt.time_spent_seconds / 60)) : 0;
  const timeSec = attempt?.time_spent_seconds ? attempt.time_spent_seconds % 60 : 0;
  const canRetry = useMemo(() => {
    if (!exam || !attempt) return false;
    if (isTraining) return true; // training exams can always be retried
    return attemptsCount < Number((exam as any).max_attempts || 1);
  }, [exam, attempt, attemptsCount, isTraining]);

  const submittedDate = attempt?.submitted_at
    ? new Date(attempt.submitted_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const createdDate = (exam as any)?.created_at
    ? new Date((exam as any).created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  if (loading) return <StudentLayout><div className="p-4 max-w-2xl mx-auto"><Skeleton className="h-[500px]" /></div></StudentLayout>;
  if (!attempt || !exam) return <StudentLayout><div className="p-8 text-center text-muted-foreground">النتيجة غير متاحة</div></StudentLayout>;

  return (
    <StudentLayout>
      <div className="container max-w-2xl mx-auto p-4 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/student/exams")} className="gap-2">
          <ArrowRight className="h-4 w-4" />الامتحانات
        </Button>

        {/* Hero card */}
        <Card className="overflow-hidden">
          <div className={`p-8 text-center text-white ${passed ? "bg-gradient-to-br from-green-500 to-emerald-600" : "bg-gradient-to-br from-orange-500 to-red-600"}`}>
            <div className="text-6xl mb-2">{passed ? "🎉" : "📚"}</div>
            <h1 className="text-2xl font-extrabold mb-1">{passed ? "أحسنت! نجحت" : "حاول مرة أخرى"}</h1>
            <p className="opacity-90 text-sm">{exam.title}</p>
            {subjectName && <p className="opacity-80 text-xs mt-1">المادة: {subjectName}</p>}
            <div className="mt-6 inline-block bg-white/20 backdrop-blur-md rounded-3xl px-8 py-4">
              <div className="text-5xl font-extrabold tabular-nums">{pct}%</div>
              <div className="text-sm mt-1 opacity-90">{attempt.total_score} / {attempt.max_score} درجة</div>
            </div>
          </div>

          <CardContent className="p-5 space-y-4">
            {/* Answers stats */}
            <div className="grid grid-cols-3 gap-3">
              <Tile icon={<CheckCircle2 className="h-5 w-5" />} label="صحيحة" value={String(questionStats.correct)} tone="green" />
              <Tile icon={<XCircle className="h-5 w-5" />} label="خاطئة" value={String(questionStats.wrong)} tone="red" />
              <Tile icon={<HelpCircle className="h-5 w-5" />} label="بدون إجابة" value={String(questionStats.unanswered)} tone="amber" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Tile icon={<ListChecks className="h-5 w-5" />} label="عدد الأسئلة" value={String(questionStats.total)} />
              <Tile icon={<Star className="h-5 w-5" />} label="الدرجة الكلية" value={String(exam.total_marks)} />
              <Tile icon={<BookOpen className="h-5 w-5" />} label="المادة" value={subjectName || "—"} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Tile icon={<Clock className="h-5 w-5" />} label="زمن الحل" value={`${timeMin} د ${timeSec ? `${timeSec} ث` : ""}`} />
              <Tile icon={<ListChecks className="h-5 w-5" />} label="المحاولة" value={`#${attempt.attempt_number} / ${exam.max_attempts || attemptsCount}`} />
              <Tile icon={<Trophy className="h-5 w-5" />} label="ترتيبك" value={rank ? `#${rank}` : "—"} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Tile icon={<Calendar className="h-5 w-5" />} label="تاريخ الإنشاء" value={createdDate} />
              <Tile icon={<Calendar className="h-5 w-5" />} label="تاريخ الحل" value={submittedDate} />
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

            {/* Action buttons — clear three-way choice */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => navigate(`/student/exams/${examId}/review/${attemptId}`)}
              >
                <Eye className="h-4 w-4 ml-1" />مراجعة الإجابات
              </Button>
              <Button
                className="h-11 bg-gradient-to-r from-primary to-purple-600 text-white border-0"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set("ai", "1");
                  setSearchParams(next, { replace: true });
                  setTimeout(() => {
                    document.getElementById("ai-review-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);
                }}
              >
                <Sparkles className="h-4 w-4 ml-1" />ابدأ المراجعة مع Modrek AI
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => navigate(`/student/exams/${examId}/leaderboard`)}
              >
                <Trophy className="h-4 w-4 ml-1" />الترتيب
              </Button>
            </div>

            {canRetry && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate(isTraining ? `/student/exams/${examId}` : `/student/exams/${examId}`)}
              >
                <RotateCw className="h-4 w-4 ml-1" />إعادة حل الامتحان
              </Button>
            )}
          </CardContent>
        </Card>

        <div id="ai-review-anchor" />
        <PostExamReviewChat examId={examId!} attemptId={attemptId!} autoOpen={aiOpen} />
      </div>
    </StudentLayout>
  );
}

function Tile({ icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "green" | "red" | "amber" }) {
  const toneClass =
    tone === "green" ? "text-green-600" :
    tone === "red" ? "text-red-600" :
    tone === "amber" ? "text-amber-600" : "text-primary";
  return (
    <div className="p-3 rounded-xl bg-muted/40 text-center">
      <div className={`flex justify-center mb-1 ${toneClass}`}>{icon}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold truncate">{value}</div>
    </div>
  );
}
