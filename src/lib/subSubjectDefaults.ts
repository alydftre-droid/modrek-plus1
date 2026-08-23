type SubSubjectContext = {
  category?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
  subjectName?: string | null;
};

const ARABIC_SUBJECTS = ["النحو", "الصرف", "البلاغة", "الأدب والنصوص", "القراءة", "الإملاء", "التعبير"];
const SHARIA_PREPARATORY = ["التوحيد", "الحديث", "التفسير", "السيرة", "الفقه"];
const SHARIA_SECONDARY_FIRST_SECOND = ["التفسير", "الحديث", "التوحيد", "الفقه الشافعي"];
const SHARIA_SECONDARY_THIRD = ["التفسير", "الحديث", "التوحيد", "الفقه الشافعي", "الميراث"];
const STUDIES_SUBJECTS = ["التاريخ", "الجغرافيا"];
const MATH_PREPARATORY = ["الجبر", "الهندسة"];
const MATH_SECONDARY_FIRST = ["الجبر", "الهندسة", "حساب المثلثات"];
const MATH_SECONDARY_SECOND = ["الجبر", "حساب المثلثات", "الهندسة التحليلية"];
const MATH_SECONDARY_THIRD_SCIENTIFIC = ["الجبر", "الهندسة الفراغية", "التفاضل والتكامل", "الاستاتيكا", "الديناميكا"];

const normalizeLabel = (value?: string | null) =>
  String(value || "")
    .trim()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/^ال/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

// Leaf subjects: a subject whose own name is already one of the sections
// (for example a standalone "التاريخ" subject) never has sub-sections.
const LEAF_SUBJECT_NAMES = [
  ...ARABIC_SUBJECTS,
  ...SHARIA_SECONDARY_THIRD,
  ...SHARIA_PREPARATORY,
  ...STUDIES_SUBJECTS,
  ...MATH_SECONDARY_THIRD_SCIENTIFIC,
  ...MATH_SECONDARY_FIRST,
  ...MATH_SECONDARY_SECOND,
].map(normalizeLabel);

function isLeafSubject(subjectName?: string | null) {
  const label = normalizeLabel(subjectName);
  return Boolean(label) && LEAF_SUBJECT_NAMES.includes(label);
}

export function categorySupportsSubSubjects(category?: string | null) {
  const raw = String(category || "").trim();
  const normalized = raw.toLowerCase();
  if (isLeafSubject(raw)) return false;
  return ["arabic", "sharia", "religious", "studies", "social", "math"].includes(normalized)
    || normalized.includes("عرب")
    || normalized.includes("شرع")
    || normalized.includes("دراس")
    || normalized.includes("رياض");
}

export function getDefaultSubSubjects(context: SubSubjectContext): string[] {
  const category = String(context.category || "").trim().toLowerCase();
  const subjectName = String(context.subjectName || "").trim().toLowerCase();
  const scope = `${category} ${subjectName}`;
  const stage = String(context.stage || "").trim().toLowerCase();
  const grade = String(context.grade || "").trim().toLowerCase();
  const section = String(context.section || "").trim().toLowerCase();

  // A leaf subject (التاريخ، الجغرافيا، النحو ...) is itself a section.
  if (isLeafSubject(context.subjectName)) return [];

  if (category === "arabic" || scope.includes("عرب")) return ARABIC_SUBJECTS;

  if (category === "sharia" || category === "religious" || scope.includes("شرع")) {
    if (stage === "preparatory") return SHARIA_PREPARATORY;
    if (stage === "secondary" && grade === "third") return SHARIA_SECONDARY_THIRD;
    if (stage === "secondary") return SHARIA_SECONDARY_FIRST_SECOND;
    return SHARIA_PREPARATORY;
  }

  if (
    category === "studies"
    || category === "social"
    || scope.includes("دراس")
  ) {
    return STUDIES_SUBJECTS;
  }

  if (category === "math" || scope.includes("رياض")) {
    if (stage === "preparatory") return MATH_PREPARATORY;
    if (stage === "secondary" && grade === "first") return MATH_SECONDARY_FIRST;
    if (stage === "secondary" && grade === "second") return MATH_SECONDARY_SECOND;
    if (stage === "secondary" && grade === "third") return MATH_SECONDARY_THIRD_SCIENTIFIC;
    return MATH_PREPARATORY;
  }

  return [];
}

/**
 * True only when this subject really has sections (either defaults exist or the
 * teacher created some). Used to open plain subjects straight into upload mode.
 */
export function subjectHasSubSubjectPlan(context: SubSubjectContext): boolean {
  return getDefaultSubSubjects(context).length > 0;
}
