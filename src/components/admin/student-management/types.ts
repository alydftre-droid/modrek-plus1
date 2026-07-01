export interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  education_type: string | null;
  is_banned: boolean | null;
  created_at: string | null;
  avatar_url: string | null;
}

export interface StudentDeposit {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  payment_method: string | null;
}

export interface StudentPurchase {
  id: string;
  group_id: string;
  purchased_at: string;
  amount_paid: number | null;
  group_title?: string;
  subject_name?: string;
  teacher_name?: string;
}

export interface GradeSummary {
  grade: string;
  totalStudents: number;
  activeSubscribers: number;
}

export interface StageConfig {
  key: string;
  label: string;
  description: string;
  icon: string;
  grades: string[];
}

/* ─── DB uses English keys; UI shows Arabic ─── */
export const STAGE_KEY_MAP: Record<string, string> = {
  preparatory: "المرحلة الإعدادية",
  secondary: "المرحلة الثانوية",
};

const STAGE_QUERY_ALIASES: Record<string, string[]> = {
  preparatory: ["الإعدادية", "اعدادي", "إعدادي", "المرحلة الاعدادية"],
  secondary: ["الثانوية", "ثانوي", "المرحلة الثانوية"],
};

export const GRADE_KEY_MAP: Record<string, string> = {
  first: "الصف الأول",
  second: "الصف الثاني",
  third: "الصف الثالث",
};

const GRADE_QUERY_ALIASES: Record<string, string[]> = {
  first: ["الأول", "اول", "الاول", "صف أول", "الصف الاول"],
  second: ["الثاني", "تاني", "الصف الثاني"],
  third: ["الثالث", "تالت", "الصف الثالث"],
};

export const SECTION_KEY_MAP: Record<string, string> = {
  scientific: "علمي",
  literary: "أدبي",
};

export const STUDENT_STAGES: StageConfig[] = [
  {
    key: "preparatory",
    label: "المرحلة الإعدادية",
    description: "متابعة الصفوف الثلاثة الإعدادية وحصر المشتركين النشطين.",
    icon: "📘",
    grades: ["first", "second", "third"],
  },
  {
    key: "secondary",
    label: "المرحلة الثانوية",
    description: "تحليل الصفوف الثانوية مع توزيع العلمي والأدبي والاشتراكات.",
    icon: "📗",
    grades: ["first", "second", "third"],
  },
];

export const formatArabicDate = (value: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const formatArabicDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  const day = date.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} - ${time}`;
};

export const normalizeStageKey = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "preparatory" || normalized === "secondary") return normalized;

  if (["المرحلة الإعدادية", "المرحلة الاعدادية", "الإعدادية", "الاعدادية", "اعدادي", "إعدادي"].includes(value.trim())) {
    return "preparatory";
  }
  if (["المرحلة الثانوية", "الثانوية", "ثانوي"].includes(value.trim())) {
    return "secondary";
  }
  return null;
};

export const normalizeGradeKey = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "first" || normalized === "second" || normalized === "third") return normalized;

  if (["الأول", "الاول", "اول", "الصف الأول", "الصف الاول"].includes(value.trim())) return "first";
  if (["الثاني", "الصف الثاني", "تاني"].includes(value.trim())) return "second";
  if (["الثالث", "الصف الثالث", "تالت"].includes(value.trim())) return "third";
  return null;
};

export const stageQueryValues = (stageKey: string) =>
  Array.from(new Set([stageKey, STAGE_KEY_MAP[stageKey], ...(STAGE_QUERY_ALIASES[stageKey] ?? [])].filter(Boolean)));

export const gradeQueryValues = (gradeKey: string) =>
  Array.from(new Set([gradeKey, GRADE_KEY_MAP[gradeKey], ...(GRADE_QUERY_ALIASES[gradeKey] ?? [])].filter(Boolean)));

export const formatCurrency = (value: number) => `${value.toLocaleString("ar-EG")} جنيه`;

export const gradeDisplayLabel = (stageKey: string, grade: string) => {
  const gradeName = GRADE_KEY_MAP[grade] || grade;
  const stageName = stageKey === "preparatory" ? "الإعدادي" : stageKey === "secondary" ? "الثانوي" : stageKey;
  return `${gradeName} ${stageName}`;
};

export const sectionDisplayLabel = (value: string | null) => {
  if (!value) return "بدون قسم";
  return SECTION_KEY_MAP[value] || value;
};

export const paymentMethodLabel = (value: string | null) => {
  if (!value) return "-";
  const map: Record<string, string> = {
    vodafone_cash: "فودافون كاش",
    orange_cash: "أورانج كاش",
    etisalat_cash: "اتصالات كاش",
    instapay: "انستاباي",
    fawry: "فوري",
  };
  return map[value] || value;
};
