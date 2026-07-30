import { getFreshOriginalDeveloperAccessToken, getOriginalDeveloperAccessToken, getImpersonationMeta } from "@/lib/devImpersonation";

/** True only while a developer is impersonating a teacher account. */
export function isDeveloperTeacherMode() {
  const meta = getImpersonationMeta();
  return !!meta && meta.role === "teacher" && !!getOriginalDeveloperAccessToken();
}

/**
 * Permanently removes a teacher grade workspace and all of its related data.
 */
export async function removeTeacherGradeAssignments(params: { teacherId: string; assignmentIds: string[] }) {
  const devToken = await getFreshOriginalDeveloperAccessToken();
  if (!devToken) throw new Error("انتهت جلسة المطور. اخرج من حساب المعلم ثم ادخل إليه مرة أخرى");

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const response = await fetch(`${baseUrl}/functions/v1/admin-remove-teacher-grade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${devToken}`,
        apikey,
      },
      body: JSON.stringify({ teacher_id: params.teacherId, assignment_ids: params.assignmentIds }),
    });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || "فشل حذف الصف ومحتوياته من حساب المعلم");
  }
  return data as { success: true; deleted_assignments: number; deleted_groups: number };
}

