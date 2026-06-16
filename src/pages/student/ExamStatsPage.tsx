import { useStudentStats, useMyAttempts } from "@/hooks/useExams";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, TrendingDown, Trophy, Clock, Target, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function ExamStatsPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useStudentStats();
  const { data: attempts = [] } = useMyAttempts();

  if (isLoading) return <StudentLayout><div className="p-4 space-y-3 max-w-4xl mx-auto"><Skeleton className="h-40" /><Skeleton className="h-60" /></div></StudentLayout>;

  const recent = [...attempts].filter(a => a.status !== "in_progress").slice(0, 10).reverse();
  const timeline = recent.map((a, i) => ({ name: `#${i + 1}`, percentage: Number(a.percentage) }));
  const bySubject = stats?.by_subject ? Object.entries(stats.by_subject).map(([name, info]: any) => ({ name, avg: Number(info.avg) })) : [];

  return (
    <StudentLayout>
      <div className="container max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/student/exams")}><ArrowRight className="h-4 w-4 ml-1" />الامتحانات</Button>
          <h1 className="text-xl font-extrabold">إحصائياتي</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BigStat icon={<Trophy className="h-5 w-5" />} label="امتحانات" value={stats?.total_exams_taken || 0} color="from-blue-500 to-cyan-500" />
          <BigStat icon={<Target className="h-5 w-5" />} label="نجاحات" value={stats?.total_passed || 0} color="from-green-500 to-emerald-500" />
          <BigStat icon={<BarChart3 className="h-5 w-5" />} label="متوسط" value={`${Math.round(Number(stats?.average_percentage || 0))}%`} color="from-purple-500 to-pink-500" />
          <BigStat icon={<Clock className="h-5 w-5" />} label="ساعات" value={`${Math.floor((stats?.total_time_spent_seconds || 0) / 3600)}`} color="from-orange-500 to-amber-500" />
        </div>

        {bySubject.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">الأداء حسب المادة</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={bySubject}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {timeline.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">تطور أدائك</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="percentage" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats?.best_subject && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div>
                  <div className="text-xs text-muted-foreground">نقطة قوتك</div>
                  <div className="font-bold">{stats.best_subject}</div>
                </div>
              </CardContent>
            </Card>
          )}
          {stats?.weakest_subject && stats.weakest_subject !== stats?.best_subject && (
            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingDown className="h-8 w-8 text-orange-600" />
                <div>
                  <div className="text-xs text-muted-foreground">يحتاج تركيز</div>
                  <div className="font-bold">{stats.weakest_subject}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}

function BigStat({ icon, label, value, color }: any) {
  return (
    <Card className={`bg-gradient-to-br ${color} text-white border-0`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 opacity-90">{icon}</div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-xs opacity-90">{label}</div>
      </CardContent>
    </Card>
  );
}
