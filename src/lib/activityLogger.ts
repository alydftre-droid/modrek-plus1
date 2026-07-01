import { supabase } from "@/integrations/supabase/client";

type LogArgs = {
  action_type: string;
  action_label?: string;
  description?: string;
  subject_id?: string | null;
  group_id?: string | null;
  content_id?: string | null;
  teacher_id?: string | null;
  exam_id?: string | null;
  page_path?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
};

let cachedSessionId: string | null = null;
function getSessionId() {
  if (cachedSessionId) return cachedSessionId;
  try {
    const key = "modrek_session_id";
    let v = sessionStorage.getItem(key);
    if (!v) {
      v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, v);
    }
    cachedSessionId = v;
    return v;
  } catch {
    return null;
  }
}

function detectDevice(ua: string) {
  const s = ua.toLowerCase();
  let device_type = "desktop";
  if (/mobile|iphone|android.*mobile/.test(s)) device_type = "mobile";
  else if (/ipad|tablet/.test(s)) device_type = "tablet";
  let os = "unknown";
  if (/windows/.test(s)) os = "Windows";
  else if (/android/.test(s)) os = "Android";
  else if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/mac os/.test(s)) os = "macOS";
  else if (/linux/.test(s)) os = "Linux";
  let browser = "unknown";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/chrome/.test(s)) browser = "Chrome";
  else if (/firefox/.test(s)) browser = "Firefox";
  else if (/safari/.test(s)) browser = "Safari";
  return { device_type, os, browser };
}

async function getRole(userId: string): Promise<"admin" | "teacher" | "student" | null> {
  try {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data || []).map((r) => r.role as string);
    if (roles.includes("admin")) return "admin";
    if (roles.includes("teacher")) return "teacher";
    if (roles.includes("student")) return "student";
    return null;
  } catch { return null; }
}

async function baseFields(args: LogArgs) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const info = detectDevice(ua);
  return {
    action_type: args.action_type,
    action_label: args.action_label ?? null,
    description: args.description ?? null,
    page_path: args.page_path ?? (typeof window !== "undefined" ? window.location.pathname : null),
    user_agent: ua || null,
    device_type: info.device_type,
    browser: info.browser,
    os: info.os,
    session_id: getSessionId(),
    duration_seconds: args.duration_seconds ?? null,
    metadata: args.metadata ?? {},
  };
}

export async function logStudentActivity(args: LogArgs) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const base = await baseFields(args);
    await supabase.from("student_activity_logs").insert({
      student_id: user.id,
      ...base,
      subject_id: args.subject_id ?? null,
      group_id: args.group_id ?? null,
      content_id: args.content_id ?? null,
      teacher_id: args.teacher_id ?? null,
      exam_id: args.exam_id ?? null,
    });
  } catch (e) {
    console.debug("[activityLogger:student] failed", e);
  }
}

export async function logTeacherActivity(args: LogArgs) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const base = await baseFields(args);
    await supabase.from("teacher_activity_logs").insert({
      teacher_id: user.id,
      ...base,
    });
  } catch (e) {
    console.debug("[activityLogger:teacher] failed", e);
  }
}

/** Auto-route to the correct table based on user role. Safe to call from any page. */
export async function logActivity(args: LogArgs) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const role = await getRole(user.id);
    if (role === "teacher") return logTeacherActivity(args);
    if (role === "student") return logStudentActivity(args);
  } catch (e) {
    console.debug("[activityLogger] failed", e);
  }
}
