export type GradeKey = "first" | "second" | "third";

const ARABIC_ORDINAL_TO_GRADE_KEY: Array<{ includes: string[]; key: GradeKey }> = [
  { includes: ["الأول"], key: "first" },
  { includes: ["الثاني"], key: "second" },
  { includes: ["الثالث"], key: "third" },
];

export function gradeKeyFromArabicLabel(labelOrKey: string): GradeKey | null {
  const v = (labelOrKey || "").trim();
  if (v === "first" || v === "second" || v === "third") return v;

  for (const item of ARABIC_ORDINAL_TO_GRADE_KEY) {
    if (item.includes.some((s) => v.includes(s))) return item.key;
  }
  return null;
}

type TeacherSelectionFilter = {
  /** subjects.category */
  categoryKey: string;
  /** optional exact subjects.name filter */
  subjectName?: string;
};

const NAME_FIXUPS: Record<string, string> = {
  "أحياء": "الأحياء",
  "فيزياء": "الفيزياء",
  "كيمياء": "الكيمياء",
  "جيولوجيا": "الجيولوجيا",
  "رياضيات": "الرياضيات",
  "تاريخ": "التاريخ",
  "جغرافيا": "الجغرافيا",
  "فلسفة": "الفلسفة",
  "لغة إنجليزية": "اللغة الإنجليزية",
  "لغة فرنسية": "اللغة الفرنسية",
};

/**
 * TeacherRegistrationForm saves `assigned_category` as an Arabic label (sometimes a grouped category like "المواد العربية",
 * and sometimes a single subject like "فيزياء"). This maps that selection to how rows are stored in `subjects`.
 */
export function subjectFilterFromTeacherSelection(selectionOrKey: string): TeacherSelectionFilter | null {
  const raw = (selectionOrKey || "").trim();
  if (!raw) return null;

  // Already a DB category key
  if (["arabic", "sharia", "science", "literary", "english", "french", "studies"].includes(raw)) {
    return { categoryKey: raw };
  }

  // Grouped selections
  if (raw === "المواد العربية") return { categoryKey: "arabic" };
  if (raw === "المواد الشرعية") return { categoryKey: "sharia" };

  // Languages
  if (raw === "لغة إنجليزية") return { categoryKey: "english", subjectName: NAME_FIXUPS[raw] };
  if (raw === "لغة فرنسية") return { categoryKey: "french", subjectName: NAME_FIXUPS[raw] };

  // Sciences (scientific section + preparatory)
  if (["أحياء", "فيزياء", "كيمياء", "جيولوجيا", "رياضيات"].includes(raw)) {
    return { categoryKey: "science", subjectName: NAME_FIXUPS[raw] || raw };
  }

  // Literary section
  if (["تاريخ", "جغرافيا", "فلسفة", "علم نفس"].includes(raw)) {
    return { categoryKey: "literary", subjectName: NAME_FIXUPS[raw] || raw };
  }

  return null;
}

export function teacherSelectionLabel(selectionOrKey: string) {
  const raw = (selectionOrKey || "").trim();
  if (!raw) return "";
  const map: Record<string, string> = {
    arabic: "المواد العربية",
    sharia: "المواد الشرعية",
    science: "العلوم",
    studies: "الدراسات",
    literary: "المواد الأدبية",
    english: "الإنجليزية",
    french: "الفرنسية",
  };
  return map[raw] || raw;
}
