import { useMemo, useEffect, useState } from "react";
import { useStudentStats, useMyAttempts } from "@/hooks/useExams";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight, TrendingUp, TrendingDown, Trophy, Clock, Target, BarChart3,
  Flame, Award, Star, Zap, BookOpen, CheckCircle2, XCircle, Sparkles,
  Rocket, Medal, Crown, Timer, Activity, Brain, Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

export default function ExamStatsPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useStudentStats();
  const { data: attempts = [] } = useMyAttempts();
  const [examTitles, setExamTitles] = useState<Record<string, { title: string; subject?: string }>>({});

  const finished = useMemo(
    () => [...attempts].filter((a) => a.status !== "in_progress"),
    [attempts]
  );

  useEffect(() => {
    const ids = Array.from(new Set(finished.map((a) => a.exam_id))).slice(0, 60);
    if (ids.length === 0) return;
    supabase
      .from("exams")
      .select("id, title, subjects(name)")
      .in("id", ids)
      .then(({ data }) => {
        const map: Record<string, { title: string; subject?: string }> = {};
        (data || []).forEach((e: any) => {
          map[e.id] = { title: e.title, subject: e.subjects?.name };
        });
        setExamTitles(map);
      });
  }, [finished.length]);

  const derived = useMemo(() => {
    const sorted = [...finished].sort(
      (a, b) => new Date(a.submitted_at || a.started_at).getTime() -
                new Date(b.submitted_at || b.started_at).getTime()
    );
    const percentages = sorted.map((a) => Number(a.percentage || 0));
    const total = sorted.length;
    const passed = sorted.filter((a) => a.passed).length;
    const failed = total - passed;
    const avg = total ? percentages.reduce((s, v) => s + v, 0) / total : 0;
    const best = total ? Math.max(...percentages) : 0;
    const totalSecs = sorted.reduce((s, a) => s + Number(a.time_spent_seconds || 0), 0);
    const avgSecs = total ? totalSecs / total : 0;

    // Streak of passed exams (most recent consecutive)
    let currentStreak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].passed) currentStreak++;
      else break;
    }
    let bestStreak = 0, run = 0;
    sorted.forEach((a) => { if (a.passed) { run++; bestStreak = Math.max(bestStreak, run); } else run = 0; });

    // Trend: last 3 avg vs previous 3
    const last3 = percentages.slice(-3);
    const prev3 = percentages.slice(-6, -3);
    const last3Avg = last3.length ? last3.reduce((s, v) => s + v, 0) / last3.length : 0;
    const prev3Avg = prev3.length ? prev3.reduce((s, v) => s + v, 0) / prev3.length : last3Avg;
    const trend = last3Avg - prev3Avg;

    // Weekly activity (last 7 days)
    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      const key = d.toISOString().slice(0, 10);
      const dayAttempts = sorted.filter((a) =>
        (a.submitted_at || a.started_at || "").slice(0, 10) === key
      );
      return {
        day: ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"][d.getDay()],
        count: dayAttempts.length,
        avg: dayAttempts.length
          ? Math.round(dayAttempts.reduce((s, a) => s + Number(a.percentage || 0), 0) / dayAttempts.length)
          : 0,
      };
    });

    // Score distribution
    const buckets = [
      { name: "ممتاز 90+", min: 90, max: 101, color: "#10b981" },
      { name: "جيد جداً 75-89", min: 75, max: 90, color: "#3b82f6" },
      { name: "جيد 60-74", min: 60, max: 75, color: "#f59e0b" },
      { name: "مقبول 50-59", min: 50, max: 60, color: "#f97316" },
      { name: "يحتاج تحسين <50", min: 0, max: 50, color: "#ef4444" },
    ].map((b) => ({
      ...b,
      value: percentages.filter((p) => p >= b.min && p < b.max).length,
    })).filter((b) => b.value > 0);

    // Level system based on total exams + avg
    const xp = total * 10 + Math.round(avg);
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 5)));
    const nextLevelXp = Math.pow(level + 1, 2) * 5;
    const prevLevelXp = Math.pow(level, 2) * 5;
    const levelProgress = Math.min(100, ((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100);

    return {
      total, passed, failed, avg, best, totalSecs, avgSecs,
      currentStreak, bestStreak, trend, days, buckets,
      level, xp, nextLevelXp, prevLevelXp, levelProgress,
      sorted,
    };
  }, [finished]);

  const timeline = useMemo(
    () => derived.sorted.slice(-15).map((a, i) => ({
      name: `#${i + 1}`,
      نتيجة: Number(a.percentage || 0),
      نجاح: a.passed ? 100 : 0,
    })),
    [derived.sorted]
  );

  const bySubject = useMemo(() => {
    if (!stats?.by_subject) return [];
    return Object.entries(stats.by_subject).map(([name, info]: any) => ({
      name,
      avg: Math.round(Number(info.avg || 0)),
      count: Number(info.count || 0),
    }));
  }, [stats]);

  const achievements = useMemo(() => {
    const list = [
      { id: "first", label: "أول امتحان", icon: Rocket, unlocked: derived.total >= 1, color: "from-blue-500 to-cyan-500" },
      { id: "five", label: "5 امتحانات", icon: BookOpen, unlocked: derived.total >= 5, color: "from-indigo-500 to-purple-500" },
      { id: "ten", label: "10 امتحانات", icon: Award, unlocked: derived.total >= 10, color: "from-purple-500 to-pink-500" },
      { id: "perfect", label: "درجة كاملة", icon: Crown, unlocked: derived.best >= 100, color: "from-yellow-500 to-orange-500" },
      { id: "excellent", label: "متفوق 90+", icon: Star, unlocked: derived.best >= 90, color: "from-amber-500 to-yellow-500" },
      { id: "streak3", label: "3 نجاحات متتالية", icon: Flame, unlocked: derived.bestStreak >= 3, color: "from-orange-500 to-red-500" },
      { id: "streak5", label: "5 نجاحات متتالية", icon: Zap, unlocked: derived.bestStreak >= 5, color: "from-red-500 to-pink-500" },
      { id: "consistent", label: "أداء ثابت 75+", icon: Medal, unlocked: derived.avg >= 75 && derived.total >= 3, color: "from-emerald-500 to-teal-500" },
      { id: "master", label: "خبير 85+", icon: Trophy, unlocked: derived.avg >= 85 && derived.total >= 5, color: "from-teal-500 to-cyan-500" },
    ];
    return list;
  }, [derived]);

  const motivation = useMemo(() => {
    if (derived.total === 0) return { title: "ابدأ رحلتك!", msg: "أول امتحان بيفتح لك عالم من المعرفة 🚀", icon: Rocket };
    if (derived.avg >= 90) return { title: "نجم ساطع ⭐", msg: "أداؤك استثنائي! حافظ على هذا التميز", icon: Crown };
    if (derived.avg >= 75) return { title: "أنت على الطريق الصحيح 💪", msg: "خطوة واحدة تفصلك عن التميز", icon: Trophy };
    if (derived.avg >= 60) return { title: "استمر في التقدم 📈", msg: "كل امتحان يقربك من هدفك", icon: TrendingUp };
    if (derived.trend > 0) return { title: "أداؤك يتحسن! 🔥", msg: "استمر بنفس الهمة، النتائج قادمة", icon: Flame };
    return { title: "لا تستسلم 💫", msg: "كل خطأ درس، والمثابرة سر النجاح", icon: Sparkles };
  }, [derived]);

  if (isLoading) return (
    <StudentLayout>
      <div className="p-4 space-y-3 max-w-4xl mx-auto">
        <Skeleton className="h-40" /><Skeleton className="h-60" /><Skeleton className="h-60" />
      </div>
    </StudentLayout>
  );

  const MotivationIcon = motivation.icon;
  const passRate = derived.total ? Math.round((derived.passed / derived.total) * 100) : 0;

  return (
    <StudentLayout>
      <div className="container max-w-4xl mx-auto p-4 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/student/exams")}>
            <ArrowRight className="h-4 w-4 ml-1" />الامتحانات
          </Button>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            إحصائياتي
          </h1>
        </div>

        {/* Motivation Hero + Level */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary via-purple-600 to-pink-600 text-white">
          <div className="absolute inset-0 opacity-20"
               style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.5) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.3) 0%, transparent 40%)" }} />
          <CardContent className="relative p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <MotivationIcon className="h-5 w-5" />
                  <h2 className="text-lg font-extrabold">{motivation.title}</h2>
                </div>
                <p className="text-sm opacity-90">{motivation.msg}</p>
              </div>
              <div className="flex flex-col items-center bg-white/20 backdrop-blur rounded-2xl px-4 py-2 min-w-[76px]">
                <span className="text-[10px] opacity-80">المستوى</span>
                <span className="text-2xl font-black">{derived.level}</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 opacity-90">
                <span>{derived.xp} XP</span>
                <span>المستوى {derived.level + 1}: {derived.nextLevelXp} XP</span>
              </div>
              <Progress value={derived.levelProgress} className="h-2 bg-white/20" />
            </div>
          </CardContent>
        </Card>

        {/* Main KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <BigStat icon={<Trophy />} label="امتحانات" value={derived.total} color="from-blue-500 to-cyan-500" />
          <BigStat icon={<CheckCircle2 />} label="نجاحات" value={derived.passed} sub={`${passRate}%`} color="from-green-500 to-emerald-500" />
          <BigStat icon={<BarChart3 />} label="متوسط" value={`${Math.round(derived.avg)}%`}
            trend={derived.trend} color="from-purple-500 to-pink-500" />
          <BigStat icon={<Clock />} label="ساعات" value={`${Math.floor(derived.totalSecs / 3600)}`}
            sub={`${Math.round(derived.avgSecs / 60)} د/امتحان`} color="from-orange-500 to-amber-500" />
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <MiniStat icon={<Crown className="h-4 w-4 text-yellow-500" />} label="أعلى درجة" value={`${Math.round(derived.best)}%`} />
          <MiniStat icon={<Flame className="h-4 w-4 text-orange-500" />} label="سلسلة حالية" value={derived.currentStreak} />
          <MiniStat icon={<Zap className="h-4 w-4 text-red-500" />} label="أطول سلسلة" value={derived.bestStreak} />
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />تطور أدائك
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, direction: "rtl" }} />
                  <Area type="monotone" dataKey="نتيجة" stroke="hsl(var(--primary))"
                    strokeWidth={3} fill="url(#perfGrad)" dot={{ r: 4, fill: "hsl(var(--primary))" }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Two-col: Distribution + Pass rate */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {derived.buckets.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />توزيع الدرجات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={derived.buckets} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={40} outerRadius={75} paddingAngle={3}>
                      {derived.buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, direction: "rtl" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {derived.buckets.map((b) => (
                    <div key={b.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                        {b.name}
                      </div>
                      <span className="font-bold">{b.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {derived.total > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />نسبة النجاح
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center h-[200px]">
                <div className="relative">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={[
                        { name: "نجاح", value: derived.passed, color: "#10b981" },
                        { name: "رسوب", value: derived.failed, color: "#ef4444" },
                      ]} dataKey="value" innerRadius={55} outerRadius={75} startAngle={90} endAngle={-270}>
                        <Cell fill="#10b981" /><Cell fill="#ef4444" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black">{passRate}%</span>
                    <span className="text-xs text-muted-foreground">نجاح</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />{derived.passed} نجاح</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />{derived.failed} رسوب</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* By subject */}
        {bySubject.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />الأداء حسب المادة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bySubject.length >= 3 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={bySubject}>
                    <PolarGrid stroke="hsl(var(--muted-foreground))" opacity={0.3} />
                    <PolarAngleAxis dataKey="name" fontSize={11} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} fontSize={10} />
                    <Radar name="متوسط" dataKey="avg" stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))" fillOpacity={0.5} strokeWidth={2} />
                    <Tooltip contentStyle={{ borderRadius: 12, direction: "rtl" }} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bySubject}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis domain={[0, 100]} fontSize={11} />
                    <Tooltip contentStyle={{ borderRadius: 12, direction: "rtl" }} />
                    <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="space-y-2 mt-3">
                {bySubject.map((s) => (
                  <div key={s.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.avg}% • {s.count} امتحان</span>
                    </div>
                    <Progress value={s.avg} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />نشاطك هذا الأسبوع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={derived.days}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 12, direction: "rtl" }} />
                <Bar dataKey="count" name="امتحانات" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Strengths & weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats?.best_subject && (
            <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">نقطة قوتك 💪</div>
                  <div className="font-extrabold">{stats.best_subject}</div>
                </div>
              </CardContent>
            </Card>
          )}
          {stats?.weakest_subject && stats.weakest_subject !== stats?.best_subject && (
            <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-red-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">يحتاج تركيز 🎯</div>
                  <div className="font-extrabold">{stats.weakest_subject}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Achievements */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />إنجازاتك
              <Badge variant="secondary" className="mr-auto">
                {achievements.filter((a) => a.unlocked).length}/{achievements.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {achievements.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.id}
                    className={`relative rounded-2xl p-3 text-center transition-all ${
                      a.unlocked
                        ? `bg-gradient-to-br ${a.color} text-white shadow-md`
                        : "bg-muted/40 text-muted-foreground grayscale opacity-60"
                    }`}>
                    <Icon className="h-6 w-6 mx-auto mb-1" />
                    <div className="text-[10px] font-bold leading-tight">{a.label}</div>
                    {a.unlocked && (
                      <div className="absolute top-1 left-1 h-2 w-2 rounded-full bg-white shadow" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent attempts */}
        {derived.sorted.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />آخر محاولاتك
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...derived.sorted].reverse().slice(0, 8).map((a) => {
                const info = examTitles[a.exam_id];
                const pct = Math.round(Number(a.percentage || 0));
                return (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/student/exams/${a.exam_id}/result?attempt=${a.id}`)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted transition text-right">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      a.passed ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"
                    }`}>
                      {a.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{info?.title || "امتحان"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {info?.subject && <>{info.subject} • </>}
                        {new Date(a.submitted_at || a.started_at).toLocaleDateString("ar-EG")}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className={`text-lg font-black ${
                        pct >= 75 ? "text-green-600" : pct >= 50 ? "text-orange-500" : "text-red-500"
                      }`}>{pct}%</div>
                      <div className="text-[10px] text-muted-foreground">
                        {Math.round(Number(a.time_spent_seconds || 0) / 60)} د
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {derived.total === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center space-y-3">
              <Rocket className="h-12 w-12 mx-auto text-primary" />
              <h3 className="font-extrabold text-lg">ابدأ رحلتك التعليمية</h3>
              <p className="text-sm text-muted-foreground">
                حل أول امتحان وشوف إحصائياتك بتتحدث لحظة بلحظة
              </p>
              <Button onClick={() => navigate("/student/exams")}>
                <BookOpen className="h-4 w-4 ml-1" />استكشف الامتحانات
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </StudentLayout>
  );
}

function BigStat({ icon, label, value, sub, trend, color }: any) {
  return (
    <Card className={`bg-gradient-to-br ${color} text-white border-0 overflow-hidden relative`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 opacity-90">
          {icon}
          {typeof trend === "number" && trend !== 0 && (
            <span className={`text-[10px] font-bold flex items-center gap-0.5 bg-white/20 px-1.5 py-0.5 rounded-full`}>
              {trend > 0 ? "▲" : "▼"} {Math.abs(Math.round(trend))}%
            </span>
          )}
        </div>
        <div className="text-2xl font-extrabold">{value}</div>
        <div className="text-xs opacity-90">{label}</div>
        {sub && <div className="text-[10px] opacity-75 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon, label, value }: any) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground truncate">{label}</div>
          <div className="font-extrabold text-sm">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
