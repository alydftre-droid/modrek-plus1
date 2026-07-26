import { supabase } from "@/integrations/supabase/client";

type AnyRow = Record<string, any>;

export interface StudentExamRow {
  exam_id: string;
  attempt_id: string | null;
  exam_title: string;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  group_id: string | null;
  group_title: string | null;
  grade: string | null;
  start_at: string | null;
  end_at: string | null;
  submitted_at: string | null;
  score: number;
  total: number;
  percentage: number;
  status: string;
  created_at: string;
}

export interface StudentLogRow {
  id: string;
  student_id: string;
  action_type: string;
  action_label: string | null;
  description: string | null;
  page_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  session_id: string | null;
  duration_seconds: number | null;
  metadata: AnyRow;
  created_at: string;
}

export const isSchemaCacheError = (error: unknown) => {
  const e = error as { code?: string; message?: string; details?: string } | null;
  const text = `${e?.code ?? ""} ${e?.message ?? ""} ${e?.details ?? ""}`.toLowerCase();
  return (
    text.includes("schema cache") ||
    text.includes("pgrst202") ||
    text.includes("pgrst205") ||
    text.includes("could not find") ||
    text.includes("permission denied") ||
    text.includes("not authorized") ||
    text.includes("42501") ||
    text.includes("p0001")
  );
};

const arr = <T = AnyRow>(rows: T[] | null | undefined): T[] => rows ?? [];
const asText = (value: unknown) => String(value ?? "");
const num = (value: unknown) => Number(value || 0);
const idSet = (rows: AnyRow[], key: string) => [...new Set(rows.map((row) => row[key]).filter(Boolean))] as string[];

async function safeSelect<T = AnyRow>(builder: PromiseLike<{ data: T[] | null; error: any }>) {
  const { data, error } = await builder;
  if (error) return [] as T[];
  return data ?? [];
}

async function getStudentGroups(studentId: string) {
  const purchases = await safeSelect(
    supabase.from("student_group_purchases").select("id, group_id, amount_paid, purchased_at").eq("student_id", studentId),
  );
  const groupIds = idSet(purchases, "group_id");
  const groups = groupIds.length
    ? await safeSelect(
        supabase
          .from("content_groups")
          .select("id, title, teacher_id, created_by, subject_id, price, is_active, created_at")
          .in("id", groupIds),
      )
    : [];
  return { purchases, groups, groupIds };
}

async function resolveLookups(rows: AnyRow[]) {
  const subjectIds = idSet(rows, "subject_id");
  const teacherIds = [...new Set([...idSet(rows, "teacher_id"), ...idSet(rows, "created_by")])] as string[];

  const [subjects, teachers] = await Promise.all([
    subjectIds.length ? safeSelect(supabase.from("subjects").select("id, name, grade").in("id", subjectIds)) : Promise.resolve([]),
    teacherIds.length ? safeSelect(supabase.from("profiles").select("id, full_name, avatar_url").in("id", teacherIds)) : Promise.resolve([]),
  ]);

  return {
    subjectMap: new Map(subjects.map((s: AnyRow) => [s.id, s])),
    teacherMap: new Map(teachers.map((t: AnyRow) => [t.id, t])),
  };
}

export function normalizeExamRows(data: unknown): StudentExamRow[] {
  const rows = Array.isArray(data) ? data : arr((data as AnyRow)?.rows);
  return rows.map((row: AnyRow) => ({
    exam_id: row.exam_id,
    attempt_id: row.attempt_id ?? null,
    exam_title: row.exam_title ?? row.title ?? "امتحان",
    subject_name: row.subject_name ?? null,
    teacher_id: row.teacher_id ?? null,
    teacher_name: row.teacher_name ?? null,
    group_id: row.group_id ?? null,
    group_title: row.group_title ?? null,
    grade: row.grade ?? null,
    start_at: row.start_at ?? null,
    end_at: row.end_at ?? null,
    submitted_at: row.submitted_at ?? null,
    score: num(row.score ?? row.total_score),
    total: num(row.total ?? row.max_score ?? row.total_marks),
    percentage: num(row.percentage),
    status: row.status === "submitted" || row.status === "graded" ? "solved" : asText(row.status || "missed"),
    created_at: row.created_at ?? new Date().toISOString(),
  }));
}

