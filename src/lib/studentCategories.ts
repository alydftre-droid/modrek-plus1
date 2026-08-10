import { BookText, BookMarked, Beaker, Atom, Languages, Globe, Microscope, FlaskConical, Palette, type LucideIcon } from "lucide-react";
import { normalizeBundleStage, normalizeBundleGrade, normalizeBundleSection } from "@/lib/bundledPackages";
import { getGeneralScientificSubjectNames, isMathSpecialty, isScienceSpecialty } from "@/lib/educationSection";
import { normalizeSubjectSelectionName } from "@/lib/teacherSubjectUtils";

export interface CategoryDef {
  key: string;
  name: string;
  icon: LucideIcon;
  emoji: string;
  gradient: string;
  toneClass: string;
  /** DB subjects.category values that belong to this main button */
  dbCategories: string[];
  /** Optional restricted subject names (Arabic) inside the category, used for sub-buttons (الفيزياء…) */
  subjectNameFilter?: string[];
}

export interface StudentDashboardButton {
  key: string;
  name: string;
  icon: LucideIcon;
  toneClass: string;
  emoji: string;
  subtitle?: string;
  hasSubjects?: boolean;
}

const C = {
  arabic:    { key: "arabic",   name: "العربية",        icon: BookText,   emoji: "📖", gradient: "linear-gradient(135deg, hsl(15 85% 55%), hsl(35 85% 50%))",  toneClass: "dashboard-category-arabic", dbCategories: ["arabic"] },
  religious: { key: "religious",name: "الشرعية",        icon: BookMarked, emoji: "🕌", gradient: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 85% 45%))",  toneClass: "dashboard-category-religious", dbCategories: ["religious", "sharia"] },
  english:   { key: "english",  name: "English",         icon: Languages,  emoji: "🇬🇧", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))", toneClass: "dashboard-category-english", dbCategories: ["english"] },
  math:      { key: "math",     name: "الرياضيات",       icon: Atom,       emoji: "📐", gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", toneClass: "dashboard-category-science", dbCategories: ["math"], subjectNameFilter: ["الرياضيات"] },
  science:   { key: "science",  name: "العلوم",          icon: Beaker,     emoji: "🔬", gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))", toneClass: "dashboard-category-science", dbCategories: ["science", "integrated_science"] },
  integrated_science: { key: "integrated_science", name: "العلوم المتكاملة", icon: Atom, emoji: "⚛️", gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))", toneClass: "dashboard-category-science", dbCategories: ["integrated_science", "science"] },
  social:    { key: "social",   name: "الدراسات",        icon: Globe,      emoji: "🌍", gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", toneClass: "dashboard-category-social", dbCategories: ["studies"] },
  history_geo: { key: "history_geo", name: "التاريخ والجغرافيا", icon: Globe, emoji: "🗺️", gradient: "linear-gradient(135deg, hsl(28 90% 55%), hsl(20 85% 45%))", toneClass: "dashboard-category-social", dbCategories: ["literary"], subjectNameFilter: ["التاريخ", "الجغرافيا"] },
  history:   { key: "history",  name: "التاريخ",         icon: Globe,      emoji: "📜", gradient: "linear-gradient(135deg, hsl(35 90% 50%), hsl(45 85% 45%))", toneClass: "dashboard-category-social", dbCategories: ["literary"], subjectNameFilter: ["التاريخ"] },
  geography: { key: "geography",name: "الجغرافيا",        icon: Globe,      emoji: "🗺️", gradient: "linear-gradient(135deg, hsl(180 75% 45%), hsl(195 80% 50%))", toneClass: "dashboard-category-social", dbCategories: ["literary"], subjectNameFilter: ["الجغرافيا"] },
  scientific: { key: "scientific", name: "العلمية", icon: Atom, emoji: "⚛️", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(190 80% 50%))", toneClass: "dashboard-category-science", dbCategories: ["science", "scientific", "math"] },
  physics:   { key: "physics",  name: "الفيزياء",        icon: Atom,       emoji: "⚡", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))", toneClass: "dashboard-category-science", dbCategories: ["scientific", "science"], subjectNameFilter: ["الفيزياء"] },
  chemistry: { key: "chemistry",name: "الكيمياء",         icon: FlaskConical, emoji: "🧪", gradient: "linear-gradient(135deg, hsl(160 75% 45%), hsl(175 80% 40%))", toneClass: "dashboard-category-science", dbCategories: ["scientific", "science"], subjectNameFilter: ["الكيمياء"] },
  biology:   { key: "biology",  name: "الأحياء",          icon: Microscope, emoji: "🔬", gradient: "linear-gradient(135deg, hsl(140 70% 45%), hsl(95 70% 45%))", toneClass: "dashboard-category-science", dbCategories: ["scientific", "science"], subjectNameFilter: ["الأحياء", "الاحياء"] },
} satisfies Record<string, CategoryDef>;

