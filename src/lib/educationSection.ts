export type StudentSectionValue = string | null | undefined;

const SCIENTIFIC_SECTION_VALUES = ["scientific", "علمي", "علمي علوم", "علمي رياضة"];
const LITERARY_SECTION_VALUES = ["literary", "أدبي"];

export function normalizeSectionForSubjects(section: StudentSectionValue): "scientific" | "literary" | "" {
  const value = (section || "").trim();

  if (SCIENTIFIC_SECTION_VALUES.includes(value)) return "scientific";
  if (LITERARY_SECTION_VALUES.includes(value)) return "literary";

  return "";
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

  if (value === "scientific") return "علمي";
  if (value === "literary") return "أدبي";

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