import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartTooltip,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from "recharts";
import {
  Trophy,
  Target,
  TrendingUp,
  BookOpen,
  Award,
  Clock,
  CheckCircle2,
  Star,
  Flame,
  Medal,
  Zap,
  Brain,
  GraduationCap,
  ChartLine,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ar } from "date-fns/locale";

interface ExamAttempt {
  id: string;
  exam_id: string;
  score: number;
  total: number;
  submitted_at: string;
  time_taken: number;
  exams?: {
    title: string;
    subject_id: string;
    subjects?: { name: string };
  };
}

interface Stats {
  totalExams: number;
  avgScore: number;
  bestScore: number;
  totalTime: number;
  streak: number;
  improvementRate: number;
}

const CHART_COLORS = {
  primary: "hsl(158, 64%, 28%)",
  secondary: "hsl(42, 78%, 50%)",
  accent: "hsl(158, 40%, 90%)",
  success: "hsl(142, 76%, 36%)",
  warning: "hsl(38, 92%, 50%)",
  info: "hsl(199, 89%, 48%)",
};

const PIE_COLORS = ["#1f7a5c", "#d4a94e", "#3498db", "#9b59b6", "#e74c3c"];

export default function StudentProgressPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalExams: 0,
    avgScore: 0,
    bestScore: 0,
    totalTime: 0,
    streak: 0,
    improvementRate: 0,
  });
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [subjectData, setSubjectData] = useState<any[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch exam attempts with exam details
      const { data: attemptData, error } = await supabase
        .from("exam_attempts")
        .select(`
          id,
          exam_id,
          score,
          total,
          submitted_at,
          time_taken,
          exams (
            title,
            subject_id,
            subjects:subject_id (name)
          )
        `)
        .eq("student_id", user!.id)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      const attemptsWithExams = (attemptData || []) as unknown as ExamAttempt[];
      setAttempts(attemptsWithExams);

      // Calculate stats
      if (attemptsWithExams.length > 0) {
        const scores = attemptsWithExams.map((a) =>
          a.total > 0 ? (a.score / a.total) * 100 : 0
        );
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const bestScore = Math.max(...scores);
        const totalTime = attemptsWithExams.reduce(
          (sum, a) => sum + (a.time_taken || 0),
          0
        );

        // Calculate streak (consecutive days with exams)
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const checkDate = format(subDays(today, i), "yyyy-MM-dd");
          const hasExam = attemptsWithExams.some(
            (a) => format(new Date(a.submitted_at), "yyyy-MM-dd") === checkDate
          );
          if (hasExam) streak++;
          else if (i > 0) break;
        }

        // Calculate improvement rate (compare last 5 vs first 5)
        let improvementRate = 0;
        if (attemptsWithExams.length >= 5) {
          const recent5 = scores.slice(0, 5);
          const older5 = scores.slice(-5);
          const recentAvg = recent5.reduce((a, b) => a + b, 0) / 5;
          const olderAvg = older5.reduce((a, b) => a + b, 0) / 5;
          improvementRate = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
        }

        setStats({
          totalExams: attemptsWithExams.length,
          avgScore: Math.round(avgScore),
          bestScore: Math.round(bestScore),
          totalTime: Math.round(totalTime / 60), // Convert to hours
          streak,
          improvementRate: Math.round(improvementRate),
        });

        // Performance over time (last 14 days)
        const last14Days = Array.from({ length: 14 }, (_, i) => {
          const date = subDays(today, 13 - i);
          const dayAttempts = attemptsWithExams.filter(
            (a) =>
              format(new Date(a.submitted_at), "yyyy-MM-dd") ===
              format(date, "yyyy-MM-dd")
          );
          const dayScore =
            dayAttempts.length > 0
              ? dayAttempts.reduce(
                  (sum, a) => sum + (a.total > 0 ? (a.score / a.total) * 100 : 0),
                  0
                ) / dayAttempts.length
              : null;
          return {
            date: format(date, "EEE", { locale: ar }),
            fullDate: format(date, "d MMM", { locale: ar }),
            score: dayScore ? Math.round(dayScore) : null,
            exams: dayAttempts.length,
          };
        });
        setPerformanceData(last14Days);

        // Subject performance
        const subjectMap: Record<string, { scores: number[]; name: string }> = {};
        attemptsWithExams.forEach((a) => {
          const subjectName = (a.exams as any)?.subjects?.name || "غير محدد";
          const subjectId = (a.exams as any)?.subject_id || "unknown";
          if (!subjectMap[subjectId]) {
            subjectMap[subjectId] = { scores: [], name: subjectName };
          }
          subjectMap[subjectId].scores.push(
            a.total > 0 ? (a.score / a.total) * 100 : 0
          );
        });
        const subjectPerf = Object.values(subjectMap)
          .map((s) => ({
            name: s.name.length > 10 ? s.name.slice(0, 10) + "..." : s.name,
            fullName: s.name,
            avg: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length),
            count: s.scores.length,
          }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 6);
        setSubjectData(subjectPerf);

        // Score distribution
        const distribution = [
          { range: "90-100%", count: 0, label: "ممتاز" },
          { range: "75-89%", count: 0, label: "جيد جداً" },
          { range: "60-74%", count: 0, label: "جيد" },
          { range: "50-59%", count: 0, label: "مقبول" },
          { range: "0-49%", count: 0, label: "ضعيف" },
        ];
        scores.forEach((s) => {
          if (s >= 90) distribution[0].count++;
          else if (s >= 75) distribution[1].count++;
          else if (s >= 60) distribution[2].count++;
          else if (s >= 50) distribution[3].count++;
          else distribution[4].count++;
        });
        setDistributionData(distribution);
      }
    } catch (err) {
      console.error("Error fetching progress:", err);
    } finally {
      setLoading(false);
    }
  };


  const getScoreBadge = (score: number) => {
    if (score >= 90) return { text: "ممتاز", variant: "default" as const };
    if (score >= 75) return { text: "جيد جداً", variant: "secondary" as const };
    if (score >= 60) return { text: "جيد", variant: "outline" as const };
    return { text: "يحتاج تحسين", variant: "destructive" as const };
  };

  return (
    <StudentLayout title="تقدمي الدراسي">
      <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Hero Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {[
            {
              label: "الامتحانات المُنجزة",
              value: stats.totalExams,
              icon: Target,
              color: "from-primary to-primary/80",
              iconBg: "bg-primary/10",
            },
            {
              label: "متوسط الدرجات",
              value: `${stats.avgScore}%`,
              icon: TrendingUp,
              color: "from-secondary to-secondary/80",
              iconBg: "bg-secondary/10",
            },
            {
              label: "أفضل درجة",
              value: `${stats.bestScore}%`,
              icon: Trophy,
              color: "from-green-600 to-green-500",
              iconBg: "bg-green-500/10",
            },
            {
              label: "أيام متتالية",
              value: stats.streak,
              icon: Flame,
              color: "from-orange-500 to-red-500",
              iconBg: "bg-orange-500/10",
            },
          ].map((stat, i) => (
            <Card
              key={i}
              className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-5`} />
              <CardContent className="p-4 lg:p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs lg:text-sm text-muted-foreground font-medium">
                      {stat.label}
                    </p>
                    {loading ? (
                      <Skeleton className="h-8 w-16" />
                    ) : (
                      <p className="text-2xl lg:text-3xl font-bold text-foreground">
                        {stat.value}
                      </p>
                    )}
                  </div>
                  <div className={`p-2.5 lg:p-3 rounded-xl ${stat.iconBg}`}>
                    <stat.icon className="h-5 w-5 lg:h-6 lg:w-6 text-foreground/70" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Improvement Badge */}
        {!loading && stats.improvementRate !== 0 && (
          <Card className="border-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                {stats.improvementRate > 0 ? (
                  <TrendingUp className="h-6 w-6 text-primary" />
                ) : (
                  <TrendingUp className="h-6 w-6 text-destructive rotate-180" />
                )}
              </div>
              <div>
                <p className="font-bold text-foreground">
                  {stats.improvementRate > 0 ? "تحسّن رائع! 🎉" : "تحتاج للمزيد من الجهد"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats.improvementRate > 0
                    ? `تحسنت بنسبة ${stats.improvementRate}% مقارنة بأدائك السابق`
                    : `انخفض أداؤك بنسبة ${Math.abs(stats.improvementRate)}% - واصل المذاكرة!`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts Section */}
        <Tabs defaultValue="performance" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-muted/50">
            <TabsTrigger
              value="performance"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 py-2.5"
            >
              <ChartLine className="h-4 w-4" />
              <span className="hidden sm:inline">الأداء</span>
            </TabsTrigger>
            <TabsTrigger
              value="subjects"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 py-2.5"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">المواد</span>
            </TabsTrigger>
            <TabsTrigger
              value="distribution"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 py-2.5"
            >
              <PieChartIcon className="h-4 w-4" />
              <span className="hidden sm:inline">التوزيع</span>
            </TabsTrigger>
          </TabsList>

          {/* Performance Over Time */}
          <TabsContent value="performance">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ChartLine className="h-5 w-5 text-primary" />
                  أداؤك خلال آخر 14 يوم
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : performanceData.length > 0 ? (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={performanceData}>
                        <defs>
                          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                          axisLine={{ stroke: "hsl(var(--border))" }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload?.[0]) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card border rounded-lg p-3 shadow-lg">
                                  <p className="font-bold">{data.fullDate}</p>
                                  {data.score !== null ? (
                                    <>
                                      <p className="text-primary">الدرجة: {data.score}%</p>
                                      <p className="text-muted-foreground text-sm">
                                        {data.exams} امتحان
                                      </p>
                                    </>
                                  ) : (
                                    <p className="text-muted-foreground">لا توجد امتحانات</p>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke={CHART_COLORS.primary}
                          strokeWidth={3}
                          fill="url(#scoreGradient)"
                          connectNulls
                          dot={{ fill: CHART_COLORS.primary, strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, fill: CHART_COLORS.secondary }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>لا توجد بيانات كافية للعرض</p>
                      <p className="text-sm">ابدأ بحل الامتحانات لترى تقدمك!</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Subject Performance */}
          <TabsContent value="subjects">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" />
                  أداؤك حسب المادة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : subjectData.length > 0 ? (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                          width={80}
                        />
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload?.[0]) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card border rounded-lg p-3 shadow-lg">
                                  <p className="font-bold">{data.fullName}</p>
                                  <p className="text-primary">المعدل: {data.avg}%</p>
                                  <p className="text-muted-foreground text-sm">
                                    {data.count} امتحان
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar
                          dataKey="avg"
                          radius={[0, 8, 8, 0]}
                          fill={CHART_COLORS.primary}
                        >
                          {subjectData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>لا توجد بيانات كافية للعرض</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Score Distribution */}
          <TabsContent value="distribution">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  توزيع الدرجات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : distributionData.some((d) => d.count > 0) ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={distributionData.filter((d) => d.count > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="count"
                            nameKey="label"
                          >
                            {distributionData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <ChartTooltip
                            content={({ active, payload }) => {
                              if (active && payload?.[0]) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-card border rounded-lg p-3 shadow-lg">
                                    <p className="font-bold">{data.label}</p>
                                    <p className="text-muted-foreground">{data.range}</p>
                                    <p className="text-primary">{data.count} امتحان</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col justify-center space-y-3">
                      {distributionData.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[i] }}
                          />
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium">{item.label}</span>
                              <span className="text-muted-foreground">{item.count}</span>
                            </div>
                            <Progress
                              value={
                                stats.totalExams > 0
                                  ? (item.count / stats.totalExams) * 100
                                  : 0
                              }
                              className="h-2"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <PieChartIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>لا توجد بيانات كافية للعرض</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Recent Attempts */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              آخر الامتحانات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : attempts.length > 0 ? (
              <div className="space-y-3">
                {attempts.slice(0, 5).map((attempt) => {
                  const percentage =
                    attempt.total > 0
                      ? Math.round((attempt.score / attempt.total) * 100)
                      : 0;
                  const badge = getScoreBadge(percentage);

                  return (
                    <div
                      key={attempt.id}
                      className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold ${
                          percentage >= 60
                            ? "bg-primary/10 text-primary"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {percentage}%
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-foreground truncate">
                          {(attempt.exams as any)?.title || "امتحان"}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {(attempt.exams as any)?.subjects?.name || "مادة غير محددة"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(attempt.submitted_at), "d MMMM yyyy - h:mm a", {
                            locale: ar,
                          })}
                        </p>
                      </div>
                      <div className="text-left shrink-0">
                        <Badge variant={badge.variant}>{badge.text}</Badge>
                        <p className="text-xs text-muted-foreground mt-2">
                          {attempt.score}/{attempt.total}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <GraduationCap className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="font-medium">لم تقم بحل أي امتحان بعد</p>
                <p className="text-sm">ابدأ بحل الامتحانات لتتبع تقدمك!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-secondary/5 to-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5 text-secondary" />
              الإنجازات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  icon: Target,
                  title: "البداية",
                  desc: "أول امتحان",
                  unlocked: stats.totalExams >= 1,
                },
                {
                  icon: Flame,
                  title: "مثابر",
                  desc: "3 أيام متتالية",
                  unlocked: stats.streak >= 3,
                },
                {
                  icon: Star,
                  title: "متميز",
                  desc: "درجة 90%+",
                  unlocked: stats.bestScore >= 90,
                },
                {
                  icon: Trophy,
                  title: "بطل",
                  desc: "10 امتحانات",
                  unlocked: stats.totalExams >= 10,
                },
                {
                  icon: Medal,
                  title: "خبير",
                  desc: "معدل 80%+",
                  unlocked: stats.avgScore >= 80,
                },
                {
                  icon: Zap,
                  title: "صاروخ",
                  desc: "تحسّن 20%+",
                  unlocked: stats.improvementRate >= 20,
                },
              ].map((ach, i) => (
                <div
                  key={i}
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    ach.unlocked
                      ? "bg-secondary/10 border-2 border-secondary/30"
                      : "bg-muted/30 opacity-50 grayscale"
                  }`}
                >
                  <div
                    className={`w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center ${
                      ach.unlocked ? "bg-secondary text-secondary-foreground" : "bg-muted"
                    }`}
                  >
                    <ach.icon className="h-5 w-5" />
                  </div>
                  <p className="font-bold text-sm">{ach.title}</p>
                  <p className="text-xs text-muted-foreground">{ach.desc}</p>
                  {ach.unlocked && (
                    <CheckCircle2 className="absolute top-2 left-2 h-4 w-4 text-green-500" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </StudentLayout>
  );
}
