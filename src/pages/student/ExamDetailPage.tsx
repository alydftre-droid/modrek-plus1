import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamQuestions, useMyAttempts, useStartAttempt } from "@/hooks/useExams";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Clock, ListChecks, Trophy, ShieldAlert, Sparkles, Play, Eye } from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";
import { toast } from "sonner";

export default function ExamDetailPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { data: exam, isLoading } = useExam(examId);
  const { data: questions = [] } = useExamQuestions(examId);
  const { data: attempts = [] } = useMyAttempts(examId);
  const start = useStartAttempt();

  if (isLoading) {
    return <StudentLayout><div className="p-4 space-y-4 max-w-3xl mx-auto"><Skeleton className="h-40" /><Skeleton className="h-60" /></div></StudentLayout>;
  }
  if (!exam) {
    return <StudentLayout><div className="p-8 text-center text-muted-foreground">الامتحان غير موجود</div></StudentLayout>;
  }

  const submittedAttempts = attempts.filter(a => a.status !== "in_progress");
  const inProgress = attempts.find(a => a.status === "in_progress");
  const remaining = Math.max(0, exam.max_attempts - submittedAttempts.length);
  const canStart = remaining > 0 || !!inProgress;

  const now = Date.now();
  const startsAt = exam.start_at ? new Date(exam.start_at).getTime() : null;
  const endsAt = exam.end_at ? new Date(exam.end_at).getTime() : null;
  const tooEarly = startsAt && now < startsAt;
  const tooLate = endsAt && now > endsAt;

  const handleStart = async () => {
    try {
      const res = await start.mutateAsync(examId!);
      if (!res?.success) {
        toast.error(res?.error || "تعذّر بدء الامتحان");
        return;
      }
      navigate(`/student/exams/${examId}/take`);
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ");
    }
  };

  return (
    <StudentLayout>
      <div className="container mx-auto p-4 max-w-3xl space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowRight className="h-4 w-4" />رجوع
        </Button>

        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-mudrik relative">
            <div className="absolute inset-0 flex items-center px-6">
              <div className="text-white">
                <div className="flex items-center gap-2 mb-2">
                  {exam.is_ai_generated && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI</Badge>}
                  <Badge variant="secondary">{exam.difficulty === "easy" ? "سهل" : exam.difficulty === "hard" ? "صعب" : "متوسط"}</Badge>
                </div>
                <h1 className="text-2xl font-extrabold">{exam.title}</h1>
              </div>
            </div>
          </div>
          <CardContent className="p-6 space-y-4">
            {exam.description && <p className="text-muted-foreground">{exam.description}</p>}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile icon={<Clock className="h-4 w-4" />} label="المدة" value={`${exam.duration_minutes} د`} />
              <StatTile icon={<ListChecks className="h-4 w-4" />} label="الأسئلة" value={`${questions.length}`} />
              <StatTile icon={<Trophy className="h-4 w-4" />} label="المحاولات" value={`${remaining}/${exam.max_attempts}`} />
              <StatTile icon={<ShieldAlert className="h-4 w-4" />} label="درجة النجاح" value={`${exam.pass_marks}`} />
            </div>

            {exam.instructions && (
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <CardContent className="p-4 text-sm whitespace-pre-wrap">{exam.instructions}</CardContent>
              </Card>
            )}

            <Card className="bg-muted/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm">قواعد الامتحان</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1 text-muted-foreground">
                {exam.require_fullscreen && <div>• الامتحان يعمل في وضع ملء الشاشة</div>}
                {exam.prevent_tab_switch && <div>• تبديل التبويب يُسجَّل ويُعد محاولة غش</div>}
                {exam.prevent_copy_paste && <div>• النسخ واللصق مُعطّل</div>}
                <div>• يتم الحفظ التلقائي لإجاباتك</div>
                {exam.shuffle_questions && <div>• ترتيب الأسئلة يتغيّر لكل طالب</div>}
              </CardContent>
            </Card>

            {submittedAttempts.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">محاولاتك السابقة</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {submittedAttempts.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                      <div>
                        <div className="text-sm font-medium">محاولة #{a.attempt_number}</div>
                        <div className="text-xs text-muted-foreground">{new Date(a.submitted_at!).toLocaleString("ar")}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={a.passed ? "default" : "destructive"}>{a.percentage}%</Badge>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/student/exams/${examId}/result/${a.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Button
              size="lg"
              className="w-full gap-2"
              disabled={!canStart || !!tooEarly || !!tooLate || start.isPending || questions.length === 0}
              onClick={handleStart}
            >
              <Play className="h-5 w-5" />
              {inProgress ? "استكمل الامتحان" : tooEarly ? "لم يبدأ بعد" : tooLate ? "انتهى الامتحان" : remaining === 0 ? "استنفدت المحاولات" : questions.length === 0 ? "الامتحان فارغ" : "ابدأ الامتحان"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-muted/40 text-center">
      <div className="flex justify-center mb-1 text-primary">{icon}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-bold text-sm">{value}</div>
    </div>
  );
}
