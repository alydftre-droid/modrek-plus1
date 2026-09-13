// Admin-only Demo Accounts management.
//
// Every action verifies the caller holds the `admin` role in user_roles via a
// signature-validated session (no email allowlists, no frontend trust).
// Passwords are never persisted in the database: they are generated here,
// written straight into Supabase Auth (bcrypt) and returned exactly once to
// the calling admin so they can be copied.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

type DemoRole = "admin" | "teacher" | "student";

const ROLE_LABELS: Record<DemoRole, string> = {
  admin: "حساب ديمو — مطور",
  teacher: "حساب ديمو — معلم",
  student: "حساب ديمو — طالب",
};

const DEFAULT_ACCOUNTS: { role: DemoRole; email: string; label: string }[] = [
  { role: "admin", email: "demo.admin@modrekplus.demo", label: ROLE_LABELS.admin },
  { role: "teacher", email: "demo.teacher@modrekplus.demo", label: ROLE_LABELS.teacher },
  { role: "student", email: "demo.student@modrekplus.demo", label: ROLE_LABELS.student },
];

const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generatePassword(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length];
  return `Dm-${out}`;
}

const isEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "غير مصرح" }, 401);

    // Signature-validated caller identity.
    const userClient = createClient(SUPABASE_URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "جلسة منتهية" }, 401);
    const callerId = userData.user.id;
    const callerEmail = userData.user.email || null;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authorization: strictly the admin role.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "هذه العملية متاحة للمطور فقط" }, 403);

    // A demo admin may never manage demo accounts (no privilege escalation loop).
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_demo")
      .eq("id", callerId)
      .maybeSingle();
    if ((callerProfile as any)?.is_demo === true) {
      return json({ error: "حساب الديمو لا يمكنه إدارة حسابات الديمو" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");

    const audit = async (
      act: string,
      demo: { user_id?: string | null; email?: string | null; role?: string | null },
      metadata: Record<string, unknown> = {},
    ) => {
      try {
        await admin.from("demo_account_audit_logs").insert({
          actor_id: callerId,
          actor_email: callerEmail,
          action: act,
          demo_user_id: demo.user_id ?? null,
          demo_email: demo.email ?? null,
          demo_role: demo.role ?? null,
          metadata,
        });
      } catch (e) {
        console.warn("[demo-audit] failed", (e as Error)?.message);
      }
    };

    // Every mutating action targets a row in demo_accounts only.
    const loadDemo = async (demoId: string) => {
      const { data } = await admin
        .from("demo_accounts")
        .select("*")
        .eq("id", demoId)
        .maybeSingle();
      return data as any | null;
    };

    // Creating a preview account is all-or-nothing. If any step after the auth
    // user fails, the auth user is removed again — otherwise a half-created
    // account would stay behind as a NORMAL account with full write access,
    // which is exactly how demo accounts once became able to edit real data.
    const createDemoAccount = async (input: { role: DemoRole; email: string; label?: string }) => {
      const email = input.email.trim().toLowerCase();
      const role = input.role;
      const label = (input.label || ROLE_LABELS[role]).trim();
      const password = generatePassword();

      if (!email.endsWith("@modrekplus.demo")) {
        throw new Error("بريد حساب المعاينة يجب أن ينتهي بـ @modrekplus.demo");
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: label, is_demo: true, demo_role: role },
        app_metadata: { provider: "email", providers: ["email"], is_demo: true },
      });
      if (createErr || !created?.user) {
        throw new Error(createErr?.message || "تعذر إنشاء حساب الديمو");
      }
      const userId = created.user.id;

      try {
        // Profile: flagged as demo AND as a test account so every existing
        // teacher-facing / statistics filter already excludes it.
        const { error: profileErr } = await admin.from("profiles").upsert(
          {
            id: userId,
            full_name: label,
            email,
            role: role === "admin" ? "admin" : role,
            is_demo: true,
            is_test_account: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (profileErr) throw profileErr;

        const { error: roleErr } = await admin
          .from("user_roles")
          .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
        if (roleErr) throw roleErr;

        if (role === "teacher") {
          const { error: tErr } = await admin.from("teacher_profiles").upsert(
            { teacher_id: userId, is_approved: true, bio: "حساب معلم تجريبي (ديمو)" },
            { onConflict: "teacher_id" },
          );
          if (tErr) throw tErr;
        }
        if (role === "student") {
          const { error: wErr } = await admin
            .from("wallets")
            .upsert({ user_id: userId, balance: 5000 }, { onConflict: "user_id" });
          if (wErr) throw wErr;
        }

        const { data: row, error: rowErr } = await admin
          .from("demo_accounts")
          .insert({
            user_id: userId,
            email,
            label,
            role,
            is_active: true,
            created_by: callerId,
            last_password_reset_at: new Date().toISOString(),
          })
          .select("*")
          .maybeSingle();
        if (rowErr) throw rowErr;
        if (!row?.id) throw new Error("تعذر تسجيل حساب المعاينة في السجل");

        // Final proof that the read-only boundary now recognises this account.
        const { data: check } = await admin
          .from("profiles")
          .select("is_demo")
          .eq("id", userId)
          .maybeSingle();
        if (check?.is_demo !== true) {
          throw new Error("لم يتم تفعيل وضع المشاهدة فقط على الحساب");
        }

        await audit("create", { user_id: userId, email, role });
        return { account: row, password };
      } catch (e) {
        // Roll back: never leave a privileged leftover account behind.
        try {
          await admin.from("demo_accounts").delete().eq("user_id", userId);
          await admin.auth.admin.deleteUser(userId);
        } catch (cleanupError) {
          console.error("[demo-create] rollback failed", (cleanupError as Error)?.message);
        }
        throw e;
      }
    };


    // Auto-generated demo email: the developer only picks the role.
    const buildAutoEmail = (role: DemoRole) => {
      const bytes = new Uint8Array(4);
      crypto.getRandomValues(bytes);
      const suffix = Array.from(bytes).map((b) => b.toString(36)).join("").slice(0, 6);
      return `demo.${role}.${Date.now().toString(36)}${suffix}@modrekplus.demo`;
    };

    const freeAutoEmail = async (role: DemoRole) => {
      for (let i = 0; i < 8; i++) {
        const candidate = buildAutoEmail(role);
        const { data: taken } = await admin
          .from("demo_accounts")
          .select("id")
          .eq("email", candidate)
          .maybeSingle();
        if (!taken) return candidate;
      }
      throw new Error("تعذر توليد بريد ديمو فريد، أعد المحاولة");
    };

    switch (action) {
      case "create": {
        const role = String(body.role || "") as DemoRole;
        if (!["admin", "teacher", "student"].includes(role)) {
          return json({ error: "نوع الحساب غير صالح" }, 400);
        }

        // Email is optional: when omitted we generate it automatically.
        let email: string;
        if (body.email === undefined || body.email === null || String(body.email).trim() === "") {
          email = await freeAutoEmail(role);
        } else {
          if (!isEmail(body.email)) return json({ error: "البريد الإلكتروني غير صالح" }, 400);
          email = String(body.email).trim().toLowerCase();
          const { data: existing } = await admin
            .from("demo_accounts")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          if (existing) return json({ error: "يوجد حساب ديمو بنفس البريد" }, 400);
        }

        const result = await createDemoAccount({
          role,
          email,
          label: typeof body.label === "string" ? body.label : undefined,
        });
        return json({ ok: true, ...result });
      }


      case "seed_defaults": {
        const created: any[] = [];
        const skipped: string[] = [];
        for (const def of DEFAULT_ACCOUNTS) {
          const { data: existing } = await admin
            .from("demo_accounts")
            .select("id")
            .eq("email", def.email)
            .maybeSingle();
          if (existing) {
            skipped.push(def.email);
            continue;
          }
          const result = await createDemoAccount(def);
          created.push({ ...result.account, password: result.password });
        }
        await audit("seed_defaults", {}, { created: created.length, skipped });
        return json({ ok: true, created, skipped });
      }

      case "reset_password": {
        const row = await loadDemo(String(body.demo_id || ""));
        if (!row) return json({ error: "حساب الديمو غير موجود" }, 404);
        const password = generatePassword();
        const { error } = await admin.auth.admin.updateUserById(row.user_id, {
          password,
          email_confirm: true,
        });
        if (error) return json({ error: error.message }, 500);
        await admin
          .from("demo_accounts")
          .update({ last_password_reset_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", row.id);
        await audit("reset_password", { user_id: row.user_id, email: row.email, role: row.role });
        return json({ ok: true, password });
      }

      case "update_email": {
        const row = await loadDemo(String(body.demo_id || ""));
        if (!row) return json({ error: "حساب الديمو غير موجود" }, 404);
        if (!isEmail(body.email)) return json({ error: "البريد الإلكتروني غير صالح" }, 400);
        const email = String(body.email).trim().toLowerCase();
        const { error } = await admin.auth.admin.updateUserById(row.user_id, {
          email,
          email_confirm: true,
        });
        if (error) return json({ error: error.message }, 500);
        await admin.from("profiles").update({ email }).eq("id", row.user_id);
        await admin
          .from("demo_accounts")
          .update({ email, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        await audit("update_email", { user_id: row.user_id, email, role: row.role }, { previous: row.email });
        return json({ ok: true });
      }

      case "update_role": {
        const row = await loadDemo(String(body.demo_id || ""));
        if (!row) return json({ error: "حساب الديمو غير موجود" }, 404);
        const role = String(body.role || "") as DemoRole;
        if (!["admin", "teacher", "student"].includes(role)) {
          return json({ error: "نوع الحساب غير صالح" }, 400);
        }
        if (role === row.role) return json({ ok: true });

        await admin.from("user_roles").delete().eq("user_id", row.user_id);
        await admin.from("user_roles").insert({ user_id: row.user_id, role });
        await admin
          .from("profiles")
          .update({ role: role === "admin" ? "admin" : role, full_name: ROLE_LABELS[role] })
          .eq("id", row.user_id);
        if (role === "teacher") {
          await admin.from("teacher_profiles").upsert(
            { teacher_id: row.user_id, is_approved: true, bio: "حساب معلم تجريبي (ديمو)" },
            { onConflict: "teacher_id" },
          );
        }
        if (role === "student") {
          await admin.from("wallets").upsert({ user_id: row.user_id, balance: 5000 }, { onConflict: "user_id" });
        }
        await admin
          .from("demo_accounts")
          .update({ role, label: ROLE_LABELS[role], updated_at: new Date().toISOString() })
          .eq("id", row.id);
        await audit("update_role", { user_id: row.user_id, email: row.email, role }, { previous: row.role });
        return json({ ok: true });
      }

      case "set_active": {
        const row = await loadDemo(String(body.demo_id || ""));
        if (!row) return json({ error: "حساب الديمو غير موجود" }, 404);
        const active = body.is_active === true;
        // Disabled = auth ban (cannot sign in) + profile ban flag, account kept.
        const { error } = await admin.auth.admin.updateUserById(row.user_id, {
          ban_duration: active ? "none" : "876000h",
        });
        if (error) return json({ error: error.message }, 500);
        await admin.from("profiles").update({ is_banned: !active }).eq("id", row.user_id);
        await admin
          .from("demo_accounts")
          .update({ is_active: active, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        await audit(active ? "enable" : "disable", { user_id: row.user_id, email: row.email, role: row.role });
        return json({ ok: true });
      }

      case "delete": {
        const row = await loadDemo(String(body.demo_id || ""));
        if (!row) return json({ error: "حساب الديمو غير موجود" }, 404);

        // Hard safety: never delete a non-demo user through this endpoint.
        const { data: prof } = await admin
          .from("profiles")
          .select("is_demo")
          .eq("id", row.user_id)
          .maybeSingle();
        if ((prof as any)?.is_demo !== true) {
          return json({ error: "الحساب المستهدف ليس حساب ديمو — تم إلغاء العملية" }, 400);
        }

        const swallow = async (label: string, fn: () => Promise<unknown>) => {
          try { await fn(); } catch (e) { console.warn(`[demo-delete:${label}]`, (e as Error)?.message); }
        };

        const byStudentId = [
          "student_group_purchases", "student_teacher_choices", "student_activity_logs",
          "subscriptions", "subscription_requests", "exam_attempts", "exam_drafts",
          "deposit_requests", "video_progress", "notifications",
        ];
        for (const table of byStudentId) {
          await swallow(table, async () => {
            await admin.from(table).delete().eq("student_id", row.user_id);
          });
        }
        await swallow("notifications_user", async () => {
          await admin.from("notifications").delete().eq("user_id", row.user_id);
        });
        await swallow("wallets", async () => {
          await admin.from("wallets").delete().eq("user_id", row.user_id);
        });
        await swallow("teacher_profiles", async () => {
          await admin.from("teacher_profiles").delete().eq("teacher_id", row.user_id);
        });
        await swallow("teacher_assignments", async () => {
          await admin.from("teacher_assignments").delete().eq("teacher_id", row.user_id);
        });
        await swallow("user_roles", async () => {
          await admin.from("user_roles").delete().eq("user_id", row.user_id);
        });
        await swallow("profiles", async () => {
          await admin.from("profiles").delete().eq("id", row.user_id);
        });
        await swallow("demo_accounts", async () => {
          await admin.from("demo_accounts").delete().eq("id", row.id);
        });

        const { error: authErr } = await admin.auth.admin.deleteUser(row.user_id);
        if (authErr) console.warn("[demo-delete:auth]", authErr.message);

        await audit("delete", { user_id: row.user_id, email: row.email, role: row.role });
        return json({ ok: true });
      }

      case "impersonate": {
        const row = await loadDemo(String(body.demo_id || ""));
        if (!row) return json({ error: "حساب الديمو غير موجود" }, 404);
        if (!row.is_active) return json({ error: "الحساب معطّل — قم بتفعيله أولاً" }, 400);
        if (row.role === "admin") {
          return json({ error: "الدخول إلى حساب ديمو المطور غير متاح لأسباب أمنية" }, 400);
        }

        const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: row.email,
        });
        if (linkErr || !link?.properties?.hashed_token) {
          return json({ error: linkErr?.message || "تعذر إنشاء جلسة الديمو" }, 500);
        }

        const exchange = createClient(SUPABASE_URL, ANON, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: otp, error: otpErr } = await exchange.auth.verifyOtp({
          type: "magiclink",
          token_hash: link.properties.hashed_token,
        });
        if (otpErr || !otp?.session) {
          return json({ error: otpErr?.message || "فشل إنشاء جلسة الديمو" }, 500);
        }

        await admin
          .from("demo_accounts")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", row.id);
        await audit("impersonate", { user_id: row.user_id, email: row.email, role: row.role });

        return json({
          ok: true,
          session: otp.session,
          target: { id: row.user_id, email: row.email, full_name: row.label, role: row.role },
        });
      }

      default:
        return json({ error: "إجراء غير معروف" }, 400);
    }
  } catch (e) {
    console.error("[admin-demo-accounts]", (e as Error)?.message);
    return json({ error: (e as Error)?.message || "خطأ غير متوقع" }, 500);
  }
});
