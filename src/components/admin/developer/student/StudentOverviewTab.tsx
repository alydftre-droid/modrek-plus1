import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  ShieldOff,
  Users,
  Video,
} from "lucide-react";
import { useState } from "react";
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
    watch_minutes?: number;
    last_activity: string | null;
    wallet_balance?: number;
    total_spent?: number;
  };
  courses?: Array<{ id: string; name: string; teacher_name: string | null }>;
}

interface TeacherRow {
  teacher_id: string;
  teacher_name: string | null;
  specialty: string | null;
  courses_count: number;
}

const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");

export function StudentOverviewTab({ studentId }: { studentId: string }) {
  const [showAllCourses, setShowAllCourses] = useState(false);

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

  const { data: courses = [] } = useQuery({
    queryKey: ["dev-student-courses-list", studentId],
    queryFn: async () => {
      const { data: purchases } = await supabase
        .from("student_group_purchases")
        .select("group_id")
        .eq("student_id", studentId);
      const groupIds = [...new Set((purchases ?? []).map((p: any) => p.group_id).filter(Boolean))] as string[];
      if (!groupIds.length) return [] as Array<{ id: string; name: string; teacher_name: string }>;
      const { data: groups } = await supabase
        .from("content_groups")
        .select("id, name, teacher_id, created_by")
        .in("id", groupIds);
      const teacherIds = [...new Set((groups ?? []).map((g: any) => g.teacher_id ?? g.created_by).filter(Boolean))] as string[];
      const { data: profs } = teacherIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
        : { data: [] as any[] };
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return (groups ?? []).map((g: any) => ({
        id: g.id,
        name: g.name || "مجموعة",
        teacher_name: pMap.get(g.teacher_id ?? g.created_by) || "معلم",
      }));
    },
    staleTime: 60_000,
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
  const progress = Math.max(0, Math.min(100, Number(stats.progress_percentage || 0)));
  const walletBalance = Number((stats as any).wallet_balance ?? 0);
  const totalSpent = Number((stats as any).total_spent ?? 0);
  const watchMinutes = Number((stats as any).watch_minutes ?? 0);
  const visibleCourses = showAllCourses ? courses : courses.slice(0, 3);

  return (
    <div dir="rtl" className="space-y-4 pb-24">
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

      {/* التقدم الدراسي */}
      <Card title="التقدم الدراسي">
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #10b981 0%, #f59e0b 100%)",
            }}
          />
        </div>
        <p className="mt-3 text-emerald-600 font-bold text-sm">مكتمل {fmt(progress)}%</p>
      </Card>

      {/* المحفظة المالية */}
      <Card title="المحفظة المالية">
        <ul className="space-y-2.5 text-sm">
          <Bullet color="bg-emerald-500">
            <span className="text-slate-700">الرصيد الحالي:</span>{" "}
            <span className="font-bold text-blue-600 tabular-nums">{fmt(walletBalance)} جنيه</span>
          </Bullet>
          <Bullet color="bg-rose-500">
            <span className="text-slate-700">إجمالي الإنفاق:</span>{" "}
            <span className="font-bold text-rose-600 tabular-nums">{fmt(totalSpent)} جنيه</span>
          </Bullet>
        </ul>
      </Card>

      {/* الكورسات المشترك بها */}
      <Card title="الكورسات المشترك بها">
        {courses.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-2">لا يوجد اشتراكات بعد.</p>
        ) : (
          <>
            <ul className="space-y-2.5 text-sm">
              {visibleCourses.map((c) => (
                <Bullet key={c.id} color="bg-emerald-500">
                  <span className="text-slate-800">{c.name}</span>
                  <span className="text-slate-400"> · </span>
                  <span className="text-slate-600">{c.teacher_name}</span>
                </Bullet>
              ))}
            </ul>
            {courses.length > 3 && (
              <button
                onClick={() => setShowAllCourses((v) => !v)}
                className="mt-3 w-full py-2.5 rounded-xl bg-indigo-50 text-indigo-600 font-semibold text-sm inline-flex items-center justify-center gap-1 hover:bg-indigo-100"
              >
                {showAllCourses ? "عرض أقل" : "عرض الكل"}
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </Card>

      {/* نشاط الطالب */}
      <Card title="نشاط الطالب">
        <ul className="space-y-2.5 text-sm">
          <IconRow icon={Video} color="text-sky-500">
            <span className="text-slate-700">وقت المشاهدة:</span>{" "}
            <span className="font-bold text-slate-900 tabular-nums">{fmt(watchMinutes)} دقيقة</span>
          </IconRow>
          <IconRow icon={FileText} color="text-fuchsia-500">
            <span className="text-slate-700">امتحانات محلولة:</span>{" "}
            <span className="font-bold text-slate-900 tabular-nums">{fmt(stats.exams_count)}</span>
          </IconRow>
          <IconRow icon={Users} color="text-emerald-500">
            <span className="text-slate-700">معلمون مختارون:</span>{" "}
            <span className="font-bold text-slate-900 tabular-nums">{fmt(stats.teachers_count)}</span>
          </IconRow>
        </ul>
      </Card>

      {/* المعلمون المشترك معهم */}
      <Card title="المعلمون المشترك معهم">
        {teachers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-2">لا يوجد معلمون بعد.</p>
        ) : (
          <ul className="space-y-2.5 text-sm">
            {teachers.map((t) => (
              <Bullet key={t.teacher_id} color="bg-violet-500">
                <span className="font-semibold text-slate-900">{t.teacher_name || "معلم"}</span>
                <span className="text-slate-400"> · </span>
                <span className="text-slate-600">{t.specialty}</span>
              </Bullet>
            ))}
          </ul>
        )}
      </Card>

      {/* ACTION BUTTONS */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 flex gap-2 z-30 max-w-[900px] mx-auto">
        <button
          className="flex-1 py-3 rounded-2xl bg-rose-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm hover:bg-rose-600 active:scale-95 transition"
        >
          <Ban className="h-4 w-4" />
          {profile.is_banned ? "إلغاء الحظر" : "حظر الطالب"}
        </button>
        <button
          className="flex-1 py-3 rounded-2xl bg-violet-400 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm hover:bg-violet-500 active:scale-95 transition"
        >
          <FileText className="h-4 w-4" />
          تقرير مفصل
        </button>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <h3 className="text-base font-bold text-slate-900 text-center mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Bullet({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-2 h-2 w-2 rounded-full shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">{children}</div>
    </li>
  );
}

function IconRow({ icon: Icon, color, children }: { icon: any; color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">{children}</div>
    </li>
  );
}
