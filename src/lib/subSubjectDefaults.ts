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

export function categorySupportsSubSubjects(category?: string | null) {
  const normalized = String(category || "").trim().toLowerCase();
  return ["arabic", "sharia", "religious", "studies", "social", "math"].includes(normalized)
    || normalized.includes("عرب")
    || normalized.includes("شرع")
    || normalized.includes("دراس")
    || normalized.includes("تاريخ")
    || normalized.includes("جغراف")
    || normalized.includes("رياض");
}

export function getDefaultSubSubjects(context: SubSubjectContext): string[] {
  const category = String(context.category || "").trim().toLowerCase();
  const subjectName = String(context.subjectName || "").trim().toLowerCase();
  const scope = `${category} ${subjectName}`;
  const stage = String(context.stage || "").trim().toLowerCase();
  const grade = String(context.grade || "").trim().toLowerCase();
  const section = String(context.section || "").trim().toLowerCase();

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
    || scope.includes("تاريخ")
    || scope.includes("جغراف")
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