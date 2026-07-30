import { getOriginalDeveloperAccessToken, getImpersonationMeta } from "@/lib/devImpersonation";

/** True only while a developer is impersonating a teacher account. */
export function isDeveloperTeacherMode() {
  const meta = getImpersonationMeta();
  return !!meta && meta.role === "teacher" && !!getOriginalDeveloperAccessToken();
}

/**
 * Removes the link between a teacher and a grade (teacher_assignments rows).
 * Content, exams and files stay untouched in the database.
 */
export async function removeTeacherGradeAssignments(params: { teacherId: string; assignmentIds: string[] }) {
  const devToken = getOriginalDeveloperAccessToken();
  if (!devToken) throw new Error("هذه العملية متاحة للمطور فقط");

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-remove-teacher-grade`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${devToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ teacher_id: params.teacherId, assignment_ids: params.assignmentIds }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || "فشل حذف الصف من حساب المعلم");
  }
  return data as { success: true; deleted: number };
}
