---
name: Curriculum 2026/2027 subject swaps
description: Official subject replacements per (stage+grade+section) cell, e.g. الأحياء → التاريخ for second secondary scientific
type: feature
---

Official curriculum updates are modeled as **scoped swaps**, never renames.

- Source of truth in code: `CURRICULUM_SUBJECT_SWAPS` in `src/lib/educationSection.ts`
  with helpers `getScientificSubjectNames`, `isSubjectRetiredForScope`,
  `subjectCategoryOverrideForScope`.
- 2026/2027: for `secondary` + `second` + `scientific` (عام) the subject
  **الأحياء** is replaced by **التاريخ**.
  - الأحياء row (`b947c94a-…`) is soft-disabled (`is_active = false`), never deleted or renamed.
  - التاريخ row (`e181dc1d-…`) exists with `category = 'literary'`, `section = 'scientific'`
    so history teachers/groups/content keep working under the normal literary mapping.
  - Student routing for that card must use `category=literary&subject_name=التاريخ`
    (handled via `subjectCategoryOverrideForScope`).
- Never run `UPDATE subjects SET name = ... WHERE name = 'الأحياء'`.
- Student group visibility matches by subject NAME + stage + grade (section-agnostic),
  so a group created on either التاريخ row is visible to the right students.
