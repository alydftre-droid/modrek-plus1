// Utility functions for teacher subject page

const CATEGORY_MAP: Record<string, { categoryKey: string; subjectName?: string }> = {
  "المواد العربية": { categoryKey: "arabic" },
  "المواد الشرعية": { categoryKey: "religious" },
  "العلوم": { categoryKey: "science" },
  "الدراسات": { categoryKey: "social" },
  "الإنجليزية": { categoryKey: "english" },
  "المواد العلمية": { categoryKey: "scientific" },
  "المواد الأدبية": { categoryKey: "literary" },
  "الفرنسية": { categoryKey: "french" },
  // Also support category keys directly
  arabic: { categoryKey: "arabic" },
  religious: { categoryKey: "religious" },
  sharia: { categoryKey: "religious" },
  science: { categoryKey: "science" },
  social: { categoryKey: "social" },
  studies: { categoryKey: "social" },
  english: { categoryKey: "english" },
  scientific: { categoryKey: "scientific" },
  literary: { categoryKey: "literary" },
  french: { categoryKey: "french" },
};

const GRADE_MAP: Record<string, string> = {
  "الأول": "first",
  "الثاني": "second",
  "الثالث": "third",
  "الصف الأول": "first",
  "الصف الثاني": "second",
  "الصف الثالث": "third",
  first: "first",
  second: "second",
  third: "third",
};

export function gradeKeyFromArabicLabel(label: string): string | null {
  return GRADE_MAP[label] || null;
}

export function subjectFilterFromTeacherSelection(
  selection: string
): { categoryKey: string; subjectName?: string } | null {
  return CATEGORY_MAP[selection] || null;
}

export function teacherSelectionLabel(selection: string): string {
  const entry = CATEGORY_MAP[selection];
  if (!entry) return selection;
  
  const labelMap: Record<string, string> = {
    arabic: "المواد العربية",
    religious: "المواد الشرعية",
    science: "العلوم",
    social: "الدراسات",
    english: "الإنجليزية",
    scientific: "المواد العلمية",
    literary: "المواد الأدبية",
    french: "الفرنسية",
  };
  
  return labelMap[entry.categoryKey] || selection;
}
