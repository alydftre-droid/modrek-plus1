import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "../shared/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, Calendar, Clock3, PlayCircle } from "lucide-react";

interface ProgressData {
  monthly: {
    month_key: string;
    month_label: string;
    videos_watched: number;
    exams_taken: number;
    active_days: number;
    watch_seconds: number;
  }[];
  heatmap: { date: string; count: number }[];
  first_login: string | null;
  last_login: string | null;
}

export function StudentProgressTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-student-progress", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_progress", { _student_id: studentId });
      if (error) throw error;
      return data as unknown as ProgressData;
    },
    refetchInterval: 60_000,
  });

  const chartData = useMemo(() =>
    (data?.monthly ?? []).map((m) => ({
      name: m.month_label,
      "فيديوهات": m.videos_watched,
      "امتحانات": m.exams_taken,
      "أيام نشطة": m.active_days,
      "ساعات": Math.round((m.watch_seconds ?? 0) / 3600),
    })),
    [data],
  );

  const totalWatchHours = useMemo(
    () => Math.round(((data?.monthly ?? []).reduce((a, b) => a + (b.watch_seconds ?? 0), 0)) / 3600),
    [data],
  );
  const totalActiveDays = useMemo(
    () => (data?.monthly ?? []).reduce((a, b) => a + (b.active_days ?? 0), 0),
    [data],
  );

  const heatmap = data?.heatmap ?? [];
  const heatMax = Math.max(1, ...heatmap.map((h) => h.count));

  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="ساعات المشاهدة" value={totalWatchHours.toLocaleString("ar-EG")} icon={Clock3} accent="blue" hint="آخر 12 شهر" />
        <StatCard label="أيام النشاط" value={totalActiveDays.toLocaleString("ar-EG")} icon={Activity} accent="purple" />
        <StatCard label="أول دخول" value={<span className="text-sm">{fmt(data?.first_login ?? null)}</span>} icon={Calendar} accent="green" />
        <StatCard label="آخر دخول" value={<span className="text-sm">{fmt(data?.last_login ?? null)}</span>} icon={PlayCircle} accent="amber" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-1">تقدم الطالب شهرياً</h3>
        <p className="text-xs text-slate-500 mb-3">آخر 12 شهر</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="فيديوهات" stroke="#3B82F6" fill="url(#gv)" strokeWidth={2} />
              <Area type="monotone" dataKey="امتحانات" stroke="#8B5CF6" fill="url(#ge)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">ساعات المشاهدة الشهرية</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                <Bar dataKey="ساعات" fill="#10B981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">أيام النشاط</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 12 }} />
                <Line type="monotone" dataKey="أيام نشطة" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-1">خريطة نشاط الطالب</h3>
        <p className="text-xs text-slate-500 mb-3">آخر 90 يوم — كل مربع يمثل يوماً</p>
        <div className="flex flex-wrap gap-1" dir="ltr">
          {Array.from({ length: 90 }).map((_, i) => {
            const day = new Date();
            day.setDate(day.getDate() - (89 - i));
            const key = day.toISOString().slice(0, 10);
            const cell = heatmap.find((h) => h.date.slice(0, 10) === key);
            const c = cell?.count ?? 0;
            const intensity = c === 0 ? 0 : Math.min(1, c / heatMax);
            const bg = c === 0 ? "#F1F5F9" : `rgba(59,130,246,${0.25 + intensity * 0.65})`;
            return (
              <div
                key={key}
                title={`${key} — ${c} نشاط`}
                className="w-3.5 h-3.5 rounded-[3px]"
                style={{ backgroundColor: bg }}
              />
            );
          })}
        </div>
      </div>

      {/* Monthly detailed table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">تفصيل شهري</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-right px-3 py-2.5">الشهر</th>
                <th className="text-right px-3 py-2.5">فيديوهات مكتملة</th>
                <th className="text-right px-3 py-2.5">امتحانات مُنجزة</th>
                <th className="text-right px-3 py-2.5">أيام نشطة</th>
                <th className="text-right px-3 py-2.5">ساعات مشاهدة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.monthly ?? []).map((m) => (
                <tr key={m.month_key} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{m.month_label}</td>
                  <td className="px-3 py-2.5">{m.videos_watched.toLocaleString("ar-EG")}</td>
                  <td className="px-3 py-2.5">{m.exams_taken.toLocaleString("ar-EG")}</td>
                  <td className="px-3 py-2.5">{m.active_days.toLocaleString("ar-EG")}</td>
                  <td className="px-3 py-2.5">{Math.round((m.watch_seconds ?? 0) / 3600).toLocaleString("ar-EG")} س</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
