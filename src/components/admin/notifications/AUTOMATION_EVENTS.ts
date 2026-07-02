export type AutomationRecipientMode =
  | "actor"
  | "related"
  | "role_students"
  | "role_teachers"
  | "role_all";

export type AutomationEvent = {
  key: string;
  label: string;
  description: string;
  variables: { key: string; label: string; sample: string }[];
  defaultRecipient: AutomationRecipientMode;
};

export const AUTOMATION_EVENTS: AutomationEvent[] = [
  {
    key: "student.registered",
    label: "تسجيل طالب جديد",
    description: "يُفعّل تلقائيًا عند إنشاء أي حساب طالب.",
    variables: [
      { key: "full_name", label: "اسم الطالب", sample: "أحمد محمد" },
      { key: "email", label: "البريد", sample: "ahmed@mail.com" },
      { key: "phone", label: "الهاتف", sample: "01000000000" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "teacher.registered",
    label: "طلب تسجيل معلم",
    description: "عند إرسال طلب انضمام معلم جديد.",
    variables: [
      { key: "full_name", label: "اسم المعلم", sample: "أ. محمد علي" },
      { key: "email", label: "البريد", sample: "teacher@mail.com" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "teacher.approved",
    label: "قبول معلم",
    description: "عند قبول طلب معلم من الإدارة.",
    variables: [{ key: "full_name", label: "اسم المعلم", sample: "أ. محمد علي" }],
    defaultRecipient: "actor",
  },
  {
    key: "teacher.rejected",
    label: "رفض معلم",
    description: "عند رفض طلب معلم من الإدارة.",
    variables: [
      { key: "full_name", label: "اسم المعلم", sample: "أ. محمد علي" },
      { key: "reason", label: "السبب", sample: "بيانات غير مكتملة" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "subscription.created",
    label: "شراء اشتراك جديد",
    description: "عند اشتراك طالب في مادة.",
    variables: [
      { key: "subject", label: "اسم المادة", sample: "الرياضيات" },
      { key: "end_date", label: "تاريخ الانتهاء", sample: "2026-08-01" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "subscription.expiring_soon",
    label: "اقتراب انتهاء اشتراك",
    description: "مهمة يومية تُنبّه قبل انتهاء الاشتراك بـ 3 أيام.",
    variables: [
      { key: "subject", label: "اسم المادة", sample: "الفيزياء" },
      { key: "days_left", label: "الأيام المتبقية", sample: "2" },
      { key: "end_date", label: "تاريخ الانتهاء", sample: "2026-07-05" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "subscription.expired",
    label: "انتهاء اشتراك",
    description: "عند انتهاء اشتراك الطالب بالفعل.",
    variables: [
      { key: "subject", label: "اسم المادة", sample: "الكيمياء" },
      { key: "end_date", label: "تاريخ الانتهاء", sample: "2026-07-02" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "content.video_uploaded",
    label: "رفع فيديو جديد",
    description: "عند رفع فيديو من قِبل معلم.",
    variables: [
      { key: "title", label: "عنوان الفيديو", sample: "الدرس الأول" },
      { key: "subject", label: "اسم المادة", sample: "اللغة العربية" },
    ],
    defaultRecipient: "actor",
  },
  {
    key: "user.banned",
    label: "حظر مستخدم",
    description: "عند حظر أي حساب.",
    variables: [{ key: "full_name", label: "اسم المستخدم", sample: "المستخدم" }],
    defaultRecipient: "actor",
  },
  {
    key: "user.unbanned",
    label: "فك حظر مستخدم",
    description: "عند فك حظر أي حساب.",
    variables: [{ key: "full_name", label: "اسم المستخدم", sample: "المستخدم" }],
    defaultRecipient: "actor",
  },
];

export const RECIPIENT_MODES: { value: AutomationRecipientMode; label: string; help: string }[] = [
  { value: "actor", label: "المستخدم صاحب الحدث", help: "الطالب/المعلم الذي وقع عليه الحدث." },
  { value: "related", label: "مستخدم مرتبط", help: "مثال: معلم الطالب في حدث الاشتراك." },
  { value: "role_students", label: "كل الطلاب", help: "بث لكل الطلاب." },
  { value: "role_teachers", label: "كل المعلمين", help: "بث لكل المعلمين." },
  { value: "role_all", label: "الجميع", help: "بث لكل المستخدمين." },
];

export const KIND_LABEL: Record<string, string> = {
  normal: "عادي",
  important: "هام",
  urgent: "عاجل",
  warning: "تحذير",
  announcement: "إعلان",
  update: "تحديث",
};

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return (tpl || "").replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