export async function fetchStudentOverviewFallback(studentId: string) {
  const [{ data: profile }, { purchases, groups }, attempts, videoProgress, logs, walletRow] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, email, phone, education_type, stage, grade, section, is_banned, created_at, student_code")
      .eq("id", studentId)
      .maybeSingle(),
    getStudentGroups(studentId),
    safeSelect(supabase.from("exam_attempts").select("percentage, status, submitted_at, created_at").eq("student_id", studentId)),
    safeSelect(supabase.from("video_progress").select("content_id, progress_seconds, duration_seconds, updated_at").eq("user_id", studentId)),
    fetchStudentLogsFallback(studentId, 500),
    supabase.from("wallets").select("balance").eq("user_id", studentId).maybeSingle(),
  ]);

  const content = groups.length
    ? await safeSelect(
        supabase
          .from("content")
          .select("id, type, group_id, is_active")
          .in("group_id", groups.map((g: AnyRow) => g.id)),
      )
    : [];
  const solved = attempts.filter((a: AnyRow) => a.submitted_at || ["submitted", "graded"].includes(asText(a.status)));
  const videos = content.filter((c: AnyRow) => c.type === "video" && c.is_active !== false);
  const pdfs = content.filter((c: AnyRow) => c.type === "pdf" && c.is_active !== false);
  const watchedVideos = videoProgress.filter((v: AnyRow) => num(v.duration_seconds) > 0 && num(v.progress_seconds) / num(v.duration_seconds) >= 0.9).length;
  const watchMinutes = Math.round(videoProgress.reduce((sum: number, v: AnyRow) => sum + num(v.progress_seconds), 0) / 60);
  const totalSpent = purchases.reduce((sum: number, p: AnyRow) => sum + num(p.amount_paid), 0);
  const walletBalance = num((walletRow as any)?.data?.balance);
  const activeDays = new Set(logs.filter((l) => Date.now() - new Date(l.created_at).getTime() <= 30 * 864e5).map((l) => l.created_at.slice(0, 10))).size;

  return {
    profile: profile ?? {
      id: studentId,
      full_name: "طالب",
      email: null,
      phone: null,
      avatar_url: null,
      education_type: null,
      stage: null,
      grade: null,
      section: null,
      is_banned: false,
      created_at: new Date().toISOString(),
      student_code: null,
    },
    stats: {
      courses_count: purchases.length,
      groups_count: purchases.length,
      teachers_count: new Set(groups.map((g: AnyRow) => g.teacher_id ?? g.created_by).filter(Boolean)).size,
      videos_count: videos.length,
      pdfs_count: pdfs.length,
      exams_count: solved.length,
      average_score: solved.length ? Math.round(solved.reduce((sum: number, a: AnyRow) => sum + num(a.percentage), 0) / solved.length) : 0,
      progress_percentage: videos.length ? Math.round((watchedVideos / videos.length) * 100) : 0,
      activity_percentage: Math.round((activeDays / 30) * 100),
      active_days_30: activeDays,
      watched_videos: watchedVideos,
      watch_minutes: watchMinutes,
      wallet_balance: walletBalance,
      total_spent: totalSpent,
      last_activity: logs[0]?.created_at ?? null,
    },
  };
}

