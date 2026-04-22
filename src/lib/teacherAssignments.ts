import { gradeDisplayFromAny, gradeKeyFromArabicLabel, stageDisplayFromAny, stageKeyFromValue } from "@/lib/teacherSubjectUtils";

export type TeacherAssignmentLike = {
  id?: string;
  category: string;
  stage: string;
  grade: string;
  section?: string | null;
  education_type?: string | null;
  created_at?: string | null;
};

export type NormalizedTeacherAssignment<T extends TeacherAssignmentLike = TeacherAssignmentLike> = T & {
  normalizedStage: string;
  normalizedStageLabel: string;
  normalizedGradeLabel: string;
  stageMismatch: boolean;
  stageOrder: number;
  gradeOrder: number;
};

export type TeacherAssignmentGroup<T extends TeacherAssignmentLike = TeacherAssignmentLike> = {
  category: string;
  stage: string;
  stageLabel: string;
  grades: string[];
  items: Array<NormalizedTeacherAssignment<T>>;
  categoryOrder: number;
};

const STAGE_ORDER: Record<string, number> = {
  preparatory: 0,
  secondary: 1,
};

export function inferAssignmentStage(stage: string, grade: string) {
  const trimmedGrade = (grade || "").trim();

  if (trimmedGrade.includes("الإعدادي") || trimmedGrade.includes("الاعدادي")) {
    return "preparatory";
  }

  if (trimmedGrade.includes("الثانوي")) {
    return "secondary";
  }

  return stageKeyFromValue(stage) || stage;
}

export function getTeacherAssignmentGradeOrder(grade: string) {
  const gradeKey = gradeKeyFromArabicLabel(grade);

  if (gradeKey === "first") return 0;
  if (gradeKey === "second") return 1;
  if (gradeKey === "third") return 2;

  return 99;
}

export function normalizeTeacherAssignment<T extends TeacherAssignmentLike>(assignment: T): NormalizedTeacherAssignment<T> {
  const storedStage = stageKeyFromValue(assignment.stage) || assignment.stage;
  const normalizedStage = inferAssignmentStage(assignment.stage, assignment.grade);

  return {
    ...assignment,
    normalizedStage,
    normalizedStageLabel: stageDisplayFromAny(normalizedStage),
    normalizedGradeLabel: `الصف ${gradeDisplayFromAny(assignment.grade)}`.trim(),
    stageMismatch: Boolean(storedStage && normalizedStage && storedStage !== normalizedStage),
    stageOrder: STAGE_ORDER[normalizedStage] ?? 99,
    gradeOrder: getTeacherAssignmentGradeOrder(assignment.grade),
  };
}

export function groupTeacherAssignments<T extends TeacherAssignmentLike>(assignments: T[]) {
  const categoryOrder = new Map<string, number>();
  const groups = new Map<string, TeacherAssignmentGroup<T>>();

  assignments.forEach((assignment) => {
    const normalized = normalizeTeacherAssignment(assignment);
    const categoryIndex = categoryOrder.get(normalized.category) ?? categoryOrder.size;
    categoryOrder.set(normalized.category, categoryIndex);

    const key = `${normalized.category}::${normalized.normalizedStage}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        category: normalized.category,
        stage: normalized.normalizedStage,
        stageLabel: normalized.normalizedStageLabel,
        grades: [normalized.grade],
        items: [normalized],
        categoryOrder: categoryIndex,
      });
      return;
    }

    existing.items.push(normalized);
    if (!existing.grades.includes(normalized.grade)) {
      existing.grades.push(normalized.grade);
    }
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      grades: [...group.grades].sort((a, b) => {
        const orderDiff = getTeacherAssignmentGradeOrder(a) - getTeacherAssignmentGradeOrder(b);
        return orderDiff !== 0 ? orderDiff : a.localeCompare(b, "ar");
      }),
      items: [...group.items].sort((a, b) => {
        const orderDiff = a.gradeOrder - b.gradeOrder;
        return orderDiff !== 0 ? orderDiff : a.grade.localeCompare(b.grade, "ar");
      }),
    }))
    .sort((a, b) => {
      const categoryDiff = a.categoryOrder - b.categoryOrder;
      if (categoryDiff !== 0) return categoryDiff;
      return (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
    });
}

export function getTeacherAssignmentDuplicateGroups<T extends TeacherAssignmentLike>(assignments: T[]) {
  const counts = new Map<string, { category: string; stage: string; stageLabel: string; grade: string; count: number }>();

  assignments.forEach((assignment) => {
    const normalized = normalizeTeacherAssignment(assignment);
    const key = `${normalized.category}::${normalized.normalizedStage}::${normalized.grade}`;
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      return;
    }

    counts.set(key, {
      category: normalized.category,
      stage: normalized.normalizedStage,
      stageLabel: normalized.normalizedStageLabel,
      grade: normalized.grade,
      count: 1,
    });
  });

  return Array.from(counts.values())
    .filter((item) => item.count > 1)
    .sort((a, b) => {
      const stageDiff = (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
      if (stageDiff !== 0) return stageDiff;
      const categoryDiff = a.category.localeCompare(b.category, "ar");
      if (categoryDiff !== 0) return categoryDiff;
      return getTeacherAssignmentGradeOrder(a.grade) - getTeacherAssignmentGradeOrder(b.grade);
    });
}