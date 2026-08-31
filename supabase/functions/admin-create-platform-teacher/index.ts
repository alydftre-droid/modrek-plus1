import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
  "Access-Control-Expose-Headers": "x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, traceId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(traceId ? { "x-trace-id": traceId } : {}) },
  });

interface Body {
  full_name?: string;
  email?: string;
  password?: string;
  phone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const traceId = req.headers.get("x-trace-id") || crypto.randomUUID();
  const fail = (error: string, status: number, stage: string, details?: string) => {
    console.error(JSON.stringify({ function: "admin-create-platform-teacher", trace_id: traceId, stage, status, error, details }));
    return json({
      error,
      status,
      stage,
      details: details || null,
      trace_id: traceId,
      source: "supabase/functions/admin-create-platform-teacher/index.ts",
    }, status, traceId);
  };

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return fail("غير مصرح: Authorization header مفقود", 401, "authorization_header");

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return fail("جلسة الدخول غير صالحة أو منتهية", 401, "validate_session", userErr?.message);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return fail("هذه العملية متاحة للمطور فقط", 403, "verify_admin_role");

    const body = (await req.json()) as Body;
    const fullName = (body.full_name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const phone = (body.phone || "").trim() || null;

    if (fullName.length < 3) return fail("اسم المعلم قصير جدًا", 400, "validate_input");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("البريد الإلكتروني غير صحيح", 400, "validate_input");
    if (password.length < 8) return fail("كلمة المرور يجب أن تكون 8 أحرف على الأقل", 400, "validate_input");

    // Reject duplicates early with a clear message.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) return fail("هذا البريد مستخدم بالفعل داخل المنصة", 409, "check_duplicate_profile");

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "teacher" },
    });
    if (createErr || !created.user) {
      return fail("تعذر إنشاء مستخدم المعلم في نظام المصادقة", 400, "create_auth_user", createErr?.message);
    }
    const teacherId = created.user.id;

    const cleanup = async (reason: string) => {
      console.error("[admin-create-platform-teacher] rollback:", reason);
      try { await admin.from("user_roles").delete().eq("user_id", teacherId); } catch (_) { /* noop */ }
      try { await admin.from("teacher_profiles").delete().eq("teacher_id", teacherId); } catch (_) { /* noop */ }
      try { await admin.from("profiles").delete().eq("id", teacherId); } catch (_) { /* noop */ }
      try { await admin.auth.admin.deleteUser(teacherId); } catch (_) { /* noop */ }
    };

    // profiles row may already exist from the handle_new_user trigger.
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: teacherId,
      full_name: fullName,
      email,
      phone,
      role: "teacher",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileErr) {
      await cleanup(profileErr.message);
      return fail("تعذر إنشاء ملف المعلم", 400, "upsert_profile", profileErr.message);
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: teacherId, role: "teacher" }, { onConflict: "user_id,role" });
    if (roleErr) {
      await cleanup(roleErr.message);
      return fail("تعذر منح صلاحية المعلم", 400, "upsert_teacher_role", roleErr.message);
    }

    // Remove any default student role added by the signup trigger.
    await admin.from("user_roles").delete().eq("user_id", teacherId).eq("role", "student");

    const { error: tpErr } = await admin.from("teacher_profiles").upsert({
      teacher_id: teacherId,
      is_approved: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "teacher_id" });
    if (tpErr) {
      await cleanup(tpErr.message);
      return fail("تعذر إنشاء بيانات المعلم التعليمية", 400, "upsert_teacher_profile", tpErr.message);
    }

    return json({ teacher_id: teacherId, email, full_name: fullName, trace_id: traceId }, 200, traceId);
  } catch (e) {
    return fail("خطأ غير متوقع داخل وظيفة إنشاء المعلم", 500, "unhandled_exception", (e as Error)?.message);
  }
});