export async function fetchStudentExamsFallback(studentId: string): Promise<StudentExamRow[]> {
  const [{ groups, groupIds }, attempts] = await Promise.all([
    getStudentGroups(studentId),
    safeSelect(
      supabase
        .from("exam_attempts")
        .select("id, exam_id, total_score, max_score, percentage, status, started_at, submitted_at, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
    ),
  ]);

  const exams = await safeSelect(
    supabase
      .from("exams")
      .select("id, title, subject_id, teacher_id, group_id, start_at, end_at, created_at, total_marks, is_published")
      .order("created_at", { ascending: false })
      .limit(1000),
  );
  const attemptMap = new Map<string, AnyRow>();
  attempts.forEach((a: AnyRow) => {
    const old = attemptMap.get(a.exam_id);
    if (!old || String(a.created_at ?? "") > String(old.created_at ?? "")) attemptMap.set(a.exam_id, a);
  });
  const eligible = exams.filter((e: AnyRow) =>
    attemptMap.has(e.id) || (e.is_published !== false && (!e.group_id || groupIds.includes(e.group_id))),
  );

  const { subjectMap, teacherMap } = await resolveLookups([...eligible, ...groups]);
  const groupMap = new Map(groups.map((g: AnyRow) => [g.id, g]));
  const now = Date.now();

  return eligible.map((e: AnyRow) => {
    const a = attemptMap.get(e.id);
    const end = e.end_at ? new Date(e.end_at).getTime() : null;
    const start = e.start_at ? new Date(e.start_at).getTime() : null;
    let status = "available";
    if (a?.submitted_at || ["submitted", "graded"].includes(asText(a?.status))) status = "solved";
    else if (a?.started_at && (!end || now < end)) status = "in_progress";
    else if (a?.started_at && end && now > end) status = "abandoned";
    else if (!a && end && now > end) status = "missed";
    else if (!a && start && now < start) status = "upcoming";
    const group = groupMap.get(e.group_id);
    const teacher = teacherMap.get(e.teacher_id ?? group?.teacher_id ?? group?.created_by);
    const subject = subjectMap.get(e.subject_id ?? group?.subject_id);
    return {
      exam_id: e.id,
      attempt_id: a?.id ?? null,
      exam_title: e.title ?? "امتحان",
      subject_name: subject?.name ?? null,
      teacher_id: e.teacher_id ?? group?.teacher_id ?? null,
      teacher_name: teacher?.full_name ?? null,
      group_id: e.group_id ?? null,
      group_title: group?.title ?? null,
      grade: subject?.grade ?? null,
      start_at: e.start_at ?? null,
      end_at: e.end_at ?? null,
      submitted_at: a?.submitted_at ?? null,
      score: num(a?.total_score),
      total: num(a?.max_score ?? e.total_marks),
      percentage: num(a?.percentage),
      status,
      created_at: a?.created_at ?? e.created_at ?? new Date().toISOString(),
    };
  });
}

export async function fetchStudentProgressMonthlyFallback(studentId: string, monthsCount = 6) {
  const [attempts, videoProgress, logs] = await Promise.all([
    safeSelect(supabase.from("exam_attempts").select("percentage, submitted_at, status").eq("student_id", studentId)),
    safeSelect(supabase.from("video_progress").select("content_id, progress_seconds, updated_at").eq("user_id", studentId)),
    fetchStudentLogsFallback(studentId, 1000),
  ]);
  return Array.from({ length: Math.max(1, monthsCount) }).map((_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (monthsCount - 1 - index));
    const key = date.toISOString().slice(0, 7);
    const monthAttempts = attempts.filter((a: AnyRow) => (a.submitted_at ?? "").slice(0, 7) === key && (a.submitted_at || ["submitted", "graded"].includes(asText(a.status))));
    const monthVideos = videoProgress.filter((v: AnyRow) => (v.updated_at ?? "").slice(0, 7) === key);
    const monthLogs = logs.filter((l) => l.created_at.slice(0, 7) === key && ["login", "page_view"].includes(l.action_type));
    return {
      period_label: key,
      period_start: date.toISOString(),
      exams_taken: monthAttempts.length,
      avg_percentage: monthAttempts.length ? Math.round(monthAttempts.reduce((sum: number, a: AnyRow) => sum + num(a.percentage), 0) / monthAttempts.length) : 0,
      videos_watched: new Set(monthVideos.map((v: AnyRow) => v.content_id).filter(Boolean)).size,
      watch_hours: Math.round((monthVideos.reduce((sum: number, v: AnyRow) => sum + num(v.progress_seconds), 0) / 3600) * 10) / 10,
      logins: monthLogs.length,
    };
  });
}

