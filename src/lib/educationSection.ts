export type StudentSectionValue = string | null | undefined;

const SCIENTIFIC_SECTION_VALUES = [
  "scientific",
  "science",
  "sci",
  "scientific section",
  "science section",
  "علمي",
  "علمى",
  "علم",
  "العلمي",
  "العلمى",
  "القسم العلمي",
  "القسم العلمى",
  "الشعبة العلمية",
  "الشعبه العلميه",
  "شعبة علمي",
  "شعبه علمي",
  "علمي علوم",
  "علمى علوم",
  "علوم",
  "علمي رياضة",
  "علمى رياضة",
  "رياضة",
  "رياضيات",
];
const LITERARY_SECTION_VALUES = [
  "literary",
  "arts",
  "art",
  "adabi",
  "adaby",
  "أدبي",
  "ادبي",
  "أدبى",
  "ادبى",
  "الأدبي",
  "الادبي",
  "الأدبى",
  "الادبى",
  "القسم الأدبي",
  "القسم الادبي",
  "القسم الأدبى",
  "القسم الادبى",
  "الشعبة الأدبية",
  "الشعبة الادبية",
  "الشعبه الادبيه",
  "شعبة أدبي",
  "شعبة ادبي",
  "شعبه ادبي",
];

export function normalizeSectionForSubjects(section: StudentSectionValue): "scientific" | "literary" | "" {
  const value = (section || "").trim().replace(/\s+/g, " ").toLowerCase();

  if (SCIENTIFIC_SECTION_VALUES.includes(value)) return "scientific";
  if (LITERARY_SECTION_VALUES.includes(value)) return "literary";

  return "";
}

export function sectionMatchesTarget(
  section: StudentSectionValue,
  target: StudentSectionValue
) {
  const normalizedTarget = normalizeSectionForSubjects(target);
  if (!normalizedTarget) return true;

  const normalizedSection = normalizeSectionForSubjects(section);
  if (!normalizedSection) return true;

  return normalizedSection === normalizedTarget;
}

export function isSharedSectionCategory(category: string) {
  const value = (category || "").toLowerCase().trim();
  return value === "math" || value === "arabic" || value.includes("عربي") || value === "religious" || value === "sharia" || value.includes("شرعي");
}

export function isScientificTrack(section: StudentSectionValue) {
  return normalizeSectionForSubjects(section) === "scientific";
}

export function isLiteraryTrack(section: StudentSectionValue) {
  return normalizeSectionForSubjects(section) === "literary";
}

export function isScienceSpecialty(section: StudentSectionValue) {
  return (section || "").trim() === "علمي علوم";
}

export function isMathSpecialty(section: StudentSectionValue) {
  return (section || "").trim() === "علمي رياضة";
}

export function formatSectionLabel(section: StudentSectionValue) {
  const value = (section || "").trim();
  const normalized = normalizeSectionForSubjects(value);

  if (normalized === "scientific") return "علمي";
  if (normalized === "literary") return "أدبي";

  return value;
}

export function getGeneralScientificSubjectNames(section: StudentSectionValue) {
  if (isScienceSpecialty(section)) {
    return ["الفيزياء", "الكيمياء", "الأحياء"];
  }

  if (isMathSpecialty(section)) {
    return ["الفيزياء", "الكيمياء", "الرياضيات"];
  }

  return ["الفيزياء", "الكيمياء", "الأحياء", "الرياضيات"];
}

/** Normalize education_type to canonical form */
export function normalizeEducationType(eduType: string | null | undefined): "عام" | "أزهر" | null {
  const v = (eduType || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (["عام", "general", "تعليم عام", "العام"].includes(v)) return "عام";
  if (["أزهر", "ازهر", "أزهري", "ازهري", "azhar", "azhari", "تعليم أزهري", "تعليم ازهري", "الأزهر", "الازهر"].includes(v)) return "أزهر";
  return null;
}

/** Check if a category requires education_type targeting (Arabic / Religious) */
export function requiresEducationTypeTargeting(category: string): boolean {
  const c = (category || "").toLowerCase().trim();
  return c === "arabic" || c.includes("عربي") || c === "religious" || c === "sharia" || c.includes("شرعي");
}

/** Check if education_type matches (null = matches all) */
export function matchesEducationType(
  contentEduType: string | null | undefined,
  studentEduType: string | null | undefined
): boolean {
  if (!contentEduType) return true; // null means available for both
  if (!studentEduType) return true; // student without type sees everything
  return normalizeEducationType(contentEduType) === normalizeEducationType(studentEduType);
}