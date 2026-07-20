import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamQuestions, useTeacherExamRoster } from "@/hooks/useExams";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Users, Trophy, Target, Clock, UserCheck, UserX, Eye, Sparkles } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function TeacherExamAnalyticsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: roster, isLoading } = useTeacherExamRoster(examId);
  const { data: questions = [] } = useExamQuestions(examId);

  const rows = roster?.rows || [];
  const solvedRows = rows.filter((row: any) => row.solved);
  const stats = roster?.stats || { enrolled: 0, solved: 0, absent: 0, average: 0, highest: 0, passCount: 0 };
  const passRate = stats.solved ? Math.round((stats.passCount / stats.solved) * 100) : 0;
  const avgTime = solvedRows.length ? Math.round(solvedRows.reduce((s: number, row: any) => s + Number(row.attempt?.time_spent_seconds || 0), 0) / solvedRows.length / 60) : 0;

  // Score distribution buckets
  const buckets = [
    { name: "0-25%", count: 0 }, { name: "26-50%", count: 0 },
    { name: "51-75%", count: 0 }, { name: "76-100%", count: 0 },
  ];
  solvedRows.forEach((row: any) => {
    const p = Number(row.attempt?.percentage || 0);
    const idx = p <= 25 ? 0 : p <= 50 ? 1 : p <= 75 ? 2 : 3;
    buckets[idx].count++;
  });

  return (
    <TeacherSidebarLayout title="تحليلات">
      <div className="container mx-auto p-4 max-w-6xl space-y-5 pb-24">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate("/teacher/exams")} className="gap-1"><ArrowRight className="h-4 w-4" />رجوع</Button>
          <Button onClick={() => navigate(`/teacher/exams/${examId}/attempts`)} className="gap-1"><Eye className="h-4 w-4" />كشف تفصيلي</Button>
        </div>

        <section className="rounded-3xl border bg-card overflow-hidden shadow-sm">
          <div className="bg-primary/10 p-5 md:p-7 space-y-2">
            <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />إحصائيات امتحان كاملة</Badge>
            <h1 className="text-2xl md:text-3xl font-black tracking-normal">{exam?.title}</h1>
            <p className="text-sm text-muted-foreground">متابعة الطلاب المشتركين، من حلّ ومن لم يحل، والدرجات النهائية لكل طالب.</p>
          </div>
        </section>

        {isLoading ? <Skeleton className="h-40" /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BigStat icon={<Users />} label="طلاب المجموعة" value={stats.enrolled || 0} />
              <BigStat icon={<UserCheck />} label="حلّوا الامتحان" value={stats.solved || 0} />
              <BigStat icon={<UserX />} label="لم يحلّوا" value={stats.absent || 0} />
              <BigStat icon={<Trophy />} label="نسبة النجاح" value={`${passRate}%`} />
            </div>

            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">توزيع الدرجات</CardTitle></CardHeader>
                <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={buckets}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">ملخص الامتحان</CardTitle></CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <SummaryLine label="متوسط الدرجة" value={`${stats.average || 0}%`} icon={<Target className="h-4 w-4" />} />
                  <SummaryLine label="أعلى درجة" value={`${stats.highest || 0}%`} icon={<Trophy className="h-4 w-4" />} />
                  <SummaryLine label="متوسط الوقت" value={`${avgTime} د`} icon={<Clock className="h-4 w-4" />} />
                  <SummaryLine label="عدد الأسئلة" value={questions.filter((q: any) => q.question_type !== "section").length} icon={<Target className="h-4 w-4" />} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">درجات الطلاب</CardTitle></CardHeader>
              <CardContent className="p-0 divide-y">
                {rows.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">لا يوجد طلاب مرتبطون بهذا الامتحان بعد.</div>
                ) : rows.map((row: any) => (
                  <div key={row.student_id} className="p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">{String(row.profile?.full_name || "ط").slice(0, 1)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black truncate">{row.profile?.full_name || "طالب"}</div>
                      <div className="text-xs text-muted-foreground">{row.solved ? "حل الامتحان" : row.in_progress ? "بدأ ولم يسلم" : "لم يحل"}</div>
                    </div>
                    <Badge variant={row.solved ? "default" : "outline"}>{row.attempt ? `${row.attempt.percentage || 0}%` : "غياب"}</Badge>
                    <Button size="sm" variant="outline" disabled={!row.attempt} onClick={() => navigate(`/teacher/exams/${examId}/attempts/${row.attempt.id}`)} className="gap-1"><Eye className="h-4 w-4" />مراجعة</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </TeacherSidebarLayout>
  );
}

function BigStat({ icon, label, value }: any) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <div className="text-3xl font-black">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function SummaryLine({ icon, label, value }: any) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">{icon}<span>{label}</span></div>
      <span className="font-black">{value}</span>
    </div>
  );
}
