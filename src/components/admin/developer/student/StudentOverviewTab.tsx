import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  ChevronLeft,
  FileText,
  Loader2,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
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
  status?: "chosen" | "subscribed";
}

const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");

// خريطة توحيد أسماء المواد الفرعية إلى المواد الرئيسية
const SUBJECT_ALIASES: Record<string, string> = {
  "الأدب": "اللغة العربية",
  "النحو": "اللغة العربية",
  "البلاغة": "اللغة العربية",
  "القراءة": "اللغة العربية",
  "النصوص": "اللغة العربية",
  "التعبير": "اللغة العربية",
};
const normalizeSubject = (name?: string | null) => {
  if (!name) return "—";
  const t = name.trim();
  return SUBJECT_ALIASES[t] || t;
};

export function StudentOverviewTab({ studentId }: { studentId: string }) {
  const [showAllCourses, setShowAllCourses] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("dev-student") });
    queryClient.refetchQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("dev-student"), type: "active" });
  }, [queryClient, studentId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dev-student-overview", studentId],
    queryFn: async () => {
      let overview: Overview | null = null;
      const { data, error } = await supabase.rpc("get_developer_student_overview", { _student_id: studentId });
      if (error) {
        if (isSchemaCacheError(error)) overview = (await fetchStudentOverviewFallback(studentId)) as Overview;
        else throw error;
      } else {
        overview = data as unknown as Overview;
      }
      if (!overview) throw new Error("empty");

      // Always enrich with fresh wallet / spend / watch numbers directly from the DB.
      // The RPC may be an older deployed version on the mirrored database and lack
      // wallet_balance / total_spent / watch_minutes, which would render as zeros.
      // Only enrich fields that are outside the "paid subscription" scope
      // (wallet balance & platform activity). All content/exam/video/teacher
      // stats come strictly from the RPC and are already scoped to paid groups.
      const [walletRes, activityRes, usageRes] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", studentId).maybeSingle(),
        supabase.from("student_activity_logs").select("duration_seconds").eq("student_id", studentId),
        supabase.from("usage_logs").select("duration_minutes").eq("user_id", studentId),
      ]);
      const liveWallet = Number((walletRes.data as any)?.balance || 0);
      const platformSeconds = ((activityRes.data as any[]) ?? []).reduce((s, row) => s + Number(row.duration_seconds || 0), 0);
      const legacyPlatformSeconds = ((usageRes.data as any[]) ?? []).reduce((s, row) => s + Number(row.duration_minutes || 0) * 60, 0);

      return {
        ...overview,
        stats: {
          ...overview.stats,
          wallet_balance: liveWallet,
          platform_minutes: Math.round(Math.max(platformSeconds, legacyPlatformSeconds) / 60),
        },
      } as Overview;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
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
        .select("id, title, section_name, teacher_id, created_by")
        .in("id", groupIds);
      const teacherIds = [...new Set((groups ?? []).map((g: any) => g.teacher_id ?? g.created_by).filter(Boolean))] as string[];
      const { data: profs } = teacherIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
        : { data: [] as any[] };
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return (groups ?? []).map((g: any) => ({
        id: g.id,
        name: g.title || g.section_name || "مجموعة",
        teacher_name: pMap.get(g.teacher_id ?? g.created_by) || "معلم",
      }));
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });

  const { data: teachers = [], isFetching: teachersFetching, dataUpdatedAt: teachersUpdatedAt, refetch: refetchTeachers } = useQuery({
    queryKey: ["dev-student-teachers-with-subject", studentId],
    queryFn: async (): Promise<TeacherRow[]> => {
      // Only show teachers the student is actually subscribed with (paid).
      // Chosen-but-not-subscribed teachers are intentionally excluded so the
      // developer view reflects reality, not intent.
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
          status: "subscribed",
          subjectSet: new Set<string>(),
        };
        row.courses_count += 1;
        row.status = "subscribed";
        const sn = normalizeSubject(sMap.get(g.subject_id));
        if (sn && sn !== "—") row.subjectSet.add(sn);
        byT.set(tid, row);
      });
      return [...byT.values()].map((r) => ({
        teacher_id: r.teacher_id,
        teacher_name: r.teacher_name,
        specialty: [...r.subjectSet].join("، ") || "—",
        courses_count: r.courses_count,
        status: r.status,
      }));
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
  });

  const { data: chosenOnlyTeachers = [] } = useQuery({
    queryKey: ["dev-student-chosen-only-teachers", studentId, teachers.map((t) => t.teacher_id).join(",")],
    queryFn: async (): Promise<TeacherRow[]> => {
      const { data: choices, error } = await supabase
        .from("student_teacher_choices")
        .select("teacher_id, category, stage, grade, created_at")
        .eq("student_id", studentId);
      if (error) {
        console.warn("[chosen-teachers] fetch failed", error);
        return [];
      }
      const subscribedIds = new Set(teachers.map((t) => t.teacher_id));
      const chosen = (choices ?? []).filter((c: any) => c.teacher_id && !subscribedIds.has(c.teacher_id));
      if (!chosen.length) return [];
      const teacherIds = [...new Set(chosen.map((c: any) => c.teacher_id))] as string[];
      const { data: profs, error: profsErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", teacherIds);
      if (profsErr) console.warn("[chosen-teachers] profiles fetch failed", profsErr);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

      // Map English category slugs & grade slugs to Arabic labels.
      const CATEGORY_AR: Record<string, string> = {
        math: "الرياضيات",
        arabic: "اللغة العربية",
        english: "اللغة الإنجليزية",
        science: "العلوم",
        scientific: "علمي",
        literary: "أدبي",
        religious: "التربية الدينية",
        physics: "الفيزياء",
        chemistry: "الكيمياء",
        biology: "الأحياء",
        geology: "الجيولوجيا",
        history: "التاريخ",
        geography: "الجغرافيا",
        philosophy: "الفلسفة",
        psychology: "علم النفس",
        statistics: "الإحصاء",
        economics: "الاقتصاد",
        french: "اللغة الفرنسية",
        german: "اللغة الألمانية",
        italian: "اللغة الإيطالية",
      };
      const GRADE_AR: Record<string, string> = {
        first: "الصف الأول",
        second: "الصف الثاني",
        third: "الصف الثالث",
      };
      const toArabic = (v?: string | null, map?: Record<string, string>) => {
        if (!v) return "";
        const key = String(v).trim().toLowerCase();
        return (map && map[key]) || v;
      };

      const byT = new Map<string, TeacherRow & { catSet: Set<string> }>();
      chosen.forEach((c: any) => {
        const p: any = pMap.get(c.teacher_id) ?? {};
        const row = byT.get(c.teacher_id) ?? {
          teacher_id: c.teacher_id,
          teacher_name: p.full_name ?? "معلم",
          specialty: null,
          courses_count: 0,
          status: "chosen" as const,
          catSet: new Set<string>(),
        };
        const subjAr = toArabic(c.category, CATEGORY_AR);
        const gradeAr = toArabic(c.grade, GRADE_AR);
        const label = [subjAr, gradeAr].filter(Boolean).join(" - ");
        if (label) row.catSet.add(label);
        byT.set(c.teacher_id, row);
      });
      return [...byT.values()].map((r) => ({
        teacher_id: r.teacher_id,
        teacher_name: r.teacher_name,
        specialty: [...r.catSet].join("، ") || "—",
        courses_count: 0,
        status: "chosen",
      }));
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
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
  const progress = Math.max(0, Math.min(100, Number(stats.progress_percentage || 0)));
  const walletBalance = Number((stats as any).wallet_balance ?? 0);
  const totalSpent = Number((stats as any).total_spent ?? 0);
  const watchMinutes = Number((stats as any).watch_minutes ?? 0);
  const platformMinutes = Number((stats as any).platform_minutes ?? 0);
  const visibleCourses = showAllCourses ? courses : courses.slice(0, 3);
  const teachersLastSync = teachersUpdatedAt ? new Date(teachersUpdatedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  return (
    <div dir="rtl" className="space-y-4 pb-2">
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
          <IconRow icon={Loader2} color="text-amber-500">
            <span className="text-slate-700">وقت النشاط على المنصة:</span>{" "}
            <span className="font-bold text-slate-900 tabular-nums">{fmt(platformMinutes)} دقيقة</span>
          </IconRow>
          <IconRow icon={FileText} color="text-fuchsia-500">
            <span className="text-slate-700">امتحانات محلولة:</span>{" "}
            <span className="font-bold text-slate-900 tabular-nums">{fmt(stats.exams_count)}</span>
          </IconRow>
          <IconRow icon={Users} color="text-emerald-500">
            <span className="text-slate-700">معلمون مشترك معهم:</span>{" "}
            <span className="font-bold text-slate-900 tabular-nums">{fmt(stats.teachers_count)}</span>
          </IconRow>
        </ul>
      </Card>

      {/* المعلمون المشترك معهم فعلياً */}
      <Card title="المعلمون الذين اشترك معهم الطالب فعلياً">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold text-emerald-700">
            <span className={`h-2 w-2 rounded-full bg-emerald-500 ${teachersFetching ? "animate-pulse" : ""}`} />
            يعرض فقط المعلمين الذين دفع الطالب اشتراكهم · آخر تحديث {teachersLastSync}
          </span>
          <button onClick={() => refetchTeachers()} className="text-[11px] font-bold text-emerald-700 underline-offset-4 hover:underline">
            تحديث الآن
          </button>
        </div>
        {teachers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-2">لم يشترك الطالب مع أي معلم بعد.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm text-right border-collapse">
              <thead>
                <tr className="bg-gradient-to-l from-violet-50 to-indigo-50 text-slate-700">
                  <th className="py-2.5 px-3 font-bold text-[12px] border-b border-slate-200">اسم المعلم</th>
                  <th className="py-2.5 px-3 font-bold text-[12px] border-b border-slate-200">التخصص</th>
                  <th className="py-2.5 px-3 font-bold text-[12px] border-b border-slate-200 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t, i) => (
                  <tr key={t.teacher_id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 text-[13px]">{t.teacher_name || "معلم"}</td>
                    <td className="py-2.5 px-3 text-slate-600 text-[13px]">{normalizeSubject(t.specialty)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[76px] h-6 px-2 rounded-full font-bold text-[12px] ${t.courses_count > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {t.courses_count > 0 ? `${fmt(t.courses_count)} كورس` : "مختار فقط"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* المعلمون المختارون بدون اشتراك */}
      <Card title="المعلمون الذين اختارهم الطالب ولم يشترك معهم بعد">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            معلمون اختارهم الطالب ولكن لم يدفع اشتراكهم
          </span>
        </div>
        {chosenOnlyTeachers.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-2">لا يوجد معلمون مختارون بدون اشتراك.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm text-right border-collapse">
              <thead>
                <tr className="bg-gradient-to-l from-amber-50 to-orange-50 text-slate-700">
                  <th className="py-2.5 px-3 font-bold text-[12px] border-b border-slate-200">اسم المعلم</th>
                  <th className="py-2.5 px-3 font-bold text-[12px] border-b border-slate-200">التخصص</th>
                  <th className="py-2.5 px-3 font-bold text-[12px] border-b border-slate-200 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {chosenOnlyTeachers.map((t, i) => (
                  <tr key={t.teacher_id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 text-[13px]">{t.teacher_name || "معلم"}</td>
                    <td className="py-2.5 px-3 text-slate-600 text-[13px]">{normalizeSubject(t.specialty)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center justify-center min-w-[76px] h-6 px-2 rounded-full font-bold text-[12px] bg-amber-100 text-amber-700">
                        مختار فقط
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
