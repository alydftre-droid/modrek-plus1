// Self-service account deletion (Google Play compliance).
// The authenticated user permanently deletes their OWN account:
// - all personal rows across student-facing tables
// - the profile row
// - all sessions (global sign out)
// - the auth.users row
//
// Guard: teacher/admin accounts are NOT deletable through this endpoint
// (they hold financial/content records handled by the admin flow).

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "غير مصرح" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "جلسة منتهية، سجّل الدخول مرة أخرى" }, 401);

    const userId = userData.user.id;

    let body: { confirmation?: string } = {};
    try { body = await req.json(); } catch { body = {}; }
    if ((body.confirmation ?? "").trim() !== "حذف") {
      return json({ error: "كلمة التأكيد غير صحيحة" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if ((roles ?? []).some((r: any) => r.role === "admin" || r.role === "teacher")) {
      return json({ error: "حسابات المعلمين والإدارة تُحذف بالتواصل مع الدعم الفني" }, 403);
    }

    const swallow = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.warn(`[delete_my_account:${label}]`, err); }
    };

    const byStudentId = [
      "student_group_purchases", "student_teacher_choices", "student_activity_logs",
      "subscriptions", "subscription_requests", "subscription_messages",
      "deposit_requests", "exam_attempts", "exam_answers", "exam_drafts",
      "exam_attempt_debug_logs", "wallet_adjustments", "recharge_code_uses",
      "test_student_security_events",
    ];
    for (const t of byStudentId) {
      await swallow(`s/${t}`, () => admin.from(t).delete().eq("student_id", userId));
    }

    const byUserId = [
      "wallets", "video_progress", "usage_logs", "notifications", "notification_delivery_logs",
      "device_push_tokens", "ai_conversations", "ai_messages", "ai_daily_usage",
      "modrek_ai_conversations", "modrek_ai_messages", "modrek_search_logs",
      "library_book_conversations", "library_conversation_messages", "library_generated_quizzes",
      "library_student_book_progress", "library_student_memory", "library_student_weaknesses",
      "library_recommendations", "support_messages", "support_contact_logs",
      "ad_views", "voice_answers", "bundled_package_subscriptions", "user_roles",
    ];
    for (const t of byUserId) {
      await swallow(`u/${t}`, () => admin.from(t).delete().eq("user_id", userId));
    }

    await swallow("recharge_code_uses/used_by", () =>
      admin.from("recharge_code_uses").delete().eq("used_by", userId));

    await swallow("profiles", () => admin.from("profiles").delete().eq("id", userId));

    // Revoke every active session before removing the identity.
    await swallow("signOutGlobal", () => admin.auth.admin.signOut(
      authHeader.replace(/^Bearer\s+/i, ""), "global") as unknown as Promise<unknown>);

    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) {
      console.error("[delete-my-account] auth.deleteUser failed", authErr);
      return json({ error: "تعذّر حذف الحساب: " + authErr.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[delete-my-account] error", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
