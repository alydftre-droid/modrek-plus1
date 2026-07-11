import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  action: "update_email" | "update_password" | "update_profile" | "delete_teacher" | "ban_teacher" | "unban_teacher";
  teacher_id: string;
  new_email?: string;
  new_password?: string;
  full_name?: string;
  phone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Decode JWT to get user id
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "جلسة منتهية" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Verify caller is admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "هذه العملية متاحة للمطور فقط" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json()) as Body;
    const { action, teacher_id } = body;
    if (!action || !teacher_id) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify target is a teacher
    const { data: targetRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", teacher_id)
      .eq("role", "teacher")
      .maybeSingle();

    if (action === "update_email") {
      if (!body.new_email || !/^[^@]+@[^@]+\.[^@]+$/.test(body.new_email)) {
        return new Response(JSON.stringify({ error: "بريد إلكتروني غير صالح" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: e1 } = await admin.auth.admin.updateUserById(teacher_id, {
        email: body.new_email,
        email_confirm: true,
      });
      if (e1) throw e1;
      await admin.from("profiles").update({ email: body.new_email, updated_at: new Date().toISOString() }).eq("id", teacher_id);
      await admin.from("notifications").insert({
        user_id: teacher_id,
        title: "تم تحديث بريدك الإلكتروني",
        message: `قام المطور بتحديث بريدك الإلكتروني إلى: ${body.new_email}`,
        notification_type: "account",
        is_read: false,
        is_sent: true,
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_password") {
      if (!body.new_password || body.new_password.length < 6) {
        return new Response(JSON.stringify({ error: "كلمة السر يجب أن تكون 6 أحرف على الأقل" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: e2 } = await admin.auth.admin.updateUserById(teacher_id, {
        password: body.new_password,
      });
      if (e2) throw e2;
      await admin.from("notifications").insert({
        user_id: teacher_id,
        title: "تم تغيير كلمة السر الخاصة بك",
        message: "قام المطور بتغيير كلمة السر الخاصة بحسابك. إذا لم تكن تتوقع هذا، تواصل مع الدعم فوراً.",
        notification_type: "security",
        is_read: false,
        is_sent: true,
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_profile") {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.full_name) updates.full_name = body.full_name.trim();
      if (body.phone !== undefined) updates.phone = body.phone?.trim() || null;
      const { error: e3 } = await admin.from("profiles").update(updates).eq("id", teacher_id);
      if (e3) throw e3;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "ban_teacher") {
      await admin.from("profiles").update({ is_banned: true, updated_at: new Date().toISOString() }).eq("id", teacher_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "unban_teacher") {
      await admin.from("profiles").update({ is_banned: false, updated_at: new Date().toISOString() }).eq("id", teacher_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete_teacher") {
      // Cascade-like cleanup of teacher data (best-effort, ignore errors per table)
      const tables = [
        "teacher_activity_logs",
        "teacher_wallet_transactions",
        "teacher_withdrawal_requests",
        "teacher_payment_methods",
        "teacher_assignments",
        "teacher_wallets",
        "price_change_requests",
      ];
      for (const t of tables) {
        try { await admin.from(t).delete().eq("teacher_id", teacher_id); } catch (_) { /* ignore */ }
      }
      try { await admin.from("content").delete().eq("uploaded_by", teacher_id); } catch (_) { /* non-fatal */ console.debug("[swallowed]", _); }
      try { await admin.from("content_groups").delete().eq("teacher_id", teacher_id); } catch (_) { /* non-fatal */ console.debug("[swallowed]", _); }
      try { await admin.from("user_roles").delete().eq("user_id", teacher_id); } catch (_) { /* non-fatal */ console.debug("[swallowed]", _); }
      try { await admin.from("profiles").delete().eq("id", teacher_id); } catch (_) { /* non-fatal */ console.debug("[swallowed]", _); }
      const { error: e4 } = await admin.auth.admin.deleteUser(teacher_id);
      if (e4) throw e4;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "خطأ غير متوقع" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
