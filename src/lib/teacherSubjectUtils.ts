export type GradeKey = "first" | "second" | "third";
export type StageKey = "preparatory" | "secondary";

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

export function normalizeSubjectSelectionName(value: string) {
  const raw = (value || "").trim();
  if (!raw) return "";

  if (NAME_FIXUPS[raw]) return NAME_FIXUPS[raw];

  const withoutPrefix = raw.replace(/^ال/, "").trim();
  const withPrefix = raw.startsWith("ال") ? raw : `ال${raw}`;

  return NAME_FIXUPS[withoutPrefix] || NAME_FIXUPS[withPrefix] || raw;
}

/**
 * TeacherRegistrationForm saves `assigned_category` as an Arabic label (sometimes a grouped category like "المواد العربية",
 * and sometimes a single subject like "فيزياء"). This maps that selection to how rows are stored in `subjects`.
 */
export function subjectFilterFromTeacherSelection(selectionOrKey: string): TeacherSelectionFilter | null {
  const raw = (selectionOrKey || "").trim();
  if (!raw) return null;

  // Already a DB category key
  if (["arabic", "sharia", "science", "literary", "english", "french", "studies", "integrated_science", "math"].includes(raw)) {
    return { categoryKey: raw };
  }

  // Grouped selections — do NOT force subjectName; actual subject rows
  // for studies/science at secondary level are split (e.g. التاريخ/الجغرافيا، الفيزياء/الكيمياء/الأحياء).
  // Restricting by name="الدراسات" or name="العلوم" would hide every real subject.
  if (raw === "المواد العربية") return { categoryKey: "arabic" };
  if (raw === "المواد الشرعية") return { categoryKey: "sharia" };
  if (raw === "علوم" || raw === "العلوم") return { categoryKey: "science" };
  if (raw === "دراسات" || raw === "الدراسات") return { categoryKey: "studies" };
  if (raw === "العلوم المتكاملة") return { categoryKey: "integrated_science" };

  // Languages
  if (raw === "لغة إنجليزية") return { categoryKey: "english", subjectName: NAME_FIXUPS[raw] };
  if (raw === "لغة فرنسية") return { categoryKey: "french", subjectName: NAME_FIXUPS[raw] };

  // Math is its own category (not science)
  if (raw === "رياضيات" || raw === "الرياضيات") {
    return { categoryKey: "math", subjectName: "الرياضيات" };
  }

  // Sciences (scientific section + preparatory)
  if (["أحياء", "فيزياء", "كيمياء", "جيولوجيا"].includes(raw)) {
    return { categoryKey: "science", subjectName: NAME_FIXUPS[raw] || raw };
  }

  // Literary section
  if (["تاريخ", "جغرافيا", "فلسفة", "علم نفس"].includes(raw)) {
    return { categoryKey: "literary", subjectName: NAME_FIXUPS[raw] || raw };
  }

  return null;
}

export function choiceCategoryKeyFromSelection(selectionOrKey: string, subjectName?: string) {
  const normalizedSubjectName = normalizeSubjectSelectionName(subjectName || "");
  if (normalizedSubjectName) return normalizedSubjectName;
  return (selectionOrKey || "").trim();
}

export function choiceCategoryVariantsFromSelection(selectionOrKey: string, subjectName?: string) {
  const raw = (selectionOrKey || "").trim();
  const normalizedSubjectName = normalizeSubjectSelectionName(subjectName || "");
  const filter = subjectFilterFromTeacherSelection(raw);
  const variants = new Set<string>();
  const legacyChoiceVariants: Record<string, string[]> = {
    arabic: ["arabic", "المواد العربية", "لغة عربية", "اللغة العربية"],
    sharia: ["sharia", "religious", "المواد الشرعية"],
    religious: ["sharia", "religious", "المواد الشرعية"],
    science: ["science", "scientific", "العلوم", "المواد العلمية"],
    scientific: ["science", "scientific", "العلوم", "المواد العلمية"],
    integrated_science: ["integrated_science", "العلوم المتكاملة"],
    literary: ["literary", "history_geo", "المواد الأدبية", "التاريخ والجغرافيا", "تاريخ", "التاريخ", "جغرافيا", "الجغرافيا"],
    history_geo: ["history_geo", "literary", "المواد الأدبية", "التاريخ والجغرافيا", "تاريخ", "التاريخ", "جغرافيا", "الجغرافيا"],
    math: ["math", "mathematics", "رياضيات", "الرياضيات"],
    english: ["english", "الإنجليزية", "لغة إنجليزية", "اللغة الإنجليزية"],
    french: ["french", "الفرنسية", "لغة فرنسية", "اللغة الفرنسية"],
  };

  if (raw) variants.add(raw);
  if (filter?.categoryKey) variants.add(filter.categoryKey);
  if (filter?.subjectName) variants.add(filter.subjectName);

  (legacyChoiceVariants[raw] || []).forEach((variant) => variants.add(variant));
  if (filter?.categoryKey) {
    (legacyChoiceVariants[filter.categoryKey] || []).forEach((variant) => variants.add(variant));
  }

  if (normalizedSubjectName) {
    variants.add(normalizedSubjectName);
    variants.add(normalizedSubjectName.replace(/^ال/, ""));
  }

  return Array.from(variants).filter(Boolean);
}

export function teacherSelectionLabel(selectionOrKey: string) {
  const raw = (selectionOrKey || "").trim();
  if (!raw) return "";
  const map: Record<string, string> = {
    arabic: "المواد العربية",
    sharia: "المواد الشرعية",
    "علوم": "العلوم",
    "دراسات": "الدراسات",
    "رياضيات": "الرياضيات",
    science: "العلوم",
    studies: "الدراسات",
    integrated_science: "العلوم المتكاملة",
    math: "الرياضيات",
    literary: "المواد الأدبية",
    english: "الإنجليزية",
    french: "الفرنسية",
  };
  return map[raw] || raw;
}

export function stageKeyFromValue(value: string): StageKey | null {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "preparatory" || normalized.includes("اعداد") || normalized.includes("إعداد")) {
    return "preparatory";
  }

  if (normalized === "secondary" || normalized.includes("ثانو")) {
    return "secondary";
  }

  return null;
}

export function gradeDisplayFromAny(value: string) {
  const key = gradeKeyFromArabicLabel(value);
  if (key === "first") return "الأول";
  if (key === "second") return "الثاني";
  if (key === "third") return "الثالث";
  return (value || "").replace(/^الصف\s*/, "").trim();
}

export function stageDisplayFromAny(value: string, short = true) {
  const key = stageKeyFromValue(value);
  if (key === "preparatory") return short ? "الإعدادي" : "المرحلة الإعدادية";
  if (key === "secondary") return short ? "الثانوي" : "المرحلة الثانوية";
  return value;
}
