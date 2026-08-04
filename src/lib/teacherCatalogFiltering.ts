import { gradeKeyFromArabicLabel, subjectFilterFromTeacherSelection } from "@/lib/teacherSubjectUtils";
import { inferAssignmentStage, type TeacherAssignmentLike } from "@/lib/teacherAssignments";

export type SubjectCatalogRow = {
  category: string;
  stage: string;
  grade: string;
  name: string;
};

export type SubjectCatalogIndex = {
  /** `${category}|${stage}|${gradeKey}` */
  byCategory: Set<string>;
  /** `${category}|${stage}|${gradeKey}|${name}` */
  byName: Set<string>;
  isEmpty: boolean;
};

function gradeKey(value: string) {
  return gradeKeyFromArabicLabel(value) || (value || "").trim();
}

export function buildSubjectCatalogIndex(rows: SubjectCatalogRow[] | null | undefined): SubjectCatalogIndex {
  const byCategory = new Set<string>();
  const byName = new Set<string>();

  (rows || []).forEach((row) => {
    const category = (row.category || "").trim();
    const stage = (row.stage || "").trim();
    const g = gradeKey(row.grade || "");
    if (!category || !stage || !g) return;
    byCategory.add(`${category}|${stage}|${g}`);
    const name = (row.name || "").trim();
    if (name) byName.add(`${category}|${stage}|${g}|${name}`);
  });

  return { byCategory, byName, isEmpty: byCategory.size === 0 };
}

/**
 * True when the platform curriculum actually contains this teacher selection
 * (subject/category) in this stage + grade. Unknown selections and an empty
 * catalog are treated as "allowed" so nothing is hidden by accident.
 */
export function assignmentExistsInCatalog(
  assignment: TeacherAssignmentLike,
  index: SubjectCatalogIndex,
): boolean {
  if (index.isEmpty) return true;

  const filter = subjectFilterFromTeacherSelection(assignment.category);
  if (!filter) return true;

  const stage = inferAssignmentStage(assignment.stage, assignment.grade);
  const g = gradeKey(assignment.grade);
  if (!stage || !g) return true;

  if (filter.subjectName) {
    return index.byName.has(`${filter.categoryKey}|${stage}|${g}|${filter.subjectName}`);
  }

  return index.byCategory.has(`${filter.categoryKey}|${stage}|${g}`);
}

export function filterAssignmentsByCatalog<T extends TeacherAssignmentLike>(
  assignments: T[],
  index: SubjectCatalogIndex,
): T[] {
  return assignments.filter((assignment) => assignmentExistsInCatalog(assignment, index));
}
