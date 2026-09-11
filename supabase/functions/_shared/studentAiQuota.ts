// Student-only AI quota (explanation assistant + exams assistant share one
// daily counter). Enforcement happens BEFORE any AI provider call, so a student
// over the limit never costs us a request.
//
// - Teachers / admins / support: never metered.
// - Students with a currently valid paid subscription: unlimited for 30 days
//   from the activation timestamp stored in the database.
// - Other students: 10 uses/day, reset at midnight Africa/Cairo.
// - The support assistant NEVER calls this helper.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

export type StudentAiQuota = {
  allowed: boolean;
  plan?: "free" | "premium" | "exempt";
  reason?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string | null;
  premiumUntil?: string | null;
  message?: string;
};

function formatCairo(iso?: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { date, time };
}

export function studentQuotaMessage(quota: StudentAiQuota): string {
  const limit = quota.limit ?? 10;
  const when = formatCairo(quota.resetAt);
  const base =
    `لقد وصلت إلى الحد اليومي المجاني لاستخدام المساعد الذكي (${limit} استخدامات).\n\n` +
    "يمكنك العودة لاستخدام المساعد مجانًا عند تجديد الحد اليومي، أو الاشتراك في مجموعة مع أحد المعلمين " +
    "للحصول على استخدام غير محدود للمساعد الذكي لمدة 30 يومًا.";
  if (!when) return base;
  return `${base}\n\nموعد تجديد الاستخدام:\n${when.date}\n${when.time}`;
}

/**
 * Consumes one unit of the student's shared AI quota.
 * Fails OPEN only when the backend service key is unavailable (configuration
 * issue), and CLOSED on an explicit limit breach.
 */
export async function enforceStudentAiQuota(
  userId: string | null | undefined,
  cost = 1,
): Promise<StudentAiQuota> {
  if (!userId) return { allowed: false, reason: "no_user", message: "غير مصرح" };

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return { allowed: true, reason: "no_service_key" };

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("consume_student_ai_quota", {
      _user_id: userId,
      _cost: cost,
    });
    if (error) {
      console.error("[studentAiQuota] consume failed", error.message);
      return { allowed: true, reason: "quota_check_failed" };
    }
    const r = (data || {}) as Record<string, unknown>;
    const quota: StudentAiQuota = {
      allowed: r.allowed === true,
      plan: (r.plan as StudentAiQuota["plan"]) || undefined,
      reason: typeof r.reason === "string" ? r.reason : undefined,
      used: typeof r.used === "number" ? r.used : undefined,
      limit: typeof r.limit === "number" ? r.limit : undefined,
      remaining: typeof r.remaining === "number" ? r.remaining : undefined,
      resetAt: typeof r.reset_at === "string" ? r.reset_at : null,
      premiumUntil: typeof r.premium_until === "string" ? r.premium_until : null,
    };
    if (!quota.allowed) quota.message = studentQuotaMessage(quota);
    return quota;
  } catch (err) {
    console.error("[studentAiQuota] unexpected error", err);
    return { allowed: true, reason: "quota_check_exception" };
  }
}

/** Standard 429 body for a student who exhausted the free daily quota. */
export function studentAiQuotaResponse(
  quota: StudentAiQuota,
  corsHeaders: Record<string, string>,
) {
  const message = quota.message || studentQuotaMessage(quota);
  return new Response(
    JSON.stringify({
      error: "student_ai_daily_limit",
      errorCode: quota.reason || "student_ai_daily_limit",
      publicMessage: message,
      reply: message,
      quota: {
        plan: quota.plan || "free",
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining ?? 0,
        reset_at: quota.resetAt,
      },
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
