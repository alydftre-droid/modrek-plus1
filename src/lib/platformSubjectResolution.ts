/**
 * Single source of truth bridge:
 *   Teacher Registration selection (stage → grades → subjects → education type)
 *        ↓
 *   real rows in public.subjects  (id, name, category, stage, grade, section)
 *
 * The teacher-registration screen never shows raw `subjects` rows — it shows the
 * official stage/grade/category model from TeacherRegistrationForm. Teacher
 * Platforms now reuses exactly that model and resolves it to the real subject IDs
 * with the same filtering helpers the rest of the platform uses
 * (`subjectFilterFromTeacherSelection`, `gradeKeyFromArabicLabel`).
 */
import {
  PREPARATORY_SUBJECTS,
  SECONDARY_SUBJECTS,
  type TeacherFormData,
} from "@/components/auth/TeacherRegistrationForm";
import {
  gradeKeyFromArabicLabel,
  stageKeyFromValue,
  subjectFilterFromTeacherSelection,
} from "@/lib/teacherSubjectUtils";

export type PlatformSubjectRow = {
  id: string;
  name: string;
  category: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
};

export type ResolvedSubjectGroup = {
  /** Arabic selection label exactly as shown in teacher registration */
  selection: string;
  grade: string;
  stage: "preparatory" | "secondary";
  ids: string[];
  names: string[];
};

const INTEGRATED_SCIENCE_GRADE = "الصف الأول الثانوي";

/** Registration ordering: preparatory list first, then the secondary-only extras. */
export const OFFICIAL_SUBJECT_ORDER: string[] = (() => {
  const ordered: string[] = [];
  [...PREPARATORY_SUBJECTS, ...SECONDARY_SUBJECTS].forEach((s) => {
    if (!ordered.includes(s)) ordered.push(s);
  });
  return ordered;
})();

function stageFromGradeLabel(grade: string): "preparatory" | "secondary" | null {
  return stageKeyFromValue(grade);
}

/**
 * Resolves the teacher-registration style selection into the real subject IDs.
 * Grouped per (selection × grade) so the admin sees the same logical structure
 * used on the official registration screen, not one row per sub-subject.
 */
export function resolveSubjectGroups(
  scope: Pick<TeacherFormData, "grades" | "subjects" | "teachesIntegratedScience">,
  rows: PlatformSubjectRow[],
): ResolvedSubjectGroup[] {
  const selections = (scope.subjects || []).slice().sort(
    (a, b) => OFFICIAL_SUBJECT_ORDER.indexOf(a) - OFFICIAL_SUBJECT_ORDER.indexOf(b),
  );
  const groups: ResolvedSubjectGroup[] = [];

  const pushGroup = (selection: string, grade: string, stage: "preparatory" | "secondary") => {
    const filter = subjectFilterFromTeacherSelection(selection);
    if (!filter) return;
    const gKey = gradeKeyFromArabicLabel(grade);
    if (!gKey) return;

    const matched = rows.filter((row) => {
      if ((row.category || "").trim() !== filter.categoryKey) return false;
      if (filter.subjectName && (row.name || "").trim() !== filter.subjectName) return false;
      if (stageKeyFromValue(row.stage || "") !== stage) return false;
      return gradeKeyFromArabicLabel(row.grade || "") === gKey;
    });
    if (matched.length === 0) return;

    groups.push({
      selection,
      grade,
      stage,
      ids: matched.map((r) => r.id),
      names: Array.from(new Set(matched.map((r) => r.name))),
    });
  };

  selections.forEach((selection) => {
    (scope.grades || []).forEach((grade) => {
      const stage = stageFromGradeLabel(grade);
      if (!stage) return;
      pushGroup(selection, grade, stage);
    });
  });

  if (scope.teachesIntegratedScience && (scope.grades || []).includes(INTEGRATED_SCIENCE_GRADE)) {
    pushGroup("العلوم المتكاملة", INTEGRATED_SCIENCE_GRADE, "secondary");
  }

  return groups;
}

export function resolveSubjectIds(
  scope: Pick<TeacherFormData, "grades" | "subjects" | "teachesIntegratedScience">,
  rows: PlatformSubjectRow[],
): string[] {
  const ids = new Set<string>();
  resolveSubjectGroups(scope, rows).forEach((g) => g.ids.forEach((id) => ids.add(id)));
  return Array.from(ids);
}

/** Reverse mapping (used when editing an existing platform). */
export function scopeFromSubjectIds(
  subjectIds: string[],
  rows: PlatformSubjectRow[],
): Pick<TeacherFormData, "stages" | "grades" | "subjects" | "educationType" | "teachesIntegratedScience"> {
  const selected = new Set(subjectIds);
  const stages = new Set<"preparatory" | "secondary">();
  const grades = new Set<string>();
  const subjects = new Set<string>();
  let integrated = false;

  const gradeLabel = (stage: "preparatory" | "secondary", grade: string) => {
    const key = gradeKeyFromArabicLabel(grade);
    const ordinal = key === "first" ? "الأول" : key === "second" ? "الثاني" : key === "third" ? "الثالث" : null;
    if (!ordinal) return null;
    return `الصف ${ordinal} ${stage === "preparatory" ? "الإعدادي" : "الثانوي"}`;
  };

  rows.forEach((row) => {
    if (!selected.has(row.id)) return;
    const stage = stageKeyFromValue(row.stage || "");
    if (!stage) return;
    stages.add(stage);
    const label = gradeLabel(stage, row.grade || "");
    if (label) grades.add(label);

    const candidates = OFFICIAL_SUBJECT_ORDER.filter((selection) => {
      const filter = subjectFilterFromTeacherSelection(selection);
      if (!filter) return false;
      if (filter.categoryKey !== (row.category || "").trim()) return false;
      return !filter.subjectName || filter.subjectName === (row.name || "").trim();
    });
    candidates.forEach((c) => {
      if (c === "العلوم المتكاملة") integrated = true;
      else subjects.add(c);
    });
  });

  return {
    stages: Array.from(stages),
    grades: Array.from(grades),
    subjects: Array.from(subjects).sort(
      (a, b) => OFFICIAL_SUBJECT_ORDER.indexOf(a) - OFFICIAL_SUBJECT_ORDER.indexOf(b),
    ),
    educationType: "",
    teachesIntegratedScience: integrated,
  };
}