export const ALL_CATEGORIES: Record<string, CategoryDef> = C;

export function getCategoryDef(key: string): CategoryDef | null {
  return (ALL_CATEGORIES as any)[key] || null;
}

export function getStudentDashboardButtons(opts: {
  educationType: string;
  stage: string;
  grade: string;
  section?: string | null;
}): StudentDashboardButton[] {
  const isAzhar = opts.educationType === "أزهر";
  const stage = normalizeBundleStage(opts.stage);
  const grade = normalizeBundleGrade(opts.grade);
  const section = opts.section || "";

  if (stage === "preparatory") {
    const buttons: StudentDashboardButton[] = [
      { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
    ];
    if (isAzhar) {
      buttons.push({ key: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" });
    }
    buttons.push(
      { key: "science", name: "العلوم", icon: Beaker, toneClass: "dashboard-category-science", emoji: "🔬" },
      { key: "math", name: "الرياضيات", icon: Atom, toneClass: "dashboard-category-science", emoji: "📐" },
      { key: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      { key: "social", name: "الدراسات", icon: Globe, toneClass: "dashboard-category-social", emoji: "🌍" },
    );
    return buttons;
  }

  if (stage === "secondary") {
    if (!isAzhar && grade === "first") {
      return [
        { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { key: "integrated_science", name: "العلوم المتكاملة", icon: Atom, toneClass: "dashboard-category-science", emoji: "⚛️" },
        { key: "math", name: "الرياضيات", icon: Palette, toneClass: "dashboard-category-science", emoji: "📐" },
        { key: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }

    if (isAzhar) {
      if (isLiterarySection(section)) {
        return [
          { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
          { key: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" },
          { key: "history_geo", name: "التاريخ والجغرافيا", icon: Globe, toneClass: "dashboard-category-social", emoji: "🗺️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
          { key: "math", name: "الرياضيات", icon: Palette, toneClass: "dashboard-category-science", emoji: "📐" },
          { key: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
        ];
      }

      return [
        { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { key: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" },
        { key: "scientific", name: "العلمية", icon: Atom, toneClass: "dashboard-category-science", emoji: "⚛️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
        { key: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }

    if (isScientificSection(section)) {
      return [
        { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { key: "scientific", name: "العلمية", icon: Atom, toneClass: "dashboard-category-science", emoji: "⚛️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
        { key: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }

    if (isLiterarySection(section)) {
      return [
        { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
        { key: "history_geo", name: "التاريخ والجغرافيا", icon: Globe, toneClass: "dashboard-category-social", emoji: "🗺️", subtitle: "اضغط لاختيار المادة", hasSubjects: true },
        { key: "math", name: "الرياضيات", icon: Palette, toneClass: "dashboard-category-science", emoji: "📐" },
        { key: "english", name: "English", icon: Languages, toneClass: "dashboard-category-english", emoji: "🇬🇧" },
      ];
    }
  }

  return [
    { key: "arabic", name: "العربية", icon: BookText, toneClass: "dashboard-category-arabic", emoji: "📖" },
    { key: "religious", name: "الشرعية", icon: BookMarked, toneClass: "dashboard-category-religious", emoji: "🕌" },
  ];
}

export function buildStudentCategoryPath(button: Pick<StudentDashboardButton, "key" | "hasSubjects">, opts: {
  stage: string;
  grade: string;
  section?: string | null;
  subjectName?: string | null;
  directToStudentSubject?: boolean;
  extraParams?: Record<string, string | null | undefined>;
}) {
  const params = new URLSearchParams({
    stage: opts.stage,
    grade: opts.grade,
    category: button.key,
  });

  if (opts.section) params.set("section", opts.section);
  if (opts.subjectName) params.set("subject_name", opts.subjectName);

  Object.entries(opts.extraParams || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const pathname = button.hasSubjects
    ? "/category-subjects"
    : opts.directToStudentSubject
      ? "/student-subject"
      : "/subjects";

  return `${pathname}?${params.toString()}`;
}

function isScientificSection(section: string) {
  const s = normalizeBundleSection(section);
  return s === "scientific";
}
function isLiterarySection(section: string) {
  return normalizeBundleSection(section) === "literary";
}

/**
 * Returns the same main buttons the STUDENT sees on their dashboard.
 * Admin uses this to build category-based bundles that mirror reality.
 */
export function getCategoriesForContext(opts: {
  educationType: string; // "عام" | "أزهر"
  stage: string;
  grade: string;
  section?: string | null;
}): CategoryDef[] {
  const isAzhar = opts.educationType === "أزهر";
  const stage = normalizeBundleStage(opts.stage);
  const grade = normalizeBundleGrade(opts.grade);
  const section = opts.section || "";

  if (stage === "preparatory") {
    const list = [C.arabic];
    if (isAzhar) list.push(C.religious);
    list.push(C.science, C.math, C.english, C.social);
    return list;
  }

  if (stage === "secondary") {
    // First secondary general → no section split (integrated science + math)
    if (!isAzhar && grade === "first") {
      return [C.arabic, C.integrated_science, C.math, C.english];
    }
    // Azhar
    if (isAzhar) {
      if (isLiterarySection(section)) {
        return [C.arabic, C.religious, C.history_geo, C.math, C.english];
      }
      return [C.arabic, C.religious, C.scientific, C.english];
    }
    // General second/third secondary
    if (isScientificSection(section)) {
      return [C.arabic, C.scientific, C.english];
    }
    if (isLiterarySection(section)) {
      return [C.arabic, C.history_geo, C.math, C.english];
    }
  }

  return [C.arabic, C.math, C.english];
}

/** Build a Supabase filter to fetch subjects belonging to a given category for student's stage/grade/section. */
export async function fetchSubjectsForCategory(supabase: any, categoryKey: string, ctx: {
  stage: string; grade: string; section?: string | null;
}) {
  const def = getCategoryDef(categoryKey);
  if (!def) return [];
  const stage = normalizeBundleStage(ctx.stage);
  const grade = normalizeBundleGrade(ctx.grade);
  const section = normalizeBundleSection(ctx.section || "");

  let q = supabase.from("subjects").select("id, name, category, section, stage, grade, is_active")
    .eq("is_active", true).in("category", def.dbCategories);
  if (stage) q = q.eq("stage", stage);
  if (grade) q = q.eq("grade", grade);
  const { data } = await q;
  let list = (data || []) as any[];
  if (section) list = list.filter((s) => !s.section || normalizeBundleSection(s.section) === section);
  if (def.subjectNameFilter && def.subjectNameFilter.length) {
    const names = def.subjectNameFilter;
    list = list.filter((s) => names.some((n) => s.name?.includes(n)));
  }
  return list;
}

/** Compute the min group price across all subjects of a category for display in preview cards. */
export async function fetchCategoryMinPrice(supabase: any, categoryKey: string, ctx: {
  stage: string; grade: string; section?: string | null;
}): Promise<number> {
  const subjects = await fetchSubjectsForCategory(supabase, categoryKey, ctx);
  const subjectIds = subjects.map((s: any) => s.id);
  if (subjectIds.length === 0) return 0;
  const { data: groups } = await supabase.from("content_groups").select("price")
    .in("subject_id", subjectIds).eq("is_active", true);
  if (!groups || groups.length === 0) return 0;
  return Math.min(...groups.map((g: any) => Number(g.price || 0)));
}

export interface BundleSubjectChoice {
  id: string;
  name: string;
  emoji: string;
}

const SCIENTIFIC_SUBJECT_CHOICES: Record<string, BundleSubjectChoice> = {
  "الفيزياء": { id: "physics", name: "الفيزياء", emoji: "⚡" },
  "الكيمياء": { id: "chemistry", name: "الكيمياء", emoji: "🧪" },
  "الأحياء": { id: "biology", name: "الأحياء", emoji: "🔬" },
  "الرياضيات": { id: "math", name: "الرياضيات", emoji: "📐" },
  "التاريخ": { id: "history", name: "التاريخ", emoji: "📜" },
};

function normalizeSubjectNameForMatch(value: string) {
  return normalizeSubjectSelectionName(value || "").replace(/^ال/, "").trim();
}

function subjectNameMatches(source: string, target: string) {
  return normalizeSubjectNameForMatch(source) === normalizeSubjectNameForMatch(target);
}

export function getBundleSubjectChoices(categoryKey: string, ctx: {
  stage: string; grade: string; section?: string | null;
}): BundleSubjectChoice[] {
  if (categoryKey === "history_geo") {
    return [
      { id: "history", name: "التاريخ", emoji: "📜" },
      { id: "geography", name: "الجغرافيا", emoji: "🗺️" },
    ];
  }

  if (categoryKey !== "scientific") return [];

  const section = ctx.section || "";
  const names = getScientificSubjectNames({ stage: ctx.stage, grade: ctx.grade, section });

  return names
    .map((name) => SCIENTIFIC_SUBJECT_CHOICES[normalizeSubjectSelectionName(name)])
    .filter(Boolean);
}

export async function fetchBundleSubjects(supabase: any, categoryKey: string, ctx: {
  stage: string; grade: string; section?: string | null;
}, subjectName?: string | null) {
  const normalizedSubjectName = normalizeSubjectSelectionName(subjectName || "");

  if (categoryKey === "scientific") {
    const stage = normalizeBundleStage(ctx.stage);
    const grade = normalizeBundleGrade(ctx.grade);
    const section = normalizeBundleSection(ctx.section || "");

    let q = supabase.from("subjects").select("id, name, category, section, stage, grade, is_active")
      .eq("is_active", true)
      // `literary` is included because an official curriculum swap can bring a
      // literary-category subject (التاريخ) into the scientific section; the
      // allowed-names filter below keeps the result scoped.
      .in("category", ["science", "scientific", "math", "literary"]);

    if (stage) q = q.eq("stage", stage);
    if (grade) q = q.eq("grade", grade);


    const { data } = await q;
    const allowedNames = (normalizedSubjectName
      ? [normalizedSubjectName]
      : getBundleSubjectChoices(categoryKey, ctx).map((choice) => choice.name)
    ).map((name) => normalizeSubjectSelectionName(name));

    return ((data || []) as any[])
      // Math is a shared subject across sections, so don't filter it out by section.
      .filter((subject) => !section || !subject.section || subject.category === "math" || normalizeBundleSection(subject.section) === section)
      .filter((subject) => allowedNames.length === 0 || allowedNames.some((name) => subjectNameMatches(subject.name, name)));
  }

  let list = await fetchSubjectsForCategory(supabase, categoryKey, ctx);
  if (normalizedSubjectName) {
    list = list.filter((subject: any) => subjectNameMatches(subject.name, normalizedSubjectName));
  }
  return list;
}
