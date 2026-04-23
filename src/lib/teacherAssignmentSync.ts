type TeacherAssignmentSyncInput = {
  teacherId: string;
  category: string;
  stages: string[] | null | undefined;
  grades: string[] | null | undefined;
  educationType?: string | null;
};

export const PREPARATORY_GRADES = [
  "الصف الأول الإعدادي",
  "الصف الثاني الإعدادي",
  "الصف الثالث الإعدادي",
] as const;

export const SECONDARY_GRADES = [
  "الصف الأول الثانوي",
  "الصف الثاني الثانوي",
  "الصف الثالث الثانوي",
] as const;

export function buildTeacherAssignmentsFromRequest({
  teacherId,
  category,
  stages,
  grades,
  educationType = null,
}: TeacherAssignmentSyncInput) {
  const normalizedCategory = (category || "").trim();
  const normalizedStages = Array.from(new Set((stages || []).map((stage) => (stage || "").trim()).filter(Boolean)));
  const normalizedGrades = Array.from(new Set((grades || []).map((grade) => (grade || "").trim()).filter(Boolean)));

  if (!teacherId || !normalizedCategory || normalizedStages.length === 0 || normalizedGrades.length === 0) {
    return [];
  }

  const gradeMap: Record<string, readonly string[]> = {
    preparatory: PREPARATORY_GRADES,
    secondary: SECONDARY_GRADES,
  };

  return normalizedStages.flatMap((stage) => {
    const allowedGrades = gradeMap[stage] || [];

    return normalizedGrades
      .filter((grade) => allowedGrades.includes(grade as (typeof allowedGrades)[number]))
      .map((grade) => ({
        teacher_id: teacherId,
        stage,
        grade,
        category: normalizedCategory,
        section: null,
        education_type: educationType,
      }));
  });
}