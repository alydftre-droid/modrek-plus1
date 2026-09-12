import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

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

  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;
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

    // If the email already exists we reuse the account instead of blocking the
    // whole platform wizard. A leftover account from a previously failed run is
    // still flagged `student` by the signup trigger, so we promote it to teacher
    // as long as it has no real student footprint and is not an admin.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, role, full_name")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) {
      const teacherId = existingProfile.id;

      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", teacherId);
      const roleList = (roles || []).map((r) => String(r.role));

      if (roleList.includes("admin")) {
        return fail("هذا البريد يخص حساب مطور، اختر بريدًا آخر", 409, "check_duplicate_profile");
      }

      const isTeacherAlready = existingProfile.role === "teacher" || roleList.includes("teacher");
      if (!isTeacherAlready) {
        const [subs, attempts, choices, wallet] = await Promise.all([
          admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("student_id", teacherId),
          admin.from("exam_attempts").select("id", { count: "exact", head: true }).eq("student_id", teacherId),
          admin.from("student_teacher_choices").select("id", { count: "exact", head: true }).eq("student_id", teacherId),
          admin.from("wallets").select("balance").eq("user_id", teacherId).maybeSingle(),
        ]);
        const footprint = (subs.count || 0) + (attempts.count || 0) + (choices.count || 0);
        const balance = Number(wallet.data?.balance || 0);
        if (footprint > 0 || balance > 0) {
          return fail(
            "هذا البريد مستخدم بالفعل لحساب طالب فعلي (لديه بيانات دراسية)، اختر بريدًا آخر",
            409,
            "check_duplicate_profile",
          );
        }
      }

      // Promote / repair the account into a clean teacher account.
      const { error: promoteErr } = await admin.from("profiles").update({
        role: "teacher",
        full_name: existingProfile.full_name || fullName,
        phone: phone ?? undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", teacherId);
      if (promoteErr) {
        return fail("تعذر تحويل الحساب الموجود إلى حساب معلم", 400, "promote_existing_profile", promoteErr.message);
      }

      await admin.from("user_roles").upsert(
        { user_id: teacherId, role: "teacher" },
        { onConflict: "user_id,role" },
      );
      await admin.from("user_roles").delete().eq("user_id", teacherId).eq("role", "student");
      await admin.from("teacher_profiles").upsert(
        { teacher_id: teacherId, is_approved: true, updated_at: new Date().toISOString() },
        { onConflict: "teacher_id" },
      );
      if (password.length >= 8) {
        await admin.auth.admin.updateUserById(teacherId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: existingProfile.full_name || fullName, role: "teacher" },
        });
      }

      return json({
        teacher_id: teacherId,
        email,
        full_name: existingProfile.full_name || fullName,
        reused: true,
        promoted: !isTeacherAlready,
        trace_id: traceId,
      }, 200, traceId);
    }



    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "teacher" },
    });
    if (createErr || !created.user) {
      // Orphan auth user (no profiles row) from a previously failed attempt:
      // adopt it instead of dead-ending the wizard.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const orphan = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
      if (orphan) {
        await admin.auth.admin.updateUserById(orphan.id, {
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: "teacher" },
        });
        await admin.from("profiles").upsert({
          id: orphan.id, full_name: fullName, email, phone, role: "teacher",
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        await admin.from("user_roles").upsert({ user_id: orphan.id, role: "teacher" }, { onConflict: "user_id,role" });
        await admin.from("user_roles").delete().eq("user_id", orphan.id).eq("role", "student");
        await admin.from("teacher_profiles").upsert(
          { teacher_id: orphan.id, is_approved: true, updated_at: new Date().toISOString() },
          { onConflict: "teacher_id" },
        );
        return json({ teacher_id: orphan.id, email, full_name: fullName, reused: true, trace_id: traceId }, 200, traceId);
      }
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
