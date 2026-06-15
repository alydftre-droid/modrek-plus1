import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamAttemptRow } from "./types";
import {
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Trophy,
  Loader2,
  Play,
  Lock,
} from "lucide-react";

type Props = {
  groupId: string;
  isSubscribed: boolean;
  currentTerm?: string;
  subjectId: string;
  subjectName: string;
};

const StudentExamPanel = ({ subjectId, subjectName, groupId, isSubscribed, currentTerm }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<ExamAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user || !groupId) return;
    setLoading(true);
    try {
      let examQuery = supabase
        .from("exams" as any)
        .select("*")
        .eq("subject_id", subjectId)
        .eq("group_id", groupId)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (currentTerm) {
        examQuery = examQuery.eq("term", currentTerm);
      }

      const { data: examData, error: examErr } = await examQuery;

      if (examErr) throw examErr;

      const examIds = ((examData as any as ExamRow[]) || []).map((exam) => exam.id);

      let attemptData: ExamAttemptRow[] = [];
      if (examIds.length > 0) {
        const { data, error: attemptErr } = await supabase
          .from("exam_attempts" as any)
          .select("*")
          .eq("student_id", user.id)
          .in("exam_id", examIds)
          .order("submitted_at", { ascending: false });

        if (attemptErr) throw attemptErr;
        attemptData = (data as any as ExamAttemptRow[]) || [];
      }

      setExams((examData as any as ExamRow[]) || []);
      setAttempts(attemptData);
    } catch (e) {
      console.error("Error fetching exam data:", e);
    } finally {
      setLoading(false);
    }
  }, [currentTerm, groupId, subjectId, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const now = new Date();

  const isExamAvailable = (exam: ExamRow) => {
    if (exam.start_at && new Date(exam.start_at) > now) return false;
    if (exam.end_at && new Date(exam.end_at) < now) return false;
    return true;
  };

  const hasAttempted = (examId: string) => {
    return attempts.some((a) => a.exam_id === examId);
  };

  const getAttempt = (examId: string) => {
    return attempts.find((a) => a.exam_id === examId);
  };

  const getExamStatus = (exam: ExamRow) => {
    if (hasAttempted(exam.id)) return "completed";
    if (!isExamAvailable(exam)) {
      if (exam.start_at && new Date(exam.start_at) > now) return "upcoming";
      return "expired";
    }
    return "available";
  };

  const handleStartExam = (exam: ExamRow) => {
    if (!isSubscribed) return;

    navigate("/student-exam", {
      state: {
        exam: {
          id: exam.id,
          title: exam.title,
          questions: exam.questions,
          duration_minutes: exam.duration_minutes,
        },
        groupId,
        subjectName,
        subjectId,
      },
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Separate exams by status
  const availableExams = exams.filter((e) => getExamStatus(e) === "available");
  const upcomingExams = exams.filter((e) => getExamStatus(e) === "upcoming");
  // Get completed attempts with exam info
  const completedAttempts = attempts
    .filter((a) => exams.some((e) => e.id === a.exam_id))
    .map((a) => ({
      ...a,
      exam: exams.find((e) => e.id === a.exam_id)!,
    }));

  if (exams.length === 0) {
    return (
      <Card className="overflow-hidden border-dashed border-2">
        <CardContent className="p-10 text-center bg-gradient-to-b from-muted/30 to-transparent">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg mb-4">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-lg font-bold mb-1">لا يوجد امتحان حالياً</h3>
          <p className="text-sm text-muted-foreground">سيتم إعلامك عند توفر امتحان جديد</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!isSubscribed && (
        <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 ring-1 ring-amber-200/60">
          <CardContent className="p-5 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-2">
              <Lock className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="text-base font-bold mb-1">الامتحانات مقفولة</h3>
            <p className="text-sm text-muted-foreground">يجب الاشتراك في المجموعة لفتح الامتحانات.</p>
          </CardContent>
        </Card>
      )}

      {/* Available Exams */}
      {availableExams.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-1.5 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500" />
            <h2 className="text-base md:text-lg font-extrabold flex items-center gap-2">
              <Play className="h-4 w-4 text-emerald-600" />
              امتحانات متاحة
            </h2>
          </div>
          {availableExams.map((exam) => {
            const attempted = hasAttempted(exam.id);
            const attempt = getAttempt(exam.id);

            return (
              <Card
                key={exam.id}
                className="overflow-hidden border-0 shadow-md ring-1 ring-emerald-200/50 hover:shadow-xl hover:ring-emerald-300 transition-all duration-300 bg-card"
              >
                <div className="relative h-1.5 bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground leading-tight">{exam.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                          <FileText className="h-3 w-3" />
                          {exam.questions?.length || 0} سؤال
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                          <Clock className="h-3 w-3" />
                          {exam.duration_minutes} دقيقة
                        </span>
                        {exam.end_at && (
                          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                            ينتهي: {formatDate(exam.end_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5">
                    {attempted ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 px-3 py-2.5 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        تم الحل ({attempt?.score}/{attempt?.total})
                      </div>
                    ) : (
                      <Button
                        onClick={() => handleStartExam(exam)}
                        disabled={!isSubscribed}
                        className="w-full gap-2 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold shadow-md hover:shadow-lg transition-all"
                      >
                        <Play className="h-4 w-4" />
                        ابدأ الامتحان
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Upcoming Exams */}
      {upcomingExams.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-1.5 rounded-full bg-gradient-to-b from-slate-400 to-slate-500" />
            <h2 className="text-base md:text-lg font-extrabold flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              امتحانات قادمة
            </h2>
          </div>
          {upcomingExams.map((exam) => (
            <Card key={exam.id} className="overflow-hidden border-0 shadow-sm ring-1 ring-slate-200/60 opacity-90">
              <div className="relative h-1 bg-gradient-to-l from-slate-300 to-slate-400" />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="shrink-0 h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground leading-tight">{exam.title}</h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5 flex-wrap">
                        <span>{exam.questions?.length || 0} سؤال</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {exam.duration_minutes} دقيقة
                        </span>
                        <span className="text-indigo-700 dark:text-indigo-400 font-medium">
                          يبدأ: {formatDate(exam.start_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="gap-1 shrink-0">
                    <Lock className="h-3 w-3" />
                    قريباً
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Completed Exams / Results History */}
      {completedAttempts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-1.5 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />
            <h2 className="text-base md:text-lg font-extrabold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-indigo-600" />
              نتائجي السابقة
            </h2>
          </div>
          {completedAttempts.map((item) => {
            const percentage = item.total > 0 ? Math.round((item.score / item.total) * 100) : 0;
            const passed = percentage >= 50;
            const tone = passed ? "from-emerald-500 to-teal-500" : "from-rose-500 to-red-500";
            const scoreTone = passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

            return (
              <Card key={item.id} className="overflow-hidden border-0 shadow-md ring-1 ring-border/60 hover:shadow-lg transition-shadow">
                <div className={`relative h-1.5 bg-gradient-to-l ${tone}`} />
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br ${tone} flex items-center justify-center shadow-sm`}>
                        {passed ? (
                          <CheckCircle2 className="h-5 w-5 text-white" />
                        ) : (
                          <XCircle className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground leading-tight truncate">{item.exam?.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(item.submitted_at)}
                          {item.time_taken > 0 && ` • ${Math.ceil(item.time_taken / 60)} دقيقة`}
                        </p>
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <p className={`text-2xl font-extrabold leading-none ${scoreTone}`}>{percentage}%</p>
                      <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                        {item.score}/{item.total}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-l ${tone} transition-all duration-700`}
                      style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
};

export default StudentExamPanel;
