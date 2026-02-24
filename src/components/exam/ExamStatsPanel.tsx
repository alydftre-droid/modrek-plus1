import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion, ExamAttemptRow } from "./types";
import {
  Search,
  Users,
  BarChart3,
  Trophy,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Loader2,
  User,
  ArrowRight,
} from "lucide-react";

type Props = {
  subjectId: string;
};

type StudentProfile = {
  id: string;
  full_name: string | null;
  email?: string;
};

type AttemptWithExam = ExamAttemptRow & {
  exam?: ExamRow;
};

type StudentSummary = {
  student: StudentProfile;
  totalExams: number;
  avgScore: number;
  totalScore: number;
  totalPossible: number;
  attempts: AttemptWithExam[];
};

type ExamStats = {
  exam: ExamRow;
  attemptCount: number;
  avgScore: number;
  passRate: number;
  questionErrors: { index: number; question: string; errorCount: number; totalAttempts: number }[];
};

const ExamStatsPanel = ({ subjectId }: Props) => {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [allAttempts, setAllAttempts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StudentProfile>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Detail views
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptWithExam | null>(null);
  const [attemptExam, setAttemptExam] = useState<ExamRow | null>(null);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch exams for this subject
      const { data: examData } = await supabase
        .from("exams" as any)
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });

      const examsList = (examData as any as ExamRow[]) || [];
      setExams(examsList);

      if (examsList.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch all attempts for these exams
      const examIds = examsList.map((e) => e.id);
      const { data: attemptData } = await supabase
        .from("exam_attempts" as any)
        .select("*")
        .in("exam_id", examIds)
        .order("submitted_at", { ascending: false });

      const attemptsList = (attemptData as any[]) || [];
      setAllAttempts(attemptsList);

      // Fetch student profiles
      const studentIds = [...new Set(attemptsList.map((a) => a.student_id))];
      if (studentIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

        const profileMap: Record<string, StudentProfile> = {};
        (profileData || []).forEach((p: any) => {
          profileMap[p.id] = p;
        });
        setProfiles(profileMap);
      }
    } catch (e) {
      console.error("Error fetching stats:", e);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Compute overall stats
  const totalStudents = new Set(allAttempts.map((a) => a.student_id)).size;
  const totalAttempts = allAttempts.length;
  const overallAvg =
    totalAttempts > 0
      ? Math.round(allAttempts.reduce((sum, a) => sum + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / totalAttempts)
      : 0;
  const passCount = allAttempts.filter((a) => a.total > 0 && (a.score / a.total) * 100 >= 50).length;
  const passRate = totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0;

  // Compute per-exam stats
  const examStatsMap: Record<string, ExamStats> = {};
  exams.forEach((exam) => {
    const attempts = allAttempts.filter((a) => a.exam_id === exam.id);
    const avgScore =
      attempts.length > 0
        ? Math.round(attempts.reduce((s, a) => s + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) / attempts.length)
        : 0;
    const passed = attempts.filter((a) => a.total > 0 && (a.score / a.total) * 100 >= 50).length;

    // Find most-missed questions
    const questionErrors: ExamStats["questionErrors"] = [];
    if (exam.questions && attempts.length > 0) {
      exam.questions.forEach((q, idx) => {
        let errorCount = 0;
        attempts.forEach((a) => {
          const studentAnswer = a.answers?.[idx] || a.answers?.[String(idx)];
          if (studentAnswer && studentAnswer !== q.correct_answer) {
            errorCount++;
          } else if (!studentAnswer) {
            errorCount++; // didn't answer = wrong
          }
        });
        questionErrors.push({
          index: idx,
          question: q.question,
          errorCount,
          totalAttempts: attempts.length,
        });
      });
      questionErrors.sort((a, b) => b.errorCount - a.errorCount);
    }

    examStatsMap[exam.id] = {
      exam,
      attemptCount: attempts.length,
      avgScore,
      passRate: attempts.length > 0 ? Math.round((passed / attempts.length) * 100) : 0,
      questionErrors,
    };
  });

  // Student search & summary
  const getStudentSummaries = (): StudentSummary[] => {
    const studentMap: Record<string, ExamAttemptRow[]> = {};
    allAttempts.forEach((a) => {
      if (!studentMap[a.student_id]) studentMap[a.student_id] = [];
      studentMap[a.student_id].push(a);
    });

    return Object.entries(studentMap)
      .map(([studentId, attempts]) => {
        const student = profiles[studentId] || { id: studentId, full_name: "طالب غير معروف" };
        const totalScore = attempts.reduce((s, a) => s + a.score, 0);
        const totalPossible = attempts.reduce((s, a) => s + a.total, 0);
        const avgScore = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;

        const attemptsWithExam: AttemptWithExam[] = attempts.map((a) => ({
          ...a,
          exam: exams.find((e) => e.id === a.exam_id),
        }));

        return {
          student,
          totalExams: attempts.length,
          avgScore,
          totalScore,
          totalPossible,
          attempts: attemptsWithExam,
        };
      })
      .filter((s) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const name = (s.student.full_name || "").toLowerCase();
        const id = s.student.id.toLowerCase();
        return name.includes(q) || id.includes(q);
      })
      .sort((a, b) => b.avgScore - a.avgScore);
  };

  const studentSummaries = getStudentSummaries();

  // View a specific attempt's answers
  const openAttemptDetail = (attempt: AttemptWithExam) => {
    setSelectedAttempt(attempt);
    setAttemptExam(attempt.exam || exams.find((e) => e.id === attempt.exam_id) || null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{totalStudents}</p>
            <p className="text-xs text-muted-foreground">عدد الطلاب</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{totalAttempts}</p>
            <p className="text-xs text-muted-foreground">إجمالي المحاولات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{overallAvg}%</p>
            <p className="text-xs text-muted-foreground">متوسط الدرجات</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Trophy className="h-6 w-6 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold text-foreground">{passRate}%</p>
            <p className="text-xs text-muted-foreground">نسبة النجاح</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Exam Stats */}
      {exams.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            إحصائيات كل امتحان
          </h3>
          {exams.map((exam) => {
            const stats = examStatsMap[exam.id];
            if (!stats) return null;
            const isExpanded = expandedExamId === exam.id;

            return (
              <Card key={exam.id}>
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedExamId(isExpanded ? null : exam.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-foreground">{exam.title}</h4>
                        <Badge variant="outline">{stats.attemptCount} محاولة</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>متوسط: {stats.avgScore}%</span>
                        <span>نسبة النجاح: {stats.passRate}%</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>

                  {isExpanded && stats.questionErrors.length > 0 && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <h5 className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        أكثر الأسئلة خطأً
                      </h5>
                      {stats.questionErrors.slice(0, 5).map((qe) => {
                        const errorPercent = qe.totalAttempts > 0 ? Math.round((qe.errorCount / qe.totalAttempts) * 100) : 0;
                        return (
                          <div key={qe.index} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-foreground truncate max-w-[70%]">
                                س{qe.index + 1}: {qe.question}
                              </span>
                              <span className="text-destructive font-medium">{errorPercent}% أخطأوا</span>
                            </div>
                            <Progress value={errorPercent} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Student Search & List */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          بحث عن طالب
        </h3>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث باسم الطالب أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
            dir="rtl"
          />
        </div>

        {studentSummaries.length === 0 ? (
          <Card className="p-6 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {searchQuery ? "لا توجد نتائج" : "لم يقم أي طالب بحل امتحان بعد"}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {studentSummaries.map((s) => {
              const passed = s.avgScore >= 50;
              return (
                <Card
                  key={s.student.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedStudent(s)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-full bg-primary/10">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-foreground truncate">
                            {s.student.full_name || "بدون اسم"}
                          </h4>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{s.totalExams} امتحان</span>
                            <span>المتوسط: {s.avgScore}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={passed ? "default" : "destructive"}>
                          {s.totalScore}/{s.totalPossible}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Student Detail Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(o) => !o && setSelectedStudent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedStudent?.student.full_name || "طالب"}
            </DialogTitle>
          </DialogHeader>

          {selectedStudent && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{selectedStudent.totalExams}</p>
                    <p className="text-xs text-muted-foreground">عدد الامتحانات</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{selectedStudent.avgScore}%</p>
                    <p className="text-xs text-muted-foreground">المتوسط</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold text-foreground">
                      {selectedStudent.totalScore}/{selectedStudent.totalPossible}
                    </p>
                    <p className="text-xs text-muted-foreground">المجموع</p>
                  </CardContent>
                </Card>
              </div>

              {/* Attempts list */}
              <h4 className="font-semibold">الامتحانات</h4>
              <div className="space-y-2">
                {selectedStudent.attempts.map((a) => {
                  const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                  const passed = pct >= 50;
                  return (
                    <Card
                      key={a.id}
                      className={`cursor-pointer hover:shadow-md border-r-4 ${passed ? "border-r-green-500" : "border-r-red-500"}`}
                      onClick={() => openAttemptDetail(a)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h5 className="font-medium text-foreground truncate">
                              {a.exam?.title || "امتحان"}
                            </h5>
                            <p className="text-xs text-muted-foreground">
                              {new Date(a.submitted_at).toLocaleDateString("ar-EG", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                              {a.time_taken > 0 && ` • ${Math.ceil(a.time_taken / 60)} دقيقة`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${passed ? "text-green-600" : "text-red-600"}`}>
                              {pct}%
                            </span>
                            <span className="text-sm text-muted-foreground">
                              ({a.score}/{a.total})
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attempt Detail Dialog - Show answers */}
      <Dialog open={!!selectedAttempt} onOpenChange={(o) => !o && setSelectedAttempt(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              تفاصيل إجابات الطالب - {attemptExam?.title || "امتحان"}
            </DialogTitle>
          </DialogHeader>

          {selectedAttempt && attemptExam && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>الدرجة: {selectedAttempt.score}/{selectedAttempt.total}</span>
                <span>
                  النسبة:{" "}
                  {selectedAttempt.total > 0
                    ? Math.round((selectedAttempt.score / selectedAttempt.total) * 100)
                    : 0}
                  %
                </span>
                {selectedAttempt.time_taken > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.ceil(selectedAttempt.time_taken / 60)} دقيقة
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {attemptExam.questions.map((q, idx) => {
                  const studentAnswer =
                    selectedAttempt.answers?.[idx] || selectedAttempt.answers?.[String(idx)] || "";
                  const isCorrect = studentAnswer === q.correct_answer;

                  return (
                    <Card
                      key={idx}
                      className={`border-r-4 ${isCorrect ? "border-r-green-500" : "border-r-red-500"}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          {isCorrect ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                          )}
                          <p className="font-medium text-foreground">
                            {idx + 1}. {q.question}
                          </p>
                        </div>

                        <div className="grid gap-2 mr-7">
                          {q.options.map((opt, oi) => {
                            const isStudentChoice = opt === studentAnswer;
                            const isCorrectOption = opt === q.correct_answer;

                            let optClass = "p-2 rounded-md border text-sm ";
                            if (isCorrectOption) {
                              optClass += "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300";
                            } else if (isStudentChoice && !isCorrect) {
                              optClass += "bg-red-50 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300";
                            } else {
                              optClass += "bg-muted/30 border-border text-muted-foreground";
                            }

                            return (
                              <div key={oi} className={optClass}>
                                <div className="flex items-center gap-2">
                                  {isCorrectOption && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                                  {isStudentChoice && !isCorrect && <XCircle className="h-3 w-3 text-red-600" />}
                                  <span>{opt}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {!isCorrect && (
                          <p className="text-xs text-muted-foreground mr-7">
                            إجابة الطالب: <span className="text-red-600 font-medium">{studentAnswer || "لم يجب"}</span>
                            {" • "}
                            الإجابة الصحيحة: <span className="text-green-600 font-medium">{q.correct_answer}</span>
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamStatsPanel;
