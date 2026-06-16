import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamAttempts, useExamQuestions } from "@/hooks/useExams";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Users, Trophy, Target, Clock } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function TeacherExamAnalyticsPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: attempts = [], isLoading } = useExamAttempts(examId);
  const { data: questions = [] } = useExamQuestions(examId);

  const completed = attempts.filter((a: any) => a.status !== "in_progress");
  const passRate = completed.length ? Math.round((completed.filter((a: any) => a.passed).length / completed.length) * 100) : 0;
  const avgPct = completed.length ? Math.round(completed.reduce((s: number, a: any) => s + Number(a.percentage), 0) / completed.length) : 0;
  const avgTime = completed.length ? Math.round(completed.reduce((s: number, a: any) => s + a.time_spent_seconds, 0) / completed.length / 60) : 0;

  // Score distribution buckets
  const buckets = [
    { name: "0-25%", count: 0 }, { name: "26-50%", count: 0 },
    { name: "51-75%", count: 0 }, { name: "76-100%", count: 0 },
  ];
  completed.forEach((a: any) => {
    const p = Number(a.percentage);
    const idx = p <= 25 ? 0 : p <= 50 ? 1 : p <= 75 ? 2 : 3;
    buckets[idx].count++;
  });

  return (
    <TeacherSidebarLayout title="تحليلات">
      <div className="container mx-auto p-4 max-w-4xl space-y-4">
        <Button variant="ghost" onClick={() => navigate("/teacher/exams")}><ArrowRight className="h-4 w-4 ml-1" />رجوع</Button>
        <Card><CardContent className="p-4"><h1 className="text-xl font-extrabold">{exam?.title}</h1></CardContent></Card>

        {isLoading ? <Skeleton className="h-40" /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BigStat icon={<Users />} label="المحاولات" value={completed.length} color="from-blue-500 to-cyan-500" />
              <BigStat icon={<Trophy />} label="نسبة النجاح" value={`${passRate}%`} color="from-green-500 to-emerald-500" />
              <BigStat icon={<Target />} label="متوسط الدرجة" value={`${avgPct}%`} color="from-purple-500 to-pink-500" />
              <BigStat icon={<Clock />} label="متوسط الوقت" value={`${avgTime} د`} color="from-orange-500 to-amber-500" />
            </div>

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
              <CardHeader><CardTitle className="text-base">عدد الأسئلة: {questions.length}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">إجمالي الدرجات: {questions.reduce((s, q) => s + Number(q.marks), 0)}</CardContent>
            </Card>
          </>
        )}
      </div>
    </TeacherSidebarLayout>
  );
}

function BigStat({ icon, label, value, color }: any) {
  return (
    <Card className={`bg-gradient-to-br ${color} text-white border-0`}>
      <CardContent className="p-4">
        <div className="mb-2 opacity-90">{icon}</div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-xs opacity-90">{label}</div>
      </CardContent>
    </Card>
  );
}
