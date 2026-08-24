// Shared AI cost-protection helper.
//
// Every AI-facing edge function calls `enforceAiQuota` right after it has
// verified the caller. The actual counters and limits live in the database
// (`public.ai_rate_limits` + `public.ai_usage_counters`) and are enforced
// atomically by `public.consume_ai_quota`, so parallel requests cannot slip
// past the limit. Admins are never throttled.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

export type AiQuotaResult = {
  allowed: boolean;
  reason?: string;
  used?: number;
  limit?: number;
  message?: string;
};

function quotaMessage(reason?: string, limit?: number): string {
  if (reason === "burst_limit") {
    return "أنت ترسل طلبات بسرعة كبيرة. انتظر دقيقة واحدة ثم أعد المحاولة.";
  }
  if (reason === "daily_limit") {
    return `لقد وصلت إلى الحد اليومي لاستخدام المساعد الذكي${limit ? ` (${limit} طلب/يوم)` : ""}. جرّب مرة أخرى غدًا.`;
  }
  return "تم تجاوز حد استخدام المساعد الذكي مؤقتًا. حاول لاحقًا.";
}

/**
 * Consumes one unit (or `cost` units) of the caller's quota for `feature`.
 * Fails OPEN on infrastructure errors so a transient DB hiccup never blocks
 * students, but fails CLOSED on an explicit limit breach.
 */
export async function enforceAiQuota(
  userId: string | null | undefined,
  feature: string,
  cost = 1,
): Promise<AiQuotaResult> {
  if (!userId) return { allowed: false, reason: "no_user", message: "غير مصرح" };

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return { allowed: true, reason: "no_service_key" };

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("consume_ai_quota", {
      _user_id: userId,
      _feature: feature,
      _cost: cost,
    });
    if (error) {
      console.error("[aiQuota] consume_ai_quota failed", { feature, error: error.message });
      return { allowed: true, reason: "quota_check_failed" };
    }
    const result = (data || {}) as Record<string, unknown>;
    const allowed = result.allowed === true;
    return {
      allowed,
      reason: typeof result.reason === "string" ? result.reason : undefined,
      used: typeof result.used === "number" ? result.used : undefined,
      limit: typeof result.limit === "number" ? result.limit : undefined,
      message: allowed
        ? undefined
        : quotaMessage(
          typeof result.reason === "string" ? result.reason : undefined,
          typeof result.limit === "number" ? result.limit : undefined,
        ),
    };
  } catch (err) {
    console.error("[aiQuota] unexpected error", err);
    return { allowed: true, reason: "quota_check_exception" };
  }
}

/** Standard 429 body for a blocked request. */
export function aiQuotaResponse(quota: AiQuotaResult, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      errorCode: quota.reason || "rate_limited",
      publicMessage: quota.message,
      reply: quota.message,
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
