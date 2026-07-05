import { supabase } from "@/integrations/supabase/client";

export type SupportChannelKey = "whatsapp" | "messenger" | "assistant";

export type SupportUserContext = {
  name: string;
  role: "student" | "teacher" | "admin" | "user";
  studentCode: string;
  teacherCode: string;
  code: string;
  grade: string;
  stage: string;
  phone: string;
  email: string;
  appVersion: string;
  platform: string;
  device: string;
  time: string;
  date: string;
};

const DEFAULT_TEMPLATE = `مرحباً فريق الدعم،

الاسم: {{name}}
نوع الحساب: {{role}}
الكود: {{code}}
البريد: {{email}}
الهاتف: {{phone}}
الإصدار: {{appVersion}} ({{platform}})
الوقت: {{date}} {{time}}

المشكلة:
`;

const ROLE_LABEL: Record<string, string> = {
  student: "طالب",
  teacher: "معلم",
  admin: "مشرف",
  user: "مستخدم",
};

export async function loadSupportUserContext(userId: string): Promise<SupportUserContext> {
  const [{ data: profile }, { data: teacher }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, email, student_code, education_type, grade, stage, role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("teacher_profiles")
      .select("teacher_code, stage, subject")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const now = new Date();
  const role = (teacher ? "teacher" : (profile as any)?.role || "student") as SupportUserContext["role"];
  const platform =
    typeof window !== "undefined" && (window as any).Capacitor?.getPlatform
      ? (window as any).Capacitor.getPlatform()
      : "web";
  const device = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "";
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) || "";

  const studentCode = (profile as any)?.student_code || "";
  const teacherCode = (teacher as any)?.teacher_code || "";

  return {
    name: (profile as any)?.full_name || "",
    role,
    studentCode,
    teacherCode,
    code: role === "teacher" ? teacherCode : studentCode,
    grade: (profile as any)?.grade || "",
    stage: (teacher as any)?.stage || (profile as any)?.stage || "",
    phone: (profile as any)?.phone || "",
    email: (profile as any)?.email || "",
    appVersion,
    platform,
    device,
    time: now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString("ar-EG"),
  };
}

export function renderSupportTemplate(template: string, ctx: SupportUserContext): string {
  const src = (template && template.trim()) || DEFAULT_TEMPLATE;
  const roleLabel = ROLE_LABEL[ctx.role] || ctx.role;
  const values: Record<string, string> = {
    name: ctx.name || "-",
    role: roleLabel,
    studentCode: ctx.studentCode || "-",
    teacherCode: ctx.teacherCode || "-",
    code: ctx.code || "-",
    grade: ctx.grade || "-",
    stage: ctx.stage || "-",
    phone: ctx.phone || "-",
    email: ctx.email || "-",
    appVersion: ctx.appVersion || "-",
    platform: ctx.platform || "-",
    device: ctx.device || "-",
    time: ctx.time,
    date: ctx.date,
  };
  return src.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => values[k] ?? `{{${k}}}`);
}

export async function logSupportContact(
  userId: string,
  channel: SupportChannelKey,
  ctx: Pick<SupportUserContext, "role" | "code">,
) {
  try {
    await supabase.from("support_contact_logs").insert({
      user_id: userId,
      user_role: ctx.role,
      user_code: ctx.code || null,
      channel,
    });
  } catch (e) {
    console.warn("logSupportContact failed", e);
  }
}

export type SupportSettings = {
  whatsappStudent: string;
  whatsappTeacher: string;
  whatsappEnabled: boolean;
  messengerStudent: string;
  messengerTeacher: string;
  messengerEnabled: boolean;
  assistantEnabled: boolean;
  assistantDisplayName: string;
  messageTemplate: string;
};

const KEYS = [
  "support_whatsapp_student",
  "support_whatsapp_teacher",
  "support_whatsapp_enabled",
  "support_messenger_student",
  "support_messenger_teacher",
  "support_messenger_enabled",
  "support_assistant_enabled",
  "support_assistant_display_name",
  "support_message_template",
];

export async function loadSupportSettings(): Promise<SupportSettings> {
  const { data } = await supabase.from("platform_settings").select("key, value").in("key", KEYS);
  const m: Record<string, string> = {};
  (data || []).forEach((r: any) => { if (r?.value != null) m[r.key] = r.value; });
  const bool = (v: string | undefined, d = true) => (v === undefined ? d : v === "true" || v === "1");
  return {
    whatsappStudent: m.support_whatsapp_student || "",
    whatsappTeacher: m.support_whatsapp_teacher || "",
    whatsappEnabled: bool(m.support_whatsapp_enabled, true),
    messengerStudent: m.support_messenger_student || "",
    messengerTeacher: m.support_messenger_teacher || "",
    messengerEnabled: bool(m.support_messenger_enabled, false),
    assistantEnabled: bool(m.support_assistant_enabled, true),
    assistantDisplayName: m.support_assistant_display_name || "المساعد الذكي",
    messageTemplate: m.support_message_template || DEFAULT_TEMPLATE,
  };
}

export function buildWhatsappUrl(phone: string, text: string): string {
  const digits = (phone || "").replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildMessengerUrl(link: string, text: string): string {
  if (!link) return "";
  const url = link.trim();
  if (url.includes("m.me/") || url.includes("messenger.com")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}text=${encodeURIComponent(text)}`;
  }
  return url;
}
