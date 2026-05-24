import { supabase } from "@/integrations/supabase/client";
import { formatSectionLabel, normalizeSectionForSubjects, normalizeEducationType } from "@/lib/educationSection";
import { gradeDisplayFromAny, gradeKeyFromArabicLabel, stageDisplayFromAny, stageKeyFromValue } from "@/lib/teacherSubjectUtils";

export type EducationType = "عام" | "أزهر";
export type BundleStatus = "draft" | "scheduled" | "active" | "hidden" | "expired";

export interface BundledPackage {
  id: string;
  created_by: string;
  name: string | null;
  description: string | null;
  image_url: string | null;
  color: string | null;
  education_type: EducationType;
  stage: "preparatory" | "secondary";
  grade: string;
  section: string | null;
  discount_percentage: number;
  manual_final_price: number | null;
  status: BundleStatus;
  publish_at: string | null;
  expires_at: string | null;
  max_subscriptions: number | null;
  subscriptions_count: number;
  created_at: string;
  updated_at: string;
}

export interface BundlePrice {
  original: number;
  final: number;
  discount_amount: number;
  discount_percentage: number;
}

export interface BundleSubjectRecord {
  id: string;
  name: string;
  category: string | null;
  section?: string | null;
  stage?: string | null;
  grade?: string | null;
  is_active?: boolean | null;
}

export interface BundleAcademicTarget {
  educationType?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
}

export async function computeBundlePrice(packageId: string): Promise<BundlePrice> {
  const { data, error } = await supabase.rpc("compute_bundle_price" as any, { _package_id: packageId });
  if (error) throw error;
  return data as BundlePrice;
}

export function normalizeBundleStage(value: string | null | undefined) {
  return stageKeyFromValue(value || "") || (value || "").trim();
}

export function normalizeBundleGrade(value: string | null | undefined) {
  return gradeKeyFromArabicLabel(value || "") || (value || "").trim();
}

export function normalizeBundleSection(value: string | null | undefined) {
  return normalizeSectionForSubjects(value || "") || (value || "").trim();
}

export function displayBundleStage(value: string | null | undefined) {
  return stageDisplayFromAny(value || "", true);
}

export function displayBundleGrade(value: string | null | undefined) {
  const normalized = normalizeBundleGrade(value);
  if (normalized === "first") return "الصف الأول";
  if (normalized === "second") return "الصف الثاني";
  if (normalized === "third") return "الصف الثالث";
  return value || "";
}

export function displayBundleSection(value: string | null | undefined) {
  return formatSectionLabel(value || "") || "كل الشعب";
}

export function matchesBundleAcademicTarget(subject: BundleSubjectRecord, target: BundleAcademicTarget) {
  const targetStage = normalizeBundleStage(target.stage);
  const targetGrade = normalizeBundleGrade(target.grade);
  const targetSection = normalizeBundleSection(target.section);

  const subjectStage = normalizeBundleStage(subject.stage);
  const subjectGrade = normalizeBundleGrade(subject.grade);
  const subjectSection = normalizeBundleSection(subject.section);

  if (targetStage && subjectStage && subjectStage !== targetStage) return false;
  if (targetGrade && subjectGrade && subjectGrade !== targetGrade) return false;

  if (targetSection) {
    if (!subjectSection) return true;
    return subjectSection === targetSection;
  }

  return true;
}

export function matchesPackageToStudent(pkg: Pick<BundledPackage, "education_type" | "stage" | "grade" | "section">, student: BundleAcademicTarget) {
  const packageEducationType = normalizeEducationType(pkg.education_type);
  const studentEducationType = normalizeEducationType(student.educationType);

  if (packageEducationType && studentEducationType && packageEducationType !== studentEducationType) return false;
  if (normalizeBundleStage(pkg.stage) !== normalizeBundleStage(student.stage)) return false;
  if (normalizeBundleGrade(pkg.grade) !== normalizeBundleGrade(student.grade)) return false;

  const packageSection = normalizeBundleSection(pkg.section);
  const studentSection = normalizeBundleSection(student.section);
  if (!packageSection) return true;
  if (!studentSection) return false;

  return packageSection === studentSection;
}

export function hexToRgba(color: string | null | undefined, alpha: number) {
  const fallback = `rgba(16, 132, 96, ${alpha})`;
  if (!color) return fallback;

  const hex = color.replace("#", "").trim();
  const normalized = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function formatBundleAudience(pkg: Pick<BundledPackage, "grade" | "section" | "education_type">) {
  return [displayBundleGrade(pkg.grade), pkg.section ? displayBundleSection(pkg.section) : null, pkg.education_type]
    .filter(Boolean)
    .join(" • ");
}

export const GRADES_BY_STAGE: Record<"preparatory" | "secondary", string[]> = {
  preparatory: ["الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي"],
  secondary: ["الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"],
};

/** Returns whether a (eduType, grade) needs a section selection from the admin. */
export function gradeNeedsSection(eduType: EducationType, grade: string): boolean {
  if (eduType === "أزهر") {
    return grade.includes("ثانوي");
  }
  // عام
  return grade.includes("الثاني الثانوي") || grade.includes("الثالث الثانوي");
}

export function sectionsForGrade(eduType: EducationType, grade: string): { value: string; label: string }[] {
  if (!gradeNeedsSection(eduType, grade)) return [];
  if (eduType === "أزهر") {
    return [
      { value: "scientific", label: "علمي" },
      { value: "literary", label: "أدبي" },
    ];
  }
  if (grade.includes("الثالث الثانوي")) {
    return [
      { value: "science_track", label: "علمي علوم" },
      { value: "math_track", label: "علمي رياضة" },
      { value: "literary", label: "أدبي" },
    ];
  }
  // الثاني الثانوي عام
  return [
    { value: "scientific", label: "علمي" },
    { value: "literary", label: "أدبي" },
  ];
}
