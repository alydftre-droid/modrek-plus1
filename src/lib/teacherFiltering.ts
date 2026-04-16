import { normalizeEducationType, requiresEducationTypeTargeting } from "@/lib/educationSection";

type TeacherAssignmentLike = {
  teacher_id: string;
  education_type?: string | null;
  section?: string | null;
  grade?: string | null;
};

type TeacherRequestLike = {
  user_id: string;
  education_type?: string | null;
  assigned_category?: string | null;
  status?: string | null;
};

export function buildTeacherEducationTypeMap(requests: TeacherRequestLike[] | null | undefined) {
  const map = new Map<string, "عام" | "أزهر" | null>();

  (requests || []).forEach((request) => {
    const normalized = normalizeEducationType(request.education_type);
    if (!request.user_id || !normalized) return;
    map.set(request.user_id, normalized);
  });

  return map;
}

export function filterAssignmentsForStudent<T extends TeacherAssignmentLike>(params: {
  assignments: T[] | null | undefined;
  category: string;
  normalizedSection?: string;
  studentEducationType?: string | null;
  teacherEducationTypeMap?: Map<string, "عام" | "أزهر" | null>;
}) {
  const {
    assignments,
    category,
    normalizedSection,
    studentEducationType,
    teacherEducationTypeMap,
  } = params;

  const normalizedStudentEducationType = normalizeEducationType(studentEducationType);
  const requiresTargeting = requiresEducationTypeTargeting(category);

  return (assignments || []).filter((assignment) => {
    if (normalizedSection && assignment.section && assignment.section !== normalizedSection) {
      return false;
    }

    if (!requiresTargeting) {
      return true;
    }

    if (!normalizedStudentEducationType) {
      return false;
    }

    const assignmentEducationType = normalizeEducationType(assignment.education_type);
    const teacherEducationType = assignmentEducationType || teacherEducationTypeMap?.get(assignment.teacher_id) || null;

    if (!teacherEducationType) {
      return false;
    }

    return teacherEducationType === normalizedStudentEducationType;
  });
}

export const TEACHER_ASSIGNMENT_CATEGORY_VARIANTS: Record<string, string[]> = {
  arabic: ["arabic", "المواد العربية"],
  religious: ["religious", "sharia", "المواد الشرعية"],
};

export const TEACHER_ASSIGNMENT_GRADE_VARIANTS: Record<string, string[]> = {
  first: ["first", "الصف الأول", "الصف الأول الإعدادي", "الصف الأول الثانوي"],
  second: ["second", "الصف الثاني", "الصف الثاني الإعدادي", "الصف الثاني الثانوي"],
  third: ["third", "الصف الثالث", "الصف الثالث الإعدادي", "الصف الثالث الثانوي"],
};