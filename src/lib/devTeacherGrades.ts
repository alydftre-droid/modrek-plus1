import { getFreshOriginalDeveloperAccessToken, getOriginalDeveloperAccessToken, getImpersonationMeta } from "@/lib/devImpersonation";

export type GradeDeleteDiagnostic = {
  message: string;
  stage: string;
  code: string;
  traceId: string;
  location: string;
  details?: string;
};

export class GradeDeleteError extends Error {
  diagnostic: GradeDeleteDiagnostic;
  constructor(diagnostic: GradeDeleteDiagnostic) {
    super(diagnostic.message);
    this.name = "GradeDeleteError";
    this.diagnostic = diagnostic;
  }
}

const makeTraceId = () => globalThis.crypto?.randomUUID?.() || `grade-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function fail(input: Partial<GradeDeleteDiagnostic> & Pick<GradeDeleteDiagnostic, "message">): never {
  throw new GradeDeleteError({
    stage: input.stage || "غير محدد",
    code: input.code || "UNKNOWN_ERROR",
    traceId: input.traceId || "غير متوفر",
    location: input.location || "واجهة حذف الصف",
    message: input.message,
    details: input.details,
  });
}

/** True only while a developer is impersonating a teacher account. */
export function isDeveloperTeacherMode() {
  const meta = getImpersonationMeta();
  return !!meta && meta.role === "teacher" && !!getOriginalDeveloperAccessToken();
}

/**
 * Permanently removes a teacher grade workspace and all of its related data.
 */
export async function removeTeacherGradeAssignments(params: { teacherId: string; assignmentIds: string[] }) {
  const traceId = makeTraceId();
  if (!params.teacherId) fail({ message: "معرّف المعلم مفقود", stage: "فحص المدخلات", code: "MISSING_TEACHER_ID", traceId });
  if (!params.assignmentIds.length) fail({ message: "لم يتم العثور على روابط الصف المطلوب حذفها", stage: "فحص المدخلات", code: "EMPTY_ASSIGNMENTS", traceId });

  let devToken: string;
  try {
    const token = await getFreshOriginalDeveloperAccessToken();
    if (!token) throw new Error("لم يتم إرجاع رمز دخول جديد");
    devToken = token;
  } catch (error) {
    fail({
      message: error instanceof Error ? error.message : "تعذر تجديد جلسة المطور",
      stage: "تجديد جلسة المطور",
      code: "DEVELOPER_SESSION_REFRESH_FAILED",
      traceId,
      location: "المتصفح ← نظام تسجيل الدخول",
    });
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const endpoint = `${baseUrl}/functions/v1/admin-remove-teacher-grade`;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${devToken}`,
        apikey,
        "x-trace-id": traceId,
      },
      body: JSON.stringify({ teacher_id: params.teacherId, assignment_ids: params.assignmentIds }),
      signal: controller.signal,
    });
  } catch (error) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    fail({
      message: offline ? "الجهاز غير متصل بالإنترنت" : timedOut ? "انتهت مهلة الاتصال بعد 90 ثانية" : "فشل المتصفح في الاتصال بخدمة حذف الصف",
      stage: "إرسال طلب الحذف",
      code: offline ? "OFFLINE" : timedOut ? "REQUEST_TIMEOUT" : "NETWORK_FETCH_FAILED",
      traceId,
      location: endpoint,
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    window.clearTimeout(timeout);
  }

  const rawBody = await response.text();
  let data: Record<string, unknown> | null = null;
  try { data = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : null; } catch { data = null; }
  if (!response.ok || !data?.success) {
    fail({
      message: typeof data?.error === "string" ? data.error : `فشلت خدمة الحذف بحالة HTTP ${response.status}`,
      stage: typeof data?.stage === "string" ? data.stage : "استجابة خدمة الحذف",
      code: typeof data?.code === "string" ? data.code : `HTTP_${response.status}`,
      traceId: typeof data?.trace_id === "string" ? data.trace_id : traceId,
      location: typeof data?.location === "string" ? data.location : endpoint,
      details: typeof data?.details === "string" ? data.details : rawBody.slice(0, 800) || response.statusText,
    });
  }
  return data as unknown as { success: true; deleted_assignments: number; deleted_groups: number };
}

