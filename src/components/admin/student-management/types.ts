export interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  student_code: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
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
  teacher_name?: string;
}

export interface GradeSummary {
  grade: string;
  totalStudents: number;
  activeSubscribers: number;
}

export interface StageConfig {
  key: "اعدادي" | "ثانوي";
  label: string;
  description: string;
  icon: string;
  grades: string[];
}

export const STUDENT_STAGES: StageConfig[] = [
  {
    key: "اعدادي",
    label: "المرحلة الإعدادية",
    description: "متابعة الصفوف الثلاثة الإعدادية وحصر المشتركين النشطين.",
    icon: "📘",
    grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"],
  },
  {
    key: "ثانوي",
    label: "المرحلة الثانوية",
    description: "تحليل الصفوف الثانوية مع توزيع العلمي والأدبي والاشتراكات.",
    icon: "📗",
    grades: ["الصف الأول", "الصف الثاني", "الصف الثالث"],
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

export const formatCurrency = (value: number) => `${value.toLocaleString("ar-EG")} ج`;

export const gradeDisplayLabel = (stageKey: string, grade: string) => {
  if (stageKey === "اعدادي") return `${grade} الإعدادي`;
  if (stageKey === "ثانوي") return `${grade} الثانوي`;
  return grade;
};

export const sectionDisplayLabel = (value: string | null) => {
  if (!value) return "بدون قسم";
  if (value === "علمي") return "علمي";
  if (value === "أدبي") return "أدبي";
  return value;
};
