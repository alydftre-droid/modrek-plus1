import { BookText, BookMarked, Beaker, Atom, Languages, Globe, Microscope, FlaskConical, type LucideIcon } from "lucide-react";
import { normalizeBundleStage, normalizeBundleGrade, normalizeBundleSection } from "@/lib/bundledPackages";

export interface CategoryDef {
  key: string;
  name: string;
  icon: LucideIcon;
  emoji: string;
  gradient: string;
  /** DB subjects.category values that belong to this main button */
  dbCategories: string[];
  /** Optional restricted subject names (Arabic) inside the category, used for sub-buttons (الفيزياء…) */
  subjectNameFilter?: string[];
}

const C = {
  arabic:    { key: "arabic",   name: "العربية",        icon: BookText,   emoji: "📖", gradient: "linear-gradient(135deg, hsl(15 85% 55%), hsl(35 85% 50%))",  dbCategories: ["arabic"] },
  religious: { key: "religious",name: "الشرعية",        icon: BookMarked, emoji: "🕌", gradient: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 85% 45%))",  dbCategories: ["religious", "sharia"] },
  english:   { key: "english",  name: "English",         icon: Languages,  emoji: "🇬🇧", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))", dbCategories: ["english"] },
  math:      { key: "math",     name: "الرياضيات",       icon: Atom,       emoji: "📐", gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", dbCategories: ["math"], subjectNameFilter: ["الرياضيات"] },
  science:   { key: "science",  name: "العلوم",          icon: Beaker,     emoji: "🔬", gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))", dbCategories: ["science", "integrated_science"] },
  integrated_science: { key: "integrated_science", name: "العلوم المتكاملة", icon: Atom, emoji: "⚛️", gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))", dbCategories: ["integrated_science", "science"] },
  social:    { key: "social",   name: "الدراسات",        icon: Globe,      emoji: "🌍", gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))", dbCategories: ["studies"] },
  history_geo: { key: "history_geo", name: "التاريخ والجغرافيا", icon: Globe, emoji: "🗺️", gradient: "linear-gradient(135deg, hsl(28 90% 55%), hsl(20 85% 45%))", dbCategories: ["literary"], subjectNameFilter: ["التاريخ", "الجغرافيا"] },
  physics:   { key: "physics",  name: "الفيزياء",        icon: Atom,       emoji: "⚡", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))", dbCategories: ["scientific", "science"], subjectNameFilter: ["الفيزياء"] },
  chemistry: { key: "chemistry",name: "الكيمياء",         icon: FlaskConical, emoji: "🧪", gradient: "linear-gradient(135deg, hsl(160 75% 45%), hsl(175 80% 40%))", dbCategories: ["scientific", "science"], subjectNameFilter: ["الكيمياء"] },
  biology:   { key: "biology",  name: "الأحياء",          icon: Microscope, emoji: "🔬", gradient: "linear-gradient(135deg, hsl(140 70% 45%), hsl(95 70% 45%))", dbCategories: ["scientific", "science"], subjectNameFilter: ["الأحياء", "الاحياء"] },
} satisfies Record<string, CategoryDef>;

export const ALL_CATEGORIES: Record<string, CategoryDef> = C;

export function getCategoryDef(key: string): CategoryDef | null {
  return (ALL_CATEGORIES as any)[key] || null;
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
      // Azhar scientific or unset → expand العلمية into physics/chem/bio (so admin can bundle individual sciences)
      return [C.arabic, C.religious, C.physics, C.chemistry, C.biology, C.math, C.english];
    }
    // General second/third secondary
    if (isScientificSection(section)) {
      return [C.arabic, C.physics, C.chemistry, C.biology, C.math, C.english];
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
