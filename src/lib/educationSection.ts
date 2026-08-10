export type StudentSectionValue = string | null | undefined;

const normalizeSectionLookupValue = (section: StudentSectionValue) =>
  (section || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي");

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
  "القسم العلمي",
  "الشعبة العلمية",
  "الشعبه العلميه",
  "شعبة علمي",
  "شعبه علمي",
  "علمي علوم",
  "علوم",
  "علمي رياضة",
  "رياضة",
  "رياضيات",
];
const LITERARY_SECTION_VALUES = [
  "literary",
  "arts",
  "art",
  "adabi",
  "adaby",
  "ادبي",
  "الادبي",
  "القسم الادبي",
  "الشعبة الادبية",
  "الشعبه الادبيه",
  "شعبة ادبي",
  "شعبه ادبي",
];

export function normalizeSectionForSubjects(section: StudentSectionValue): "scientific" | "literary" | "" {
  const value = normalizeSectionLookupValue(section);

  if (SCIENTIFIC_SECTION_VALUES.includes(value)) return "scientific";
  if (LITERARY_SECTION_VALUES.includes(value)) return "literary";
  if (value.includes("علمي") || value.includes("علوم") || value.includes("رياض")) return "scientific";
  if (value.includes("ادبي") || value.includes("literary") || value.includes("arts") || value.includes("adab")) return "literary";

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

/* ------------------------------------------------------------------------- */
/* Curriculum overrides (official 2026/2027 update)                          */
/* ------------------------------------------------------------------------- */

export type CurriculumScope = {
  stage?: string | null;
  grade?: string | null;
  section?: StudentSectionValue;
};

function normalizeCurriculumStage(stage: string | null | undefined) {
  const v = (stage || "").trim();
  if (v === "secondary" || v.includes("ثانوي")) return "secondary";
  if (v === "preparatory" || v.includes("إعداد") || v.includes("اعداد")) return "preparatory";
  return "";
}

function normalizeCurriculumGrade(grade: string | null | undefined) {
  const v = (grade || "").trim();
  if (["first", "second", "third"].includes(v)) return v;
  if (v.includes("الأول") || v.includes("الاول") || v === "1") return "first";
  if (v.includes("الثاني") || v === "2") return "second";
  if (v.includes("الثالث") || v === "3") return "third";
  return "";
}

/**
 * Subject swaps applied to an exact (stage + grade + section) cell only.
 * Nothing else in the platform is affected: other grades, other sections and
 * other stages keep their original subjects.
 */
const CURRICULUM_SUBJECT_SWAPS: Array<{
  stage: string;
  grade: string;
  section: "scientific" | "literary";
  from: string;
  to: string;
  /** subjects.category of the replacement subject row in the DB */
  toCategory: string;
}> = [
  {
    stage: "secondary",
    grade: "second",
    section: "scientific",
    from: "الأحياء",
    to: "التاريخ",
    toCategory: "literary",
  },
];

function findSwap(scope: CurriculumScope, subjectName?: string) {
  const stage = normalizeCurriculumStage(scope.stage);
  const grade = normalizeCurriculumGrade(scope.grade);
  const section = normalizeSectionForSubjects(scope.section);

  return CURRICULUM_SUBJECT_SWAPS.find(
    (swap) =>
      swap.stage === stage &&
      swap.grade === grade &&
      swap.section === section &&
      (!subjectName || subjectName.trim() === swap.from || subjectName.trim() === swap.to),
  );
}

/** True when this subject name is retired for this exact configuration. */
export function isSubjectRetiredForScope(subjectName: string, scope: CurriculumScope) {
  const swap = findSwap(scope, subjectName);
  return !!swap && subjectName.trim() === swap.from;
}

/**
 * DB `subjects.category` to use for a subject inside a given scope.
 * Needed when a replacement subject lives in another category
 * (e.g. التاريخ is a `literary` row even for the scientific section).
 */
export function subjectCategoryOverrideForScope(subjectName: string, scope: CurriculumScope) {
  const swap = findSwap(scope, subjectName);
  if (swap && subjectName.trim() === swap.to) return swap.toCategory;
  return null;
}

/**
 * Scientific-section subject names for a specific stage/grade/section,
 * with the official curriculum swaps applied.
 */
export function getScientificSubjectNames(scope: CurriculumScope) {
  const base = getGeneralScientificSubjectNames(scope.section);
  const swap = findSwap(scope);
  if (!swap) return base;
  return base.map((name) => (name === swap.from ? swap.to : name));
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