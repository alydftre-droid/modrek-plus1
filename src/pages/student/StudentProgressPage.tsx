import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/student/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Award, BarChart3, Brain, CalendarDays, CheckCircle2, Clock3, Crown, Eye, Medal, MonitorPlay, Play, Sparkles, Star, Target, TrendingUp, Trophy, Video } from "lucide-react";
import { format, startOfMonth, startOfWeek, subDays } from "date-fns";
import { ar } from "date-fns/locale";

type AttemptRow = {
  id: string;
  exam_id: string;
  score: number;
  total: number;
  submitted_at: string;
  time_taken: number;
  exams?: { title: string; subject_id: string; subjects?: { name: string } };
};

type RankingRow = {
  exam_id: string;
  rank: number;
  totalParticipants: number;
  score: number;
  total: number;
  examTitle: string;
  subjectName: string;
};

type VideoProgressRow = {
  content_id: string;
  progress_seconds: number;
  duration_seconds: number;
  updated_at: string;
  content?: { title: string; type: string; group_id: string | null; duration: string | null };
};

const chartConfig = {
  score: { label: "الدرجة", color: "hsl(var(--primary))" },
  exams: { label: "الامتحانات", color: "hsl(var(--secondary))" },
  minutes: { label: "دقائق", color: "hsl(220 70% 55%)" },
};

const badgeStyles = [
  { title: "أسطورة المادة", icon: Crown, className: "bg-secondary/20 text-secondary-foreground border-secondary/30" },
  { title: "البطل الذهبي", icon: Trophy, className: "bg-primary/15 text-primary border-primary/20" },
  { title: "النجم الفضي", icon: Medal, className: "bg-muted text-foreground border-border" },
  { title: "صاحب القمة", icon: Star, className: "bg-accent text-accent-foreground border-accent/20" },
  { title: "متميز جداً", icon: Award, className: "bg-secondary/15 text-secondary-foreground border-secondary/20" },
  { title: "متقدم", icon: Sparkles, className: "bg-primary/10 text-primary border-primary/15" },
  { title: "منافس قوي", icon: Target, className: "bg-accent text-accent-foreground border-accent/20" },
  { title: "ثابت الأداء", icon: Brain, className: "bg-muted text-foreground border-border" },
  { title: "واعد", icon: TrendingUp, className: "bg-primary/10 text-primary border-primary/15" },
  { title: "ضمن العشرة", icon: Medal, className: "bg-secondary/10 text-secondary-foreground border-secondary/15" },
];

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} ثانية`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const remainM = m % 60;
  if (h === 0) return `${m} دقيقة`;
  return `${h} ساعة ${remainM > 0 ? `و ${remainM} دقيقة` : ""}`;
}

export default function StudentProgressPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [videoProgress, setVideoProgress] = useState<VideoProgressRow[]>([]);
  const [weeklyWatchMinutes, setWeeklyWatchMinutes] = useState(0);
  const [monthlyWatchMinutes, setMonthlyWatchMinutes] = useState(0);
  const [weeklyLessons, setWeeklyLessons] = useState(0);
  const [monthlyLessons, setMonthlyLessons] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Fetch purchased groups first to filter activity
        const [attemptsRes, usageRes, vpRes, purchasesRes] = await Promise.all([
          supabase
            .from("exam_attempts")
            .select("id, exam_id, score:total_score, total:max_score, submitted_at, time_taken, exams(title, subject_id, group_id, subjects:subject_id(name))")
            .eq("student_id", user.id)
            .order("submitted_at", { ascending: false }),
          supabase.from("usage_logs").select("action, duration_minutes, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
          supabase.from("video_progress").select("content_id, progress_seconds, duration_seconds, updated_at").eq("user_id", user.id),
          supabase.from("student_group_purchases").select("group_id").eq("student_id", user.id),
        ]);

        if (attemptsRes.error) throw attemptsRes.error;

        const purchasedGroupIds = new Set((purchasesRes.data || []).map(p => p.group_id));

        // Filter attempts to only exams in purchased groups
        const attemptRows = ((attemptsRes.data || []) as unknown as (AttemptRow & { exams?: { group_id?: string } })[])
          .filter(a => !a.exams?.group_id || purchasedGroupIds.has(a.exams.group_id)) as AttemptRow[];
        setAttempts(attemptRows);

        // Fetch content details for video progress and filter by purchased groups
        const vpData = (vpRes.data || []) as VideoProgressRow[];
        if (vpData.length > 0) {
          const contentIds = vpData.map(v => v.content_id);
          const { data: contentData } = await supabase
            .from("content")
            .select("id, title, type, group_id, duration")
            .in("id", contentIds);
          
          const contentMap = new Map((contentData || []).map(c => [c.id, c]));
          vpData.forEach(v => {
            const c = contentMap.get(v.content_id);
            if (c) v.content = c;
          });
        }
        // Only show progress for content in purchased groups (or free content with no group)
        const filteredVP = vpData.filter(v => !v.content?.group_id || purchasedGroupIds.has(v.content.group_id));
        setVideoProgress(filteredVP);

        const weekStart = startOfWeek(new Date(), { weekStartsOn: 6 });
        const monthStart = startOfMonth(new Date());
        const usageRows = usageRes.data || [];

        // Calculate watch time from video_progress (more accurate)
        const weekVP = filteredVP.filter(v => new Date(v.updated_at) >= weekStart);
        const monthVP = filteredVP.filter(v => new Date(v.updated_at) >= monthStart);
        
        setWeeklyWatchMinutes(Math.round(weekVP.reduce((s, v) => s + v.progress_seconds, 0) / 60));
        setMonthlyWatchMinutes(Math.round(monthVP.reduce((s, v) => s + v.progress_seconds, 0) / 60));
        setWeeklyLessons(usageRows.filter(r => r.action?.includes("lesson") && new Date(r.created_at) >= weekStart).length || weekVP.length);
        setMonthlyLessons(usageRows.filter(r => r.action?.includes("lesson") && new Date(r.created_at) >= monthStart).length || monthVP.length);

        // Rankings
        const uniqueExamIds = [...new Set(attemptRows.map(a => a.exam_id))];
        const rankingRows = await Promise.all(
          uniqueExamIds.map(async (examId) => {
            const { data } = await supabase
              .from("exam_attempts")
              .select("student_id, score, total")
              .eq("exam_id", examId)
              .order("score", { ascending: false });
            const examAttempts = data || [];
            const rank = examAttempts.findIndex((a: any) => a.student_id === user.id) + 1;
            const ownAttempt = attemptRows.find(a => a.exam_id === examId);
            if (!ownAttempt || !rank) return null;
            return {
              exam_id: examId, rank, totalParticipants: examAttempts.length,
              score: ownAttempt.score, total: ownAttempt.total,
              examTitle: ownAttempt.exams?.title || "امتحان",
              subjectName: ownAttempt.exams?.subjects?.name || "مادة غير محددة",
            } satisfies RankingRow;
          })
        );
        setRankings(rankingRows.filter(Boolean) as RankingRow[]);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [user]);

  const weeklyAttempts = useMemo(() => attempts.filter(a => new Date(a.submitted_at) >= startOfWeek(new Date(), { weekStartsOn: 6 })), [attempts]);
  const monthlyAttempts = useMemo(() => attempts.filter(a => new Date(a.submitted_at) >= startOfMonth(new Date())), [attempts]);
  const topTenBadges = useMemo(() => rankings.filter(r => r.rank <= 10).slice(0, 10), [rankings]);

  const weeklyAverage = weeklyAttempts.length
    ? Math.round(weeklyAttempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / weeklyAttempts.length)
    : 0;
  const monthlyAverage = monthlyAttempts.length
    ? Math.round(monthlyAttempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / monthlyAttempts.length)
    : 0;

  const totalWatchSeconds = videoProgress.reduce((s, v) => s + v.progress_seconds, 0);
  const totalVideos = videoProgress.length;
  const completedVideos = videoProgress.filter(v => v.duration_seconds > 0 && (v.progress_seconds / v.duration_seconds) >= 0.9).length;
  const lastWatched = videoProgress.length > 0
    ? [...videoProgress].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
    : null;

  const performanceSeries = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dayAttempts = attempts.filter(a => format(new Date(a.submitted_at), "yyyy-MM-dd") === format(date, "yyyy-MM-dd"));
    const average = dayAttempts.length
      ? Math.round(dayAttempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / dayAttempts.length)
      : 0;
    return { day: format(date, "EEE", { locale: ar }), score: average, exams: dayAttempts.length };
  });

  // Watch time chart per day (last 7 days)
  const watchSeries = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayVP = videoProgress.filter(v => format(new Date(v.updated_at), "yyyy-MM-dd") === dateStr);
    const mins = Math.round(dayVP.reduce((s, v) => s + v.progress_seconds, 0) / 60);
    return { day: format(date, "EEE", { locale: ar }), minutes: mins };
  });

  const subjectRanks = rankings.slice(0, 6).map(r => ({
    name: r.subjectName.length > 12 ? `${r.subjectName.slice(0, 12)}...` : r.subjectName,
    rankScore: Math.max(0, 100 - (r.rank - 1) * 8),
    rank: r.rank,
  }));

  const motivationalText = weeklyAverage >= 85
    ? "أداؤك هذا الأسبوع ممتاز جداً — استمر بنفس القوة فأنت قريب من القمة دائماً."
    : weeklyAverage >= 70
      ? "أداؤك جيد ويتحسن، ركّز على مراجعة الامتحانات التي انخفضت فيها الدرجة لتقفز أكثر."
      : "ابدأ هذا الأسبوع بحل امتحان جديد ومراجعة نقاط الضعف، وسترى فرقاً واضحاً في تقريرك القادم.";

  return (
    <StudentLayout title="تقدمي">
      <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
        {/* Hero Card */}
        <Card className="overflow-hidden border-border/60 bg-card shadow-sm">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-6">
            <div className="space-y-4 text-right">
              <Badge className="w-fit rounded-full border-0 bg-secondary/15 text-secondary-foreground">تقرير الطالب الذكي</Badge>
              <div>
                <h1 className="text-2xl font-black text-foreground">لوحة تقدمي وإنجازاتي</h1>
                <p className="mt-2 text-sm text-muted-foreground">متابعة حديثة لدرجاتك، ساعات مشاهدتك، ترتيبك، والأوسمة.</p>
              </div>
              <p className="rounded-3xl bg-accent/60 p-4 text-sm font-medium leading-8 text-accent-foreground">{motivationalText}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "إجمالي المشاهدة", value: formatDuration(totalWatchSeconds), icon: Clock3 },
                { label: "فيديوهات مشاهدة", value: `${completedVideos}/${totalVideos}`, icon: Eye },
                { label: "ساعات هذا الأسبوع", value: `${Math.round(weeklyWatchMinutes / 60)} س`, icon: MonitorPlay },
                { label: "الشارات المكتسبة", value: `${topTenBadges.length}`, icon: Award },
              ].map((item) => (
                <Card key={item.label} className="border-border/60 bg-background/80">
                  <CardContent className="space-y-2 p-4 text-right">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-xl font-black text-foreground">{loading ? "--" : item.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="activity" className="rounded-2xl text-xs">نشاطي</TabsTrigger>
            <TabsTrigger value="weekly" className="rounded-2xl text-xs">أسبوعي</TabsTrigger>
            <TabsTrigger value="monthly" className="rounded-2xl text-xs">شهري</TabsTrigger>
            <TabsTrigger value="records" className="rounded-2xl text-xs">سجلاتي</TabsTrigger>
          </TabsList>

          {/* Activity Tab - Video Watching Details */}
          <TabsContent value="activity" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Watch time chart */}
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4 text-primary" /> ساعات المشاهدة (7 أيام)</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[250px] w-full" /> : (
                    <ChartContainer config={chartConfig} className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={watchSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* Activity Summary */}
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" /> ملخص النشاط</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-2xl bg-muted/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">إجمالي ساعات المشاهدة</span>
                      <strong className="text-foreground">{formatDuration(totalWatchSeconds)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الفيديوهات المشاهدة</span>
                      <strong className="text-foreground">{totalVideos} فيديو</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">مكتمل بالكامل</span>
                      <strong className="text-foreground">{completedVideos} فيديو</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">غير مكتمل</span>
                      <strong className="text-foreground">{totalVideos - completedVideos} فيديو</strong>
                    </div>
                  </div>

                  {lastWatched && (
                    <div className="rounded-2xl bg-primary/5 border border-primary/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Play className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-primary">آخر فيديو تمت مشاهدته</span>
                      </div>
                      <p className="font-bold text-foreground text-sm">{lastWatched.content?.title || "فيديو"}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDuration(lastWatched.progress_seconds)} من {formatDuration(lastWatched.duration_seconds)}
                        {lastWatched.duration_seconds > 0 && ` (${Math.round((lastWatched.progress_seconds / lastWatched.duration_seconds) * 100)}%)`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(lastWatched.updated_at), "d MMMM yyyy - hh:mm a", { locale: ar })}
                      </p>
                    </div>
                  )}

                  {totalVideos > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span>نسبة الإكمال الكلية</span>
                        <strong>{Math.round((completedVideos / totalVideos) * 100)}%</strong>
                      </div>
                      <Progress value={(completedVideos / totalVideos) * 100} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed video list */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><MonitorPlay className="h-4 w-4 text-primary" /> تفاصيل مشاهدة الفيديوهات</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full mb-2" />)
                ) : videoProgress.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground rounded-2xl bg-muted/30">
                    لم تشاهد أي فيديو بعد. ابدأ مشاهدة الدروس لتظهر تفاصيل نشاطك هنا.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {[...videoProgress]
                      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                      .map((vp) => {
                        const pct = vp.duration_seconds > 0 ? Math.round((vp.progress_seconds / vp.duration_seconds) * 100) : 0;
                        const isComplete = pct >= 90;
                        return (
                          <div key={vp.content_id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-accent/30 transition-colors">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isComplete ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                              {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{vp.content?.title || "فيديو"}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDuration(vp.progress_seconds)} / {formatDuration(vp.duration_seconds)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {format(new Date(vp.updated_at), "d/M", { locale: ar })}
                                </span>
                              </div>
                              <Progress value={pct} className="mt-1.5 h-1.5" />
                            </div>
                            <Badge
                              variant={isComplete ? "default" : "outline"}
                              className={`rounded-full text-[10px] shrink-0 ${isComplete ? "bg-emerald-500/15 text-emerald-700 border-0" : ""}`}
                            >
                              {pct}%
                            </Badge>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Weekly Tab */}
          <TabsContent value="weekly" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> الأداء خلال 7 أيام</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[280px] w-full" /> : (
                    <ChartContainer config={chartConfig} className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={performanceSeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Area type="monotone" dataKey="score" stroke="var(--color-score)" fill="var(--color-score)" fillOpacity={0.18} strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card">
                <CardHeader>
                  <CardTitle className="text-base">ملخص هذا الأسبوع</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <div className="mb-2 flex items-center justify-between"><span>الامتحانات المحلولة</span><strong>{weeklyAttempts.length}</strong></div>
                    <Progress value={Math.min(100, weeklyAttempts.length * 12)} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between"><span>الفيديوهات المتابعة</span><strong>{weeklyLessons}</strong></div>
                    <Progress value={Math.min(100, weeklyLessons * 10)} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between"><span>وقت المشاهدة</span><strong>{formatDuration(weeklyWatchMinutes * 60)}</strong></div>
                    <Progress value={Math.min(100, weeklyWatchMinutes / 12)} />
                  </div>
                  <div className="rounded-3xl bg-accent/60 p-4 leading-7 text-accent-foreground">
                    {weeklyAttempts.length ? `أنهيت ${weeklyAttempts.length} امتحان هذا الأسبوع ومتوسطك الحالي ${weeklyAverage}%` : "لم تُسجل امتحانات هذا الأسبوع بعد."}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Monthly Tab */}
          <TabsContent value="monthly" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-secondary" /> ترتيبك في الامتحانات</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[280px] w-full" /> : subjectRanks.length ? (
                    <ChartContainer config={{ rankScore: { label: "قوة الترتيب", color: "hsl(var(--secondary))" } }} className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={subjectRanks} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" domain={[0, 100]} hide />
                          <YAxis type="category" dataKey="name" width={90} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="rankScore" fill="var(--color-rankScore)" radius={[0, 12, 12, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-muted-foreground">لا توجد بيانات ترتيب كافية بعد</div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">ملخص هذا الشهر</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-3xl bg-muted/50 p-4 space-y-2">
                    <div className="flex items-center justify-between"><span>الامتحانات هذا الشهر</span><strong>{monthlyAttempts.length}</strong></div>
                    <div className="flex items-center justify-between"><span>متوسط الشهر</span><strong>{monthlyAverage}%</strong></div>
                    <div className="flex items-center justify-between"><span>وقت المشاهدة</span><strong>{formatDuration(monthlyWatchMinutes * 60)}</strong></div>
                    <div className="flex items-center justify-between"><span>الفيديوهات المتابعة</span><strong>{monthlyLessons}</strong></div>
                  </div>
                  <div className="rounded-3xl bg-accent/60 p-4 leading-7 text-accent-foreground">
                    {monthlyAttempts.length ? `هذا الشهر أنجزت ${monthlyAttempts.length} امتحاناً وحققت متوسط ${monthlyAverage}%` : "ابدأ هذا الشهر بحل الامتحانات ليظهر تقريرك الشهري بالتفصيل."}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-primary" /> أوسمة المراكز العشرة الأولى</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {loading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />) : topTenBadges.length ? topTenBadges.map((badge, index) => {
                    const style = badgeStyles[Math.min(index, badgeStyles.length - 1)];
                    const Icon = style.icon;
                    return (
                      <div key={`${badge.exam_id}-${badge.rank}`} className={`rounded-3xl border p-4 text-right ${style.className}`}>
                        <div className="mb-2 flex items-center justify-between">
                          <Icon className="h-5 w-5" />
                          <Badge className="rounded-full border-0 bg-background/70 text-foreground">المركز {badge.rank}</Badge>
                        </div>
                        <p className="font-black">{style.title} - {badge.subjectName}</p>
                        <p className="mt-1 text-sm opacity-80">{badge.examTitle}</p>
                        <p className="mt-2 text-xs opacity-80">درجتك: {badge.score}/{badge.total} • بين {badge.totalParticipants} طالب</p>
                      </div>
                    );
                  }) : <div className="col-span-full rounded-3xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">عند دخولك ضمن أوائل الامتحان ستظهر الأوسمة هنا.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Records Tab */}
          <TabsContent value="records" className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">سجلات الامتحانات وآخر النتائج</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />) : attempts.length ? attempts.slice(0, 12).map((attempt) => {
                  const ranking = rankings.find(r => r.exam_id === attempt.exam_id);
                  const percentage = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
                  return (
                    <div key={attempt.id} className="rounded-3xl border border-border/60 bg-card p-4 text-right shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-foreground">{attempt.exams?.title || "امتحان"}</p>
                          <p className="text-sm text-muted-foreground">{attempt.exams?.subjects?.name || "مادة غير محددة"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{format(new Date(attempt.submitted_at), "d MMMM yyyy", { locale: ar })}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-lg font-black text-primary">{attempt.score}/{attempt.total}</p>
                          <p className="text-xs text-muted-foreground">{percentage}%</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ranking && <Badge className="rounded-full border-0 bg-secondary/15 text-secondary-foreground">المركز {ranking.rank} من {ranking.totalParticipants}</Badge>}
                        <Badge variant="outline" className="rounded-full">زمن الحل: {Math.round((attempt.time_taken || 0) / 60)} دقيقة</Badge>
                      </div>
                    </div>
                  );
                }) : <div className="rounded-3xl bg-muted/40 p-8 text-center text-muted-foreground">لا توجد سجلات امتحانات حتى الآن.</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </StudentLayout>
  );
}
