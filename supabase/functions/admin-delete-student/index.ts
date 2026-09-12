// Admin: permanently delete a student and all associated data.
// - Verifies caller is admin.
// - Confirms target is NOT a teacher/admin (safety guard).
// - Deletes rows from all student-facing tables (best-effort).
// - Deletes auth.users row so the email is freed for re-registration.

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

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "جلسة منتهية" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "هذه العملية متاحة للمطور فقط" }, 403);

    const { student_id } = (await req.json()) as { student_id?: string };
    if (!student_id) return json({ error: "بيانات ناقصة" }, 400);

    // Safety: forbid deleting teachers/admins through this endpoint.
    const { data: guardRoles } = await admin
      .from("user_roles").select("role").eq("user_id", student_id);
    if ((guardRoles ?? []).some((r: any) => r.role === "admin" || r.role === "teacher")) {
      return json({ error: "هذا الحساب ليس حساب طالب — استخدم إدارة المعلمين/المطورين" }, 400);
    }

    const swallow = async (label: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.warn(`[delete_student:${label}]`, err); }
    };

    // Tables keyed by student_id
    const byStudentId = [
      "student_group_purchases", "student_teacher_choices", "student_activity_logs",
      "subscriptions", "subscription_requests", "subscription_messages",
      "deposit_requests", "exam_attempts", "exam_answers", "exam_drafts",
      "exam_attempt_debug_logs", "wallet_adjustments", "recharge_code_uses",
      "test_student_security_events",
    ];
    for (const t of byStudentId) {
      await swallow(`s/${t}`, () => admin.from(t).delete().eq("student_id", student_id));
    }

    // Tables keyed by user_id
    const byUserId = [
      "wallets", "video_progress", "usage_logs", "notifications", "notification_delivery_logs",
      "device_push_tokens", "ai_conversations", "ai_messages", "ai_daily_usage",
      "modrek_ai_conversations", "modrek_ai_messages", "modrek_search_logs",
      "library_book_conversations", "library_conversation_messages", "library_generated_quizzes",
      "library_student_book_progress", "library_student_memory", "library_student_weaknesses",
      "library_recommendations", "support_messages", "support_contact_logs",
      "ad_views", "voice_answers", "user_roles",
    ];
    for (const t of byUserId) {
      await swallow(`u/${t}`, () => admin.from(t).delete().eq("user_id", student_id));
    }

    // Recharge codes keyed by used_by
    await swallow("recharge_code_uses/used_by", () => admin.from("recharge_code_uses").delete().eq("used_by", student_id));

    // Profile
    await swallow("profiles", () => admin.from("profiles").delete().eq("id", student_id));

    // Finally, delete auth user so the email becomes available again.
    const { error: authErr } = await admin.auth.admin.deleteUser(student_id);
    if (authErr) {
      console.error("[delete_student] auth.deleteUser failed", authErr);
      return json({ error: "تعذّر حذف حساب المصادقة: " + authErr.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[admin-delete-student] error", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
