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
const MANAGED_DELETE_FALLBACK_URL = "https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/admin-remove-teacher-grade";
const MANAGED_DELETE_FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A";

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
  let responseEndpoint = endpoint;
  const requestBody = JSON.stringify({ teacher_id: params.teacherId, assignment_ids: params.assignmentIds });
  const sendRequest = (url: string, key: string) => fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${devToken}`,
      apikey: key,
      "x-trace-id": traceId,
    },
    body: requestBody,
    signal: controller.signal,
  });
  try {
    try {
      response = await sendRequest(endpoint, apikey);
    } catch (primaryError) {
      if (endpoint === MANAGED_DELETE_FALLBACK_URL) throw primaryError;
      responseEndpoint = MANAGED_DELETE_FALLBACK_URL;
      response = await sendRequest(MANAGED_DELETE_FALLBACK_URL, MANAGED_DELETE_FALLBACK_KEY);
    }
  } catch (error) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    let serviceMissing = false;
    if (!offline && !timedOut) {
      try {
        const probe = await fetch(endpoint, {
          method: "OPTIONS",
          headers: {
            Origin: window.location.origin,
            "Access-Control-Request-Method": "POST",
          },
        });
        serviceMissing = probe.status === 404;
      } catch {
        // Preserve the original network diagnostic when even the probe fails.
      }
    }
    fail({
      message: offline
        ? "الجهاز غير متصل بالإنترنت"
        : timedOut
          ? "انتهت مهلة الاتصال بعد 90 ثانية"
          : serviceMissing
            ? "خدمة حذف الصف غير منشورة في بيئة الإنتاج"
            : "فشل المتصفح في الاتصال بخدمة حذف الصف",
      stage: "إرسال طلب الحذف",
      code: offline ? "OFFLINE" : timedOut ? "REQUEST_TIMEOUT" : serviceMissing ? "PRODUCTION_FUNCTION_NOT_DEPLOYED" : "NETWORK_FETCH_FAILED",
      traceId,
      location: responseEndpoint,
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
      location: typeof data?.location === "string" ? data.location : responseEndpoint,
      details: typeof data?.details === "string" ? data.details : rawBody.slice(0, 800) || response.statusText,
    });
  }
  return data as unknown as { success: true; deleted_assignments: number; deleted_groups: number };
}

