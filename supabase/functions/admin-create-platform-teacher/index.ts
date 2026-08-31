import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  full_name?: string;
  email?: string;
  password?: string;
  phone?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    if (userErr || !userData.user) return json({ error: "جلسة منتهية" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "هذه العملية متاحة للمطور فقط" }, 403);

    const body = (await req.json()) as Body;
    const fullName = (body.full_name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const phone = (body.phone || "").trim() || null;

    if (fullName.length < 3) return json({ error: "اسم المعلم قصير جدًا" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);
    if (password.length < 8) return json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, 400);

    // Reject duplicates early with a clear message.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) return json({ error: "هذا البريد مستخدم بالفعل داخل المنصة" }, 409);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "teacher" },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message || "تعذر إنشاء حساب المعلم" }, 400);
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
      return json({ error: "تعذر إنشاء ملف المعلم: " + profileErr.message }, 400);
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert({ user_id: teacherId, role: "teacher" }, { onConflict: "user_id,role" });
    if (roleErr) {
      await cleanup(roleErr.message);
      return json({ error: "تعذر منح صلاحية المعلم: " + roleErr.message }, 400);
    }

    // Remove any default student role added by the signup trigger.
    await admin.from("user_roles").delete().eq("user_id", teacherId).eq("role", "student");

    const { error: tpErr } = await admin.from("teacher_profiles").upsert({
      teacher_id: teacherId,
      is_approved: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "teacher_id" });
    if (tpErr) console.warn("[admin-create-platform-teacher] teacher_profiles", tpErr.message);

    return json({ teacher_id: teacherId, email, full_name: fullName });
  } catch (e) {
    console.error("[admin-create-platform-teacher]", e);
    return json({ error: (e as Error)?.message || "خطأ غير متوقع" }, 500);
  }
});
