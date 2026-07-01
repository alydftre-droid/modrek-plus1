import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Calendar,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  PlayCircle,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { ReactNode } from "react";

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

const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
const dateFmt = (s: string | null) =>
  s ? new Date(s).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "لا يوجد نشاط بعد";

export function StudentOverviewTab({ studentId }: { studentId: string }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dev-student-overview", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_overview", { _student_id: studentId });
      if (error) throw error;
      return data as unknown as Overview;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-[240px] flex flex-col items-center justify-center gap-3 text-slate-500 bg-white rounded-3xl border border-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <p className="text-xs">جاري تحميل بيانات الطالب…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50/70 border border-rose-200 rounded-3xl text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-rose-500" />
        <h4 className="font-bold text-rose-700">تعذّر تحميل بيانات الطالب</h4>
        <p className="text-xs text-rose-600/80">{(error as Error)?.message || "استجابة فارغة من قاعدة البيانات"}</p>
        <button
          onClick={() => refetch()}
          className="text-xs px-4 py-2 rounded-xl bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100 transition"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const { profile, stats } = data;
  const initials = profile.full_name?.trim().charAt(0) || "؟";

  return (
    <div className="space-y-5">
      {/* HERO CARD */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-[0_10px_40px_-15px_rgba(16,185,129,0.5)]">
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 h-56 w-56 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 bg-teal-300/20 rounded-full blur-3xl" />

        <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-5">
          <div className="relative">
            <div className="h-24 w-24 rounded-3xl bg-white/15 backdrop-blur-md ring-4 ring-white/25 overflow-hidden flex items-center justify-center text-3xl font-black">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <span
              className={`absolute -bottom-1 -left-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md ${
                profile.is_banned ? "bg-rose-500 text-white" : "bg-white text-emerald-700"
              }`}
            >
              {profile.is_banned ? (
                <span className="inline-flex items-center gap-1"><ShieldOff className="h-3 w-3" /> محظور</span>
              ) : (
                <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> نشط</span>
              )}
            </span>
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-right">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-2xl font-black tracking-tight">{profile.full_name}</h2>
              {isFetching && <Loader2 className="h-4 w-4 animate-spin opacity-70" />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-white/90">
              <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{profile.grade || "—"}</span>
              {profile.section && <span className="inline-flex items-center gap-1">•{profile.section}</span>}
              {profile.education_type && <span className="inline-flex items-center gap-1">•{profile.education_type}</span>}
              <span className="inline-flex items-center gap-1 font-mono bg-white/15 rounded-full px-2 py-0.5">#{profile.student_code || profile.id.slice(0, 6)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-[11px] text-white/80">
              {profile.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {profile.email}</span>}
              {profile.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {profile.phone}</span>}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> سُجّل: {new Date(profile.created_at).toLocaleDateString("ar-EG")}</span>
            </div>
          </div>

          {/* Right side big metric */}
          <div className="hidden sm:flex flex-col items-center gap-1 pl-4 border-l border-white/20">
            <div className="text-[10px] uppercase tracking-widest text-white/70">متوسط الدرجات</div>
            <div className="text-4xl font-black tabular-nums">{fmt(stats.average_score)}<span className="text-lg">%</span></div>
            <div className="text-[10px] text-white/80">من {fmt(stats.exams_count)} امتحان</div>
          </div>
        </div>

        {/* Bottom progress bars */}
        <div className="relative bg-white/10 backdrop-blur-sm px-5 sm:px-6 py-3 grid grid-cols-2 gap-4">
          <ProgressLine label="التقدم في الفيديوهات" value={Number(stats.progress_percentage)} hint={`${fmt(stats.watched_videos)} / ${fmt(stats.videos_count)}`} />
          <ProgressLine label="النشاط خلال 30 يوم" value={Number(stats.activity_percentage)} hint={`${fmt(stats.active_days_30)} يوم نشط`} />
        </div>
      </div>

      {/* MAIN KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricTile
          label="الكورسات"
          value={fmt(stats.courses_count)}
          sub={`${fmt(stats.groups_count)} مجموعة`}
          icon={BookOpen}
          gradient="from-blue-500 to-indigo-500"
        />
        <MetricTile
          label="المعلمون"
          value={fmt(stats.teachers_count)}
          sub="تفاعل معهم الطالب"
          icon={GraduationCap}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <MetricTile
          label="الفيديوهات"
          value={fmt(stats.videos_count)}
          sub={`${fmt(stats.watched_videos)} تم مشاهدتها`}
          icon={Video}
          gradient="from-emerald-500 to-teal-500"
        />
        <MetricTile
          label="ملفات PDF"
          value={fmt(stats.pdfs_count)}
          sub="متوفرة للطالب"
          icon={FileText}
          gradient="from-slate-500 to-slate-700"
        />
        <MetricTile
          label="الامتحانات"
          value={fmt(stats.exams_count)}
          sub="محلولة ومُصححة"
          icon={Trophy}
          gradient="from-amber-500 to-orange-500"
        />
        <MetricTile
          label="متوسط الدرجة"
          value={`${fmt(stats.average_score)}%`}
          sub={Number(stats.average_score) >= 50 ? "أداء جيد" : "بحاجة لتحسّن"}
          icon={Star}
          gradient={Number(stats.average_score) >= 50 ? "from-emerald-500 to-green-500" : "from-rose-500 to-red-500"}
        />
        <MetricTile
          label="نسبة الإكمال"
          value={`${fmt(stats.progress_percentage)}%`}
          sub="من إجمالي المحتوى"
          icon={PlayCircle}
          gradient="from-cyan-500 to-sky-500"
        />
        <MetricTile
          label="آخر نشاط"
          value={stats.last_activity ? new Date(stats.last_activity).toLocaleDateString("ar-EG") : "—"}
          sub={dateFmt(stats.last_activity)}
          icon={Activity}
          gradient="from-purple-500 to-pink-500"
        />
      </div>

      {/* HEALTH INSIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <InsightCard
          icon={<Sparkles className="h-4 w-4" />}
          title="مستوى النشاط"
          value={Number(stats.activity_percentage) >= 60 ? "مرتفع" : Number(stats.activity_percentage) >= 30 ? "متوسط" : "منخفض"}
          hint={`${fmt(stats.active_days_30)} من 30 يوم`}
          tone={Number(stats.activity_percentage) >= 60 ? "emerald" : Number(stats.activity_percentage) >= 30 ? "amber" : "rose"}
        />
        <InsightCard
          icon={<TrendingUp className="h-4 w-4" />}
          title="أداء الامتحانات"
          value={Number(stats.average_score) >= 70 ? "ممتاز" : Number(stats.average_score) >= 50 ? "جيد" : "بحاجة متابعة"}
          hint={`${fmt(stats.exams_count)} امتحان بمتوسط ${fmt(stats.average_score)}%`}
          tone={Number(stats.average_score) >= 70 ? "emerald" : Number(stats.average_score) >= 50 ? "amber" : "rose"}
        />
        <InsightCard
          icon={<Users className="h-4 w-4" />}
          title="التنوّع الأكاديمي"
          value={`${fmt(stats.courses_count)} مادة`}
          hint={`مع ${fmt(stats.teachers_count)} معلم في ${fmt(stats.groups_count)} مجموعة`}
          tone="blue"
        />
      </div>
    </div>
  );
}

function ProgressLine({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[10px] text-white/80 mb-1">
        <span>{label}</span>
        <span className="tabular-nums font-semibold">{v}%</span>
      </div>
      <div className="h-1.5 bg-white/25 rounded-full overflow-hidden">
        <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${v}%` }} />
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-white/70 truncate">{hint}</div>}
    </div>
  );
}

function MetricTile({
  label, value, sub, icon: Icon, gradient,
}: { label: string; value: ReactNode; sub?: string; icon: any; gradient: string }) {
  return (
    <div className="group relative overflow-hidden bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className={`absolute -top-8 -left-8 h-24 w-24 rounded-full bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums leading-tight truncate">{value}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-1 truncate">{sub}</p>}
        </div>
        <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-md`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  icon, title, value, hint, tone,
}: { icon: ReactNode; title: string; value: string; hint: string; tone: "emerald" | "amber" | "rose" | "blue" }) {
  const tones = {
    emerald: "from-emerald-50 to-teal-50 border-emerald-100 text-emerald-700",
    amber:   "from-amber-50 to-orange-50 border-amber-100 text-amber-700",
    rose:    "from-rose-50 to-red-50 border-rose-100 text-rose-700",
    blue:    "from-blue-50 to-indigo-50 border-blue-100 text-blue-700",
  }[tone];
  return (
    <div className={`bg-gradient-to-br ${tones} border rounded-2xl p-4`}>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-xl font-black mt-2">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{hint}</div>
    </div>
  );
}
