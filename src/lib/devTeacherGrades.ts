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

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  // 1) Preferred path: the admin edge function (service-role, extra validation).
  try {
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
    if (response.ok && data?.success) return data as { success: true; deleted: number };
    // 404 => function not deployed yet on this project: fall through to REST.
    if (response.status !== 404 && data?.error) throw new Error(data.error);
  } catch (e: any) {
    // Network / CORS failure ("Failed to fetch") => fall through to the REST fallback.
    if (e?.message && e.message !== "Failed to fetch" && !/fetch/i.test(e.message)) throw e;
  }

  // 2) Fallback: direct REST delete as the developer (admin RLS policy allows it).
  const idList = params.assignmentIds.map((id) => `"${id}"`).join(",");
  const restUrl =
    `${baseUrl}/rest/v1/teacher_assignments?teacher_id=eq.${params.teacherId}&id=in.(${idList})`;
  const res = await fetch(restUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${devToken}`,
      apikey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  const rows = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(rows?.message || rows?.error || "فشل حذف الصف من حساب المعلم");
  }
  const deleted = Array.isArray(rows) ? rows.length : 0;
  if (deleted === 0) throw new Error("لم يتم العثور على الصف داخل حساب هذا المعلم");
  return { success: true as const, deleted };
}

