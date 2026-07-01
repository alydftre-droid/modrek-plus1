import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "../shared/StatCard";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { GraduationCap, PlayCircle, Clock, Percent, BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Monthly { period_label: string; period_start: string; exams_taken: number; avg_percentage: number; videos_watched: number; watch_hours: number; logins: number; }
interface VideoStat { group_id: string; group_title: string; subject_name: string | null; teacher_id: string | null; teacher_name: string | null; total_videos: number; fully_watched: number; partially_watched: number; not_opened: number; avg_completion: number; }
interface TeacherRow { teacher_id: string; teacher_name: string | null; avatar_url: string | null; courses_count: number; total_paid: number; last_interaction: string | null; }

export function StudentProgressTab({ studentId }: { studentId: string }) {
  const navigate = useNavigate();

  const monthly = useQuery({
    queryKey: ["dev-stu-monthly", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_progress_monthly", { _student_id: studentId, _months: 6 });
      if (error) throw error;
      return (data as unknown as Monthly[]) || [];
    },
    refetchInterval: 60_000,
  });

  const vids = useQuery({
    queryKey: ["dev-stu-videos", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_video_progress", { _student_id: studentId });
      if (error) throw error;
      return (data as unknown as VideoStat[]) || [];
    },
    refetchInterval: 60_000,
  });

  const teachers = useQuery({
    queryKey: ["dev-stu-teachers", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_teachers", { _student_id: studentId });
      if (error) throw error;
      return (data as unknown as TeacherRow[]) || [];
    },
    refetchInterval: 60_000,
  });

  if (monthly.isLoading || vids.isLoading || teachers.isLoading) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
  }

  const m = monthly.data || [];
  const v = vids.data || [];
  const t = teachers.data || [];
  const currentMonth = m[m.length - 1];
  const totalVideos = v.reduce((s, x) => s + x.total_videos, 0);
  const fullyWatched = v.reduce((s, x) => s + x.fully_watched, 0);
  const overallCompletion = totalVideos ? Math.round((fullyWatched / totalVideos) * 100) : 0;
  const solvedExamsAvg = m.filter((x) => x.exams_taken > 0);
  const overallExamAvg = solvedExamsAvg.length ? Math.round(solvedExamsAvg.reduce((s, x) => s + Number(x.avg_percentage), 0) / solvedExamsAvg.length) : 0;

  const monthlyChart = m.map((x) => ({
    name: x.period_label.slice(5),
    "ساعات المشاهدة": Number(x.watch_hours),
    "متوسط الامتحان %": Number(x.avg_percentage),
    "امتحانات": x.exams_taken,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="نسبة إكمال الفيديوهات" value={`${overallCompletion}%`} icon={Percent} accent="emerald" hint={`${fullyWatched} من ${totalVideos}`} />
        <StatCard label="ساعات مشاهدة الشهر" value={`${(currentMonth?.watch_hours || 0)}`} icon={Clock} accent="blue" />
        <StatCard label="متوسط الامتحانات" value={`${overallExamAvg}%`} icon={GraduationCap} accent="violet" />
        <StatCard label="فيديوهات جارية" value={v.reduce((s, x) => s + x.partially_watched, 0).toLocaleString("ar-EG")} icon={PlayCircle} accent="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">التقدم خلال 6 أشهر</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="ساعات المشاهدة" stroke="#059669" fill="#10b98133" />
              <Area type="monotone" dataKey="متوسط الامتحان %" stroke="#6366f1" fill="#6366f133" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">نسبة إكمال الفيديوهات لكل مجموعة</h3>
          {v.length === 0 ? (
            <EmptyState icon={PlayCircle} title="لا يوجد فيديوهات" description="لم يشترك الطالب في مجموعات تحتوي فيديوهات بعد." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={v.slice(0, 8).map((x) => ({ name: x.group_title.slice(0, 12), value: Number(x.avg_completion) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="value" fill="#059669" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">تفاصيل الفيديوهات لكل مجموعة</h3>
        </div>
        {v.length === 0 ? (
          <EmptyState icon={BookOpen} title="لا توجد مجموعات مشترك بها" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs">
                <tr>
                  <th className="text-right px-3 py-2.5 font-semibold">المجموعة</th>
                  <th className="text-right px-3 py-2.5 font-semibold">المادة</th>
                  <th className="text-right px-3 py-2.5 font-semibold">المعلم</th>
                  <th className="text-right px-3 py-2.5 font-semibold">الإجمالي</th>
                  <th className="text-right px-3 py-2.5 font-semibold">مكتمل</th>
                  <th className="text-right px-3 py-2.5 font-semibold">جزئي</th>
                  <th className="text-right px-3 py-2.5 font-semibold">لم يُفتح</th>
                  <th className="text-right px-3 py-2.5 font-semibold">% الإكمال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {v.map((x) => (
                  <tr key={x.group_id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{x.group_title}</td>
                    <td className="px-3 py-2.5">{x.subject_name || "—"}</td>
                    <td className="px-3 py-2.5">{x.teacher_name || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{x.total_videos}</td>
                    <td className="px-3 py-2.5 text-emerald-600 font-semibold tabular-nums">{x.fully_watched}</td>
                    <td className="px-3 py-2.5 text-amber-600 font-semibold tabular-nums">{x.partially_watched}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{x.not_opened}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${x.avg_completion}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 tabular-nums">{x.avg_completion}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">المعلمون الذين اشترك معهم الطالب</h3>
        {t.length === 0 ? (
          <EmptyState icon={GraduationCap} title="لم يشترك مع معلمين بعد" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {t.map((x) => (
              <div key={x.teacher_id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center text-slate-500 font-bold shrink-0">
                  {x.avatar_url ? <img src={x.avatar_url} alt="" className="h-full w-full object-cover" /> : (x.teacher_name?.charAt(0) || "؟")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-900 truncate">{x.teacher_name || "—"}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {x.courses_count} كورس • {Number(x.total_paid).toLocaleString("ar-EG")} ج
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => navigate(`/admin/developer/teacher/${x.teacher_id}`)}>
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
