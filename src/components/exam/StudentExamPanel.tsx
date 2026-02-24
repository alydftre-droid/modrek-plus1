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
  subjectId: string;
  subjectName: string;
};

const StudentExamPanel = ({ subjectId, subjectName }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [attempts, setAttempts] = useState<ExamAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch published exams for this subject
      const { data: examData, error: examErr } = await supabase
        .from("exams" as any)
        .select("*")
        .eq("subject_id", subjectId)
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (examErr) throw examErr;

      // Fetch student's attempts
      const { data: attemptData, error: attemptErr } = await supabase
        .from("exam_attempts" as any)
        .select("*")
        .eq("student_id", user.id)
        .order("submitted_at", { ascending: false });

      if (attemptErr) throw attemptErr;

      setExams((examData as any as ExamRow[]) || []);
      setAttempts((attemptData as any as ExamAttemptRow[]) || []);
    } catch (e) {
      console.error("Error fetching exam data:", e);
    } finally {
      setLoading(false);
    }
  }, [user, subjectId]);

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
    navigate("/student-exam", {
      state: {
        exam: {
          id: exam.id,
          title: exam.title,
          questions: exam.questions,
          duration_minutes: exam.duration_minutes,
        },
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
  const completedExamIds = new Set(attempts.map((a) => a.exam_id));

  // Get completed attempts with exam info
  const completedAttempts = attempts
    .filter((a) => exams.some((e) => e.id === a.exam_id))
    .map((a) => ({
      ...a,
      exam: exams.find((e) => e.id === a.exam_id)!,
    }));

  if (exams.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">لا يوجد امتحان حالياً</h3>
        <p className="text-muted-foreground">سيتم إعلامك عند توفر امتحان جديد</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Available Exams */}
      {availableExams.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            امتحانات متاحة
          </h2>
          {availableExams.map((exam) => {
            const attempted = hasAttempted(exam.id);
            const attempt = getAttempt(exam.id);

            return (
              <Card key={exam.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{exam.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                        <span>{exam.questions?.length || 0} سؤال</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {exam.duration_minutes} دقيقة
                        </span>
                        {exam.end_at && <span>ينتهي: {formatDate(exam.end_at)}</span>}
                      </div>
                    </div>

                    {attempted ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        تم الحل ({attempt?.score}/{attempt?.total})
                      </Badge>
                    ) : (
                      <Button onClick={() => handleStartExam(exam)} className="gap-2">
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
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            امتحانات قادمة
          </h2>
          {upcomingExams.map((exam) => (
            <Card key={exam.id} className="opacity-80">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{exam.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                      <span>{exam.questions?.length || 0} سؤال</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {exam.duration_minutes} دقيقة
                      </span>
                      <span>يبدأ: {formatDate(exam.start_at)}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="gap-1">
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
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            نتائجي السابقة
          </h2>
          {completedAttempts.map((item) => {
            const percentage = item.total > 0 ? Math.round((item.score / item.total) * 100) : 0;
            const passed = percentage >= 50;

            return (
              <Card
                key={item.id}
                className={`border-r-4 ${passed ? "border-r-green-500" : "border-r-red-500"}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.exam?.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatDate(item.submitted_at)}
                        {item.time_taken > 0 && ` • ${Math.ceil(item.time_taken / 60)} دقيقة`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-center">
                        <p className={`text-2xl font-bold ${passed ? "text-green-600" : "text-red-600"}`}>
                          {percentage}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.score}/{item.total}
                        </p>
                      </div>
                      {passed ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-500" />
                      )}
                    </div>
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
