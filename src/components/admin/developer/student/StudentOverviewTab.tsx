import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  ShieldOff,
  Users,
} from "lucide-react";
import { fetchStudentOverviewFallback, isSchemaCacheError } from "./fallbackData";

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

interface TeacherRow {
  teacher_id: string;
  teacher_name: string | null;
  specialty: string | null;
  courses_count: number;
}

const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
const dateFmt = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("ar-EG", { dateStyle: "medium" }) : "—";

export function StudentOverviewTab({ studentId }: { studentId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dev-student-overview", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_overview", { _student_id: studentId });
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentOverviewFallback(studentId) as Promise<Overview>;
        throw error;
      }
      return data as unknown as Overview;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["dev-student-teachers-with-subject", studentId],
    queryFn: async (): Promise<TeacherRow[]> => {
      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("group_id")
        .eq("student_id", studentId);
      const groupIds = [...new Set((purchases ?? []).map((p: any) => p.group_id).filter(Boolean))] as string[];
      if (!groupIds.length) return [];
      const { data: groups } = await supabase
        .from("content_groups")
        .select("id, teacher_id, created_by, subject_id")
        .in("id", groupIds);
      const teacherIds = [...new Set((groups ?? []).map((g: any) => g.teacher_id ?? g.created_by).filter(Boolean))] as string[];
      const subjectIds = [...new Set((groups ?? []).map((g: any) => g.subject_id).filter(Boolean))] as string[];
      const [{ data: profs }, { data: subjs }] = await Promise.all([
        teacherIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", teacherIds)
          : Promise.resolve({ data: [] as any[] }),
        subjectIds.length
          ? supabase.from("subjects").select("id, name").in("id", subjectIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      const sMap = new Map((subjs ?? []).map((s: any) => [s.id, s.name]));
      const byT = new Map<string, TeacherRow & { subjectSet: Set<string> }>();
      (groups ?? []).forEach((g: any) => {
        const tid = g.teacher_id ?? g.created_by;
        if (!tid) return;
        const row = byT.get(tid) ?? {
          teacher_id: tid,
          teacher_name: pMap.get(tid) ?? "معلم",
          specialty: null,
          courses_count: 0,
          subjectSet: new Set<string>(),
        };
        row.courses_count += 1;
        const sn = sMap.get(g.subject_id);
        if (sn) row.subjectSet.add(sn);
        byT.set(tid, row);
      });
      return [...byT.values()].map((r) => ({
        teacher_id: r.teacher_id,
        teacher_name: r.teacher_name,
        specialty: [...r.subjectSet].join("، ") || "—",
        courses_count: r.courses_count,
      }));
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-500 bg-white rounded-2xl border border-slate-200">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <p className="text-xs">جاري تحميل بيانات الطالب…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-rose-500" />
        <h4 className="font-bold text-rose-700">تعذّر تحميل بيانات الطالب</h4>
        <p className="text-xs text-rose-600/80">{(error as Error)?.message || "استجابة فارغة"}</p>
        <button
          onClick={() => refetch()}
          className="text-xs px-4 py-2 rounded-xl bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const { profile, stats } = data;
  const initials = profile.full_name?.trim().charAt(0) || "؟";

  const infoRows: [string, string][] = [
    ["الاسم", profile.full_name || "—"],
    ["كود الطالب", `#${profile.student_code || profile.id.slice(0, 6)}`],
    ["الصف / الشعبة", [profile.grade, profile.section].filter(Boolean).join(" - ") || "—"],
    ["النوع", profile.education_type || "—"],
    ["البريد", profile.email || "—"],
    ["الهاتف", profile.phone || "—"],
    ["تاريخ التسجيل", dateFmt(profile.created_at)],
  ];

  const academicRows: [string, string][] = [
    ["عدد المواد", fmt(stats.courses_count)],
    ["عدد المجموعات", fmt(stats.groups_count)],
    ["عدد المعلمين", fmt(stats.teachers_count)],
    ["الفيديوهات المتاحة", fmt(stats.videos_count)],
    ["فيديوهات تمّت مشاهدتها", fmt(stats.watched_videos)],
    ["نسبة الإكمال", `${fmt(stats.progress_percentage)}%`],
    ["امتحانات محلولة", fmt(stats.exams_count)],
    ["متوسط الدرجات", `${fmt(stats.average_score)}%`],
  ];

  const activityRows: [string, string][] = [
    ["أيام نشطة (30 يوم)", `${fmt(stats.active_days_30)} / 30`],
    ["نسبة النشاط", `${fmt(stats.activity_percentage)}%`],
    ["آخر نشاط", dateFmt(stats.last_activity)],
  ];

  return (
    <div dir="rtl" className="space-y-4">
      {/* HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center overflow-hidden text-xl font-black shrink-0">
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-slate-900 truncate">{profile.full_name}</h2>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                profile.is_banned ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {profile.is_banned ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
              {profile.is_banned ? "محظور" : "نشط"}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" />{profile.grade || "—"}</span>
            {profile.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{profile.email}</span>}
            {profile.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone}</span>}
          </div>
        </div>
      </div>

      {/* THREE INFO TABLES */}
      <InfoTable title="بيانات الطالب" rows={infoRows} />
      <InfoTable title="الملخص الأكاديمي" rows={academicRows} />
      <InfoTable title="النشاط" rows={activityRows} />

      {/* TEACHERS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50/60">
          <Users className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-800">المعلمون المشترك معهم</h3>
          <span className="mr-auto text-[11px] text-slate-500 tabular-nums">{fmt(teachers.length)}</span>
        </div>
        {teachers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">لا يوجد اشتراكات بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right px-3 py-2 font-semibold">#</th>
                  <th className="text-right px-3 py-2 font-semibold">اسم المعلم</th>
                  <th className="text-right px-3 py-2 font-semibold">التخصص</th>
                  <th className="text-right px-3 py-2 font-semibold">عدد الكورسات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t, i) => (
                  <tr key={t.teacher_id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-slate-500 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{t.teacher_name || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{t.specialty || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-700 font-bold">{fmt(t.courses_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="px-4 py-2.5 text-slate-500 w-1/2">{k}</td>
              <td className="px-4 py-2.5 font-semibold text-slate-900 tabular-nums text-left" dir="auto">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
