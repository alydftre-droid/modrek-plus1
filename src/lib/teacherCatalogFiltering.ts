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
  /** all subject names known per category (across stages/grades) */
  namesByCategory: Map<string, Set<string>>;
  /** distinct subject names count per `${category}|${stage}|${gradeKey}` cell */
  namesPerCell: Map<string, Set<string>>;
  isEmpty: boolean;
};

function gradeKey(value: string) {
  return gradeKeyFromArabicLabel(value) || (value || "").trim();
}

export function buildSubjectCatalogIndex(rows: SubjectCatalogRow[] | null | undefined): SubjectCatalogIndex {
  const byCategory = new Set<string>();
  const byName = new Set<string>();
  const namesByCategory = new Map<string, Set<string>>();
  const namesPerCell = new Map<string, Set<string>>();

  (rows || []).forEach((row) => {
    const category = (row.category || "").trim();
    const stage = (row.stage || "").trim();
    const g = gradeKey(row.grade || "");
    if (!category || !stage || !g) return;
    const cell = `${category}|${stage}|${g}`;
    byCategory.add(cell);
    const name = (row.name || "").trim();
    if (name) {
      byName.add(`${cell}|${name}`);
      if (!namesByCategory.has(category)) namesByCategory.set(category, new Set());
      namesByCategory.get(category)!.add(name);
      if (!namesPerCell.has(cell)) namesPerCell.set(cell, new Set());
      namesPerCell.get(cell)!.add(name);
    }
  });

  return { byCategory, byName, namesByCategory, namesPerCell, isEmpty: byCategory.size === 0 };
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

  const cell = `${filter.categoryKey}|${stage}|${g}`;

  if (filter.subjectName) {
    if (index.byName.has(`${cell}|${filter.subjectName}`)) return true;

    // The subject itself is not part of the catalog anywhere (e.g. الجيولوجيا).
    // Do not hide the teacher's work: allow it only inside cells where the
    // category is split into specialised subjects (secondary science, etc.),
    // never inside cells that hold a single generic subject (prep العلوم).
    const knownNames = index.namesByCategory.get(filter.categoryKey);
    const nameIsUnknown = !knownNames || !knownNames.has(filter.subjectName);
    if (nameIsUnknown) {
      return (index.namesPerCell.get(cell)?.size ?? 0) > 1;
    }
    return false;
  }

  return index.byCategory.has(cell);
}


export function filterAssignmentsByCatalog<T extends TeacherAssignmentLike>(
  assignments: T[],
  index: SubjectCatalogIndex,
): T[] {
  return assignments.filter((assignment) => assignmentExistsInCatalog(assignment, index));
}
