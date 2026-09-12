import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  Percent,
  PlayCircle,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ReactNode } from "react";
import StoredImage from "@/components/common/StoredImage";
import {
  fetchStudentProgressMonthlyFallback,
  fetchStudentTeachersFallback,
  fetchStudentVideoProgressFallback,
  isSchemaCacheError,
} from "./fallbackData";

interface Monthly { period_label: string; period_start: string; exams_taken: number; avg_percentage: number; videos_watched: number; watch_hours: number; logins: number; }
interface VideoStat { group_id: string; group_title: string; subject_name: string | null; teacher_id: string | null; teacher_name: string | null; total_videos: number; fully_watched: number; partially_watched: number; not_opened: number; avg_completion: number; }
interface TeacherRow { teacher_id: string; teacher_name: string | null; avatar_url: string | null; courses_count: number; total_paid: number; last_interaction: string | null; status?: "chosen" | "subscribed"; }

const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");

export function StudentProgressTab({ studentId }: { studentId: string }) {
  const navigate = useNavigate();

  const monthly = useQuery({
    queryKey: ["dev-stu-monthly", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_progress_monthly", { _student_id: studentId, _months: 6 });
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentProgressMonthlyFallback(studentId, 6) as Promise<Monthly[]>;
        throw error;
      }
      return (data as unknown as Monthly[]) || [];
    },
    refetchInterval: 60_000, retry: 1,
  });

  const vids = useQuery({
    queryKey: ["dev-stu-videos", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_video_progress", { _student_id: studentId });
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentVideoProgressFallback(studentId) as Promise<VideoStat[]>;
        throw error;
      }
      return (data as unknown as VideoStat[]) || [];
    },
    refetchInterval: 60_000, retry: 1,
  });

  const teachers = useQuery({
    queryKey: ["dev-stu-teachers", studentId],
    queryFn: async () => {
      const [rpcResult, fallbackRows] = await Promise.all([
        supabase.rpc("get_developer_student_teachers", { _student_id: studentId }),
        fetchStudentTeachersFallback(studentId),
      ]);
      const { data, error } = rpcResult;
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentTeachersFallback(studentId) as Promise<TeacherRow[]>;
        throw error;
      }
      const byTeacher = new Map<string, TeacherRow>();
      (fallbackRows as TeacherRow[]).forEach((row) => byTeacher.set(row.teacher_id, row));
      ((data as unknown as TeacherRow[]) || []).forEach((row) => {
        const old = byTeacher.get(row.teacher_id);
        byTeacher.set(row.teacher_id, { ...old, ...row, status: row.courses_count > 0 ? "subscribed" : old?.status ?? "chosen" });
      });
      return [...byTeacher.values()];
    },
    refetchInterval: 60_000, retry: 1,
  });

  const anyLoading = monthly.isLoading || vids.isLoading || teachers.isLoading;
  const anyError = monthly.error || vids.error || teachers.error;

  if (anyLoading) {
    return (
      <div className="min-h-[240px] flex flex-col items-center justify-center gap-3 text-slate-500 bg-white rounded-3xl border border-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <p className="text-xs">جاري تحميل بيانات التقدم…</p>
      </div>
    );
  }

  if (anyError) {
    return (
      <div className="p-6 bg-rose-50/70 border border-rose-200 rounded-3xl text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-rose-500" />
        <h4 className="font-bold text-rose-700">تعذّر تحميل بيانات التقدم</h4>
        <p className="text-xs text-rose-600/80">{(anyError as Error)?.message}</p>
      </div>
    );
  }

  const m = monthly.data || [];
  const v = vids.data || [];
  const t = teachers.data || [];

  const totalVideos   = v.reduce((s, x) => s + x.total_videos, 0);
  const fullyWatched  = v.reduce((s, x) => s + x.fully_watched, 0);
  const partially     = v.reduce((s, x) => s + x.partially_watched, 0);
  const notOpened     = v.reduce((s, x) => s + x.not_opened, 0);
  const overallPct    = totalVideos ? Math.round((fullyWatched / totalVideos) * 100) : 0;

  const totalWatchHours = m.reduce((s, x) => s + Number(x.watch_hours || 0), 0);
  const totalLogins     = m.reduce((s, x) => s + Number(x.logins || 0), 0);
  const solvedMonths    = m.filter((x) => x.exams_taken > 0);
  const overallExamAvg  = solvedMonths.length ? Math.round(solvedMonths.reduce((s, x) => s + Number(x.avg_percentage), 0) / solvedMonths.length) : 0;

  const monthlyChart = m.map((x) => ({
    name: x.period_label?.slice(5) ?? "",
    "ساعات المشاهدة": Number(x.watch_hours || 0),
    "متوسط الامتحان": Number(x.avg_percentage || 0),
    "امتحانات": Number(x.exams_taken || 0),
    "دخول": Number(x.logins || 0),
  }));

  const videoChart = v.slice(0, 10).map((x) => ({
    name: (x.group_title || "").slice(0, 14),
    "مكتمل": x.fully_watched,
    "جزئي": x.partially_watched,
    "لم يُفتح": x.not_opened,
  }));

  return (
    <div className="dev-student-panel space-y-4">
      {/* Top KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ProgressStat label="نسبة إكمال المحتوى" value={`${overallPct}%`} sub={`${fmt(fullyWatched)} من ${fmt(totalVideos)} فيديو`} icon={Percent} tone="emerald" />
        <ProgressStat label="إجمالي ساعات المشاهدة" value={fmt(Math.round(totalWatchHours))} sub="خلال آخر 6 أشهر" icon={Clock} tone="blue" />
        <ProgressStat label="متوسط الامتحانات" value={`${overallExamAvg}%`} sub="من الأشهر النشطة" icon={Trophy} tone="violet" />
        <ProgressStat label="مرات الدخول" value={fmt(totalLogins)} sub="جلسة تسجيل دخول" icon={Activity} tone="amber" />
      </div>

      {/* Video status pie-like bars */}
      <div className="dev-student-section-card rounded-3xl p-5" data-tone="emerald">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <span className="dev-student-title-icon" data-tone="emerald"><PlayCircle /></span>
            حالة المحتوى المرئي
          </h3>
          <span className="text-[11px] text-slate-500">{fmt(totalVideos)} فيديو إجمالاً</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatusPill label="مكتمل" value={fullyWatched} total={totalVideos} tone="emerald" />
          <StatusPill label="جزئي"  value={partially}    total={totalVideos} tone="amber" />
          <StatusPill label="لم يُفتح" value={notOpened} total={totalVideos} tone="rose" />
        </div>
        <div className="h-2.5 w-full flex rounded-full overflow-hidden bg-slate-100">
          {totalVideos > 0 && (
            <>
              <div className="bg-emerald-500" style={{ width: `${(fullyWatched / totalVideos) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(partially / totalVideos) * 100}%` }} />
              <div className="bg-rose-400" style={{ width: `${(notOpened / totalVideos) * 100}%` }} />
            </>
          )}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="التقدم الشهري — ساعات ومتوسط الامتحان" icon={<TrendingUp />} tone="blue">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={monthlyChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.05} /></linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Area type="monotone" dataKey="ساعات المشاهدة" stroke="#059669" fill="url(#g1)" strokeWidth={2} />
              <Area type="monotone" dataKey="متوسط الامتحان" stroke="#6366f1" fill="url(#g2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="النشاط الشهري — الامتحانات ومرات الدخول" icon={<Activity />} tone="amber">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={monthlyChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Line type="monotone" dataKey="امتحانات" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="دخول"    stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="توزيع المشاهدة لكل مجموعة" icon={<BookOpen />} tone="emerald">
        {v.length === 0 ? (
          <EmptyBlock icon={PlayCircle} title="لا توجد مجموعات فيديوهات مشترك بها الطالب" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={videoChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="مكتمل" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="جزئي" stackId="a" fill="#f59e0b" />
              <Bar dataKey="لم يُفتح" stackId="a" fill="#fda4af" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Detailed groups table */}
      <div className="dev-student-section-card rounded-3xl overflow-hidden" data-tone="emerald">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <span className="dev-student-title-icon" data-tone="emerald"><Sparkles /></span>
            تفاصيل كل مجموعة
          </h3>
        </div>
        {v.length === 0 ? (
          <EmptyBlock icon={BookOpen} title="لا توجد مجموعات مشترك بها" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-right px-3 py-2.5 font-semibold">المجموعة</th>
                  <th className="text-right px-3 py-2.5 font-semibold">المادة</th>
                  <th className="text-right px-3 py-2.5 font-semibold">المعلم</th>
                  <th className="text-right px-3 py-2.5 font-semibold">إجمالي</th>
                  <th className="text-right px-3 py-2.5 font-semibold">مكتمل</th>
                  <th className="text-right px-3 py-2.5 font-semibold">جزئي</th>
                  <th className="text-right px-3 py-2.5 font-semibold">لم يُفتح</th>
                  <th className="text-right px-3 py-2.5 font-semibold">الإكمال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {v.map((x) => {
                  const pct = Math.round(Number(x.avg_completion || 0));
                  return (
                    <tr key={x.group_id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{x.group_title}</td>
                      <td className="px-3 py-2.5">{x.subject_name || "—"}</td>
                      <td className="px-3 py-2.5">{x.teacher_name || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmt(x.total_videos)}</td>
                      <td className="px-3 py-2.5 text-emerald-700 font-semibold tabular-nums">{fmt(x.fully_watched)}</td>
                      <td className="px-3 py-2.5 text-amber-700 font-semibold tabular-nums">{fmt(x.partially_watched)}</td>
                      <td className="px-3 py-2.5 text-rose-600 font-semibold tabular-nums">{fmt(x.not_opened)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-[110px]">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-slate-700 tabular-nums">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Teachers */}
      <div className="dev-student-section-card rounded-3xl p-5" data-tone="violet">
        <h3 className="text-sm font-black text-slate-900 mb-4 flex items-center gap-2">
          <span className="dev-student-title-icon" data-tone="violet"><GraduationCap /></span>
          المعلمون الذين اشترك معهم الطالب
        </h3>
        {t.length === 0 ? (
          <EmptyBlock icon={GraduationCap} title="لم يشترك مع معلمين بعد" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {t.map((x) => (
              <div key={x.teacher_id} className="group bg-gradient-to-br from-slate-50 to-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-md transition">
                <div className="dev-student-teacher-avatar h-12 w-12 rounded-2xl overflow-hidden flex items-center justify-center font-black shrink-0">
                  {x.avatar_url ? <StoredImage source={x.avatar_url} alt="" className="h-full w-full object-cover" /> : (x.teacher_name?.charAt(0) || "؟")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-900 truncate">{x.teacher_name || "—"}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {fmt(x.courses_count)} كورس • {fmt(Number(x.total_paid))} ج
                  </p>
                </div>
                <Button
                  size="sm"
                  className="dev-student-solid-btn dev-student-solid-btn--violet h-8 gap-1 px-3"
                  onClick={() => navigate(`/admin/developer/teacher/${x.teacher_id}`)}
                >
                  <ExternalLink className="h-3 w-3" /> فتح
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressStat({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: any; tone: "emerald" | "blue" | "violet" | "amber" }) {
  return (
    <div className="dev-student-metric-card rounded-2xl p-4" data-tone={tone}>
      <div className={`dev-student-card-glow dev-student-card-glow--${tone}`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="dev-student-metric-label text-[11px] font-medium truncate">{label}</p>
          <p className="dev-student-metric-value text-2xl font-black mt-1 tabular-nums leading-tight">{value}</p>
          <p className="dev-student-metric-sub text-[10px] mt-1 truncate">{sub}</p>
        </div>
        <div className="dev-student-metric-icon shrink-0 h-10 w-10 rounded-xl flex items-center justify-center" data-tone={tone}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, value, total, tone }: { label: string; value: number; total: number; tone: "emerald" | "amber" | "rose" }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="dev-student-metric-card rounded-2xl p-3 text-center" data-tone={tone}>
      <div className="dev-student-metric-sub text-[10px] font-bold">{label}</div>
      <div className="dev-student-metric-value text-xl font-black tabular-nums mt-1">{fmt(value)}</div>
      <div className="dev-student-metric-sub text-[10px] mt-0.5">{pct}%</div>
    </div>
  );
}

function ChartCard({ title, icon, tone, children }: { title: string; icon: ReactNode; tone: "emerald" | "blue" | "violet" | "amber"; children: ReactNode }) {
  return (
    <div className="dev-student-section-card rounded-3xl p-4" data-tone={tone}>
      <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
        <span className="dev-student-title-icon" data-tone={tone}>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyBlock({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="py-10 text-center text-slate-500">
      <Icon className="h-8 w-8 mx-auto mb-2 opacity-40" />
      <p className="text-xs">{title}</p>
    </div>
  );
}