export async function fetchStudentVideoProgressFallback(studentId: string) {
  const { groups, groupIds } = await getStudentGroups(studentId);
  const videos = groupIds.length
    ? await safeSelect(supabase.from("content").select("id, group_id, type").eq("type", "video").in("group_id", groupIds))
    : [];
  const progress = videos.length
    ? await safeSelect(
        supabase
          .from("video_progress")
          .select("content_id, progress_seconds, duration_seconds")
          .eq("user_id", studentId)
          .in("content_id", videos.map((v: AnyRow) => v.id)),
      )
    : [];
  const progressMap = new Map(progress.map((p: AnyRow) => [p.content_id, p]));
  const { subjectMap, teacherMap } = await resolveLookups(groups);

  return groups.map((group: AnyRow) => {
    const groupVideos = videos.filter((v: AnyRow) => v.group_id === group.id);
    let full = 0;
    let partial = 0;
    let ratioSum = 0;
    groupVideos.forEach((video: AnyRow) => {
      const p = progressMap.get(video.id);
      const ratio = num(p?.duration_seconds) > 0 ? Math.min(num(p?.progress_seconds) / num(p?.duration_seconds), 1) : 0;
      ratioSum += ratio;
      if (ratio >= 0.9) full += 1;
      else if (ratio > 0) partial += 1;
    });
    const teacher = teacherMap.get(group.teacher_id ?? group.created_by);
    return {
      group_id: group.id,
      group_title: group.title ?? "مجموعة",
      subject_name: subjectMap.get(group.subject_id)?.name ?? null,
      teacher_id: group.teacher_id ?? group.created_by ?? null,
      teacher_name: teacher?.full_name ?? null,
      total_videos: groupVideos.length,
      fully_watched: full,
      partially_watched: partial,
      not_opened: Math.max(groupVideos.length - full - partial, 0),
      avg_completion: groupVideos.length ? Math.round((ratioSum / groupVideos.length) * 100) : 0,
    };
  });
}

export async function fetchStudentTeachersFallback(studentId: string) {
  // Only paid subscriptions count — chosen-but-not-subscribed teachers are excluded.
  const { purchases, groups } = await getStudentGroups(studentId);
  const { teacherMap } = await resolveLookups(groups);
  const byTeacher = new Map<string, AnyRow>();
  groups.forEach((group: AnyRow) => {
    const teacherId = group.teacher_id ?? group.created_by;
    if (!teacherId) return;
    const paid = purchases.filter((p: AnyRow) => p.group_id === group.id).reduce((sum: number, p: AnyRow) => sum + num(p.amount_paid), 0);
    const old = byTeacher.get(teacherId) ?? { teacher_id: teacherId, teacher_name: teacherMap.get(teacherId)?.full_name ?? null, avatar_url: teacherMap.get(teacherId)?.avatar_url ?? null, courses_count: 0, total_paid: 0, last_interaction: null, status: "subscribed" };
    old.courses_count += 1;
    old.total_paid += paid;
    old.last_interaction = purchases.find((p: AnyRow) => p.group_id === group.id)?.purchased_at ?? old.last_interaction;
    old.status = "subscribed";
    byTeacher.set(teacherId, old);
  });
  return [...byTeacher.values()];
}

export async function fetchStudentLogsFallback(studentId: string, limit = 1500): Promise<StudentLogRow[]> {
  const { data, error } = await supabase
    .from("student_activity_logs")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!error) return (data as StudentLogRow[]) ?? [];

  const usage = await safeSelect(
    supabase
      .from("usage_logs")
      .select("id, action, duration_minutes, created_at, content_id")
      .eq("user_id", studentId)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return usage.map((row: AnyRow) => ({
    id: row.id,
    student_id: studentId,
    action_type: row.action === "login" ? "login" : row.action === "video_watch" ? "video_watch" : "page_view",
    action_label: row.action ?? "نشاط",
    description: row.action ? `نشاط مسجل: ${row.action}` : "نشاط داخل المنصة",
    page_path: null,
    ip_address: null,
    user_agent: null,
    device_type: null,
    browser: null,
    os: null,
    session_id: null,
    duration_seconds: row.duration_minutes ? Math.round(num(row.duration_minutes) * 60) : null,
    metadata: { content_id: row.content_id, source: "usage_logs_fallback" },
    created_at: row.created_at,
  }));
}