import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "../shared/StatCard";
import {
  Activity,
  BookOpen,
  Calendar,
  FileText,
  GraduationCap,
  PlayCircle,
  ShieldCheck,
  ShieldOff,
  Star,
  Trophy,
  User,
  Users,
  Video,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Overview {
  profile: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    education_type: string | null;
    stage: string | null;
    grade: string | null;
    section: string | null;
    is_banned: boolean;
    created_at: string;
    student_code: string | null;
  };
  stats: {
    courses_count: number;
    groups_count: number;
    teachers_count: number;
    videos_count: number;
    pdfs_count: number;
    exams_count: number;
    average_score: number;
    progress_percentage: number;
    activity_percentage: number;
    active_days_30: number;
    watched_videos: number;
    last_activity: string | null;
  };
}

export function StudentOverviewTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-student-overview", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_overview", { _student_id: studentId });
      if (error) throw error;
      return data as unknown as Overview;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  const { profile, stats } = data;
  const fmt = (v: number) => v.toLocaleString("ar-EG");
  const dateFmt = (s: string | null) => (s ? new Date(s).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—");

  return (
    <div className="space-y-5">
      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-2xl font-bold shrink-0 overflow-hidden">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : profile.full_name?.charAt(0) || "؟"}
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-right">
          <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
            <h2 className="text-xl font-bold text-slate-900">{profile.full_name}</h2>
            {profile.is_banned ? (
              <span className="inline-flex items-center gap-1 text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full"><ShieldOff className="h-3 w-3" /> محظور</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><ShieldCheck className="h-3 w-3" /> نشط</span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">{profile.grade || "—"} {profile.section ? `• ${profile.section}` : ""} {profile.education_type ? `• ${profile.education_type}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 justify-center sm:justify-start">
            <span>#{profile.student_code || profile.id.slice(0, 6)}</span>
            {profile.email && <span>{profile.email}</span>}
            {profile.phone && <span>{profile.phone}</span>}
            <span>سُجّل: {new Date(profile.created_at).toLocaleDateString("ar-EG")}</span>
            <span>آخر نشاط: {dateFmt(stats.last_activity)}</span>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="عدد الكورسات" value={fmt(stats.courses_count)} icon={BookOpen} accent="blue" />
        <StatCard label="عدد المجموعات" value={fmt(stats.groups_count)} icon={Users} accent="purple" />
        <StatCard label="عدد المعلمين" value={fmt(stats.teachers_count)} icon={GraduationCap} accent="amber" />
        <StatCard label="عدد الفيديوهات" value={fmt(stats.videos_count)} icon={Video} accent="green" hint={`شوهد ${fmt(stats.watched_videos)}`} />
        <StatCard label="ملفات PDF" value={fmt(stats.pdfs_count)} icon={FileText} accent="slate" />
        <StatCard label="عدد الامتحانات" value={fmt(stats.exams_count)} icon={Trophy} accent="amber" />
        <StatCard label="متوسط الدرجات" value={`${fmt(stats.average_score)}%`} icon={Star} accent="green" />
        <StatCard label="نسبة التقدم" value={`${fmt(stats.progress_percentage)}%`} icon={PlayCircle} accent="blue" hint="فيديوهات مكتملة" />
        <StatCard label="نسبة النشاط" value={`${fmt(stats.activity_percentage)}%`} icon={Activity} accent="purple" hint={`${stats.active_days_30} يوم نشط / 30`} />
        <StatCard label="أيام نشطة" value={fmt(stats.active_days_30)} icon={Calendar} accent="slate" hint="آخر 30 يوماً" />
        <StatCard label="حالة الحساب" value={profile.is_banned ? "محظور" : "نشط"} icon={User} accent={profile.is_banned ? "red" : "green"} />
        <StatCard label="المرحلة" value={profile.stage || "—"} icon={GraduationCap} accent="blue" />
      </div>
    </div>
  );
}
