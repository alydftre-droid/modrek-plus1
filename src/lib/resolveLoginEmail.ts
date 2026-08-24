// Phone -> account email resolution for sign-in / password reset.
// Goes through the `resolve-login-email` edge function, which is rate limited
// per IP. The old public RPC was revoked because anonymous visitors could
// enumerate user emails with it.
import { supabase } from "@/integrations/supabase/client";

export type ResolveLoginEmailResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

export async function resolveLoginEmailByPhone(phone: string): Promise<ResolveLoginEmailResult> {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) {
    return { ok: false, message: "أدخل رقم هاتف صالحاً" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("resolve-login-email", {
      body: { phone: digits },
    });

    const payload = (data || {}) as { ok?: boolean; email?: string; reason?: string };

    if (payload.ok && payload.email) {
      return { ok: true, email: String(payload.email).trim().toLowerCase() };
    }

    let reason = payload.reason;
    if (!reason && error) {
      const response = (error as { context?: { json?: () => Promise<unknown> } })?.context;
      if (response?.json) {
        const body = (await response.json().catch(() => null)) as { reason?: string } | null;
        reason = body?.reason;
      }
    }

    if (reason === "rate_limited") {
      return { ok: false, message: "محاولات كثيرة من هذا الجهاز. انتظر قليلاً ثم أعد المحاولة." };
    }
    return { ok: false, message: "لا يوجد حساب مرتبط بهذا الرقم" };
  } catch {
    return { ok: false, message: "تعذر التحقق من الرقم حالياً. حاول مرة أخرى." };
  }
}
