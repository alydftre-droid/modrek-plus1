// Developer impersonation endpoint.
// Only users holding the admin role can call it (no email allowlists).
// Returns a signed magic link session (access + refresh tokens) for a
// developer test student account, so the developer can "log in as" that
// student without any password. All test-account interactions are recorded
// in the normal student tables — they are permanent, real data.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";
import { blockDemoWrites } from "../_shared/demoGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TEST_ACCOUNT_LABELS: Record<string, string> = {
  "AZH-PREP-1": "طالب تجريبي — أولى إعدادي أزهر",
  "AZH-PREP-2": "طالب تجريبي — ثانية إعدادي أزهر",
  "AZH-PREP-3": "طالب تجريبي — ثالثة إعدادي أزهر",
  "AZH-SEC1-SCI": "طالب تجريبي — أولى ثانوي أزهر علمي",
  "AZH-SEC1-LIT": "طالب تجريبي — أولى ثانوي أزهر أدبي",
  "AZH-SEC2-SCI": "طالب تجريبي — ثانية ثانوي أزهر علمي",
  "AZH-SEC2-LIT": "طالب تجريبي — ثانية ثانوي أزهر أدبي",
  "AZH-SEC3-SCI": "طالب تجريبي — ثالثة ثانوي أزهر علمي",
  "AZH-SEC3-LIT": "طالب تجريبي — ثالثة ثانوي أزهر أدبي",
  "GEN-PREP-1": "طالب تجريبي — أولى إعدادي عام",
  "GEN-PREP-2": "طالب تجريبي — ثانية إعدادي عام",
  "GEN-PREP-3": "طالب تجريبي — ثالثة إعدادي عام",
  "GEN-SEC1": "طالب تجريبي — أولى ثانوي عام",
  "GEN-SEC2-SCI": "طالب تجريبي — ثانية ثانوي عام علمي",
  "GEN-SEC2-LIT": "طالب تجريبي — ثانية ثانوي عام أدبي",
  "GEN-SEC3-SCIENCE": "طالب تجريبي — ثالثة ثانوي عام علمي علوم",
  "GEN-SEC3-MATH": "طالب تجريبي — ثالثة ثانوي عام علمي رياضة",
  "GEN-SEC3-LIT": "طالب تجريبي — ثالثة ثانوي عام أدبي",
};

const TEST_ACCOUNT_DETAILS: Record<string, { stage: string; grade: string; section: string | null; education_type: string }> = {
  "AZH-PREP-1": { stage: "preparatory", grade: "first", section: null, education_type: "أزهر" },
  "AZH-PREP-2": { stage: "preparatory", grade: "second", section: null, education_type: "أزهر" },
  "AZH-PREP-3": { stage: "preparatory", grade: "third", section: null, education_type: "أزهر" },
  "AZH-SEC1-SCI": { stage: "secondary", grade: "first", section: "علمي", education_type: "أزهر" },
  "AZH-SEC1-LIT": { stage: "secondary", grade: "first", section: "أدبي", education_type: "أزهر" },
  "AZH-SEC2-SCI": { stage: "secondary", grade: "second", section: "علمي", education_type: "أزهر" },
  "AZH-SEC2-LIT": { stage: "secondary", grade: "second", section: "أدبي", education_type: "أزهر" },
  "AZH-SEC3-SCI": { stage: "secondary", grade: "third", section: "علمي", education_type: "أزهر" },
  "AZH-SEC3-LIT": { stage: "secondary", grade: "third", section: "أدبي", education_type: "أزهر" },
  "GEN-PREP-1": { stage: "preparatory", grade: "first", section: null, education_type: "عام" },
  "GEN-PREP-2": { stage: "preparatory", grade: "second", section: null, education_type: "عام" },
  "GEN-PREP-3": { stage: "preparatory", grade: "third", section: null, education_type: "عام" },
  "GEN-SEC1": { stage: "secondary", grade: "first", section: null, education_type: "عام" },
  "GEN-SEC2-SCI": { stage: "secondary", grade: "second", section: "علمي", education_type: "عام" },
  "GEN-SEC2-LIT": { stage: "secondary", grade: "second", section: "أدبي", education_type: "عام" },
  "GEN-SEC3-SCIENCE": { stage: "secondary", grade: "third", section: "علمي علوم", education_type: "عام" },
  "GEN-SEC3-MATH": { stage: "secondary", grade: "third", section: "علمي رياضة", education_type: "عام" },
  "GEN-SEC3-LIT": { stage: "secondary", grade: "third", section: "أدبي", education_type: "عام" },
};

function testEmail(code: string) {
  return `${code.toLowerCase()}@test.modrek.local`;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeTemporaryPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  return `Tmp-${token}-9x!`;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => (user.email || "").toLowerCase() === normalized);
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

async function ensureTestStudentAccount(
  admin: ReturnType<typeof createClient>,
  code: string,
  tempPassword: string,
) {
  const email = testEmail(code);
  const fullName = TEST_ACCOUNT_LABELS[code];
  const details = TEST_ACCOUNT_DETAILS[code];
  if (!fullName || !details) throw new Error("unknown test account");

  let user = await findAuthUserByEmail(admin, email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        is_test_account: true,
        test_account_code: code,
      },
      app_metadata: { provider: "email", providers: ["email"] },
    });
    if (error || !data?.user) throw error || new Error("failed to create test account");
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      password: tempPassword,
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: fullName,
        is_test_account: true,
        test_account_code: code,
      },
      app_metadata: { provider: "email", providers: ["email"] },
    });
    if (error || !data?.user) throw error || new Error("failed to repair test account");
    user = data.user;
  }

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    email,
    role: "student",
    stage: details.stage,
    grade: details.grade,
    section: details.section,
    education_type: details.education_type,
    is_test_account: true,
    test_account_code: code,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profileErr) throw profileErr;

  await admin.from("user_roles").upsert({ user_id: user.id, role: "student" }, { onConflict: "user_id,role" });
  await admin.from("wallets").upsert({ user_id: user.id, balance: 10000 }, { onConflict: "user_id" });

  return { user, email, fullName };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Demo accounts are read-only (server-side boundary, cannot be bypassed).
  const demoBlock = await blockDemoWrites(req, corsHeaders);
  if (demoBlock) return demoBlock;
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const claims = await getJwtClaimsFromAuthHeader(req.headers.get("Authorization"));
  if (!claims?.sub) return json(401, { error: "missing token" });
  const callerId = claims.sub;
  const callerEmail = typeof (claims as any)?.email === "string" ? (claims as any).email : null;
  const jwt = req.headers.get("Authorization")!.replace(/^Bearer\s+/i, "").trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Force the platform Data API to validate the JWT signature before trusting
  // the decoded caller id. This avoids auth.getUser() while keeping the endpoint
  // protected against unsigned or forged tokens.
  const callerRest = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { error: tokenCheckErr } = await callerRest
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .limit(1);
  if (tokenCheckErr) return json(401, { error: "invalid session" });

  // Authorization: strictly the admin role from user_roles (no email allowlist).
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);
  const isAllowed = (roleRows || []).some((r: any) => r.role === "admin");
  if (!isAllowed) return json(403, { error: "forbidden" });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const targetId: string | undefined = body?.target_user_id;
  const targetCode: string | undefined = body?.test_account_code;
  const targetTeacherId: string | undefined = body?.target_teacher_id;

  // ---------------------------------------------------------------------------
  // TEACHER IMPERSONATION PATH (developer opens a real teacher's account
  // read/write to use the actual teacher upload UI). Uses magic-link OTP
  // exchange so the teacher's password is never touched.
  // ---------------------------------------------------------------------------
  if (targetTeacherId) {
    const { data: teacherUser, error: teacherErr } = await admin.auth.admin.getUserById(targetTeacherId);
    if (teacherErr || !teacherUser?.user) return json(404, { error: "المعلم غير موجود" });
    const teacherEmail = teacherUser.user.email;
    if (!teacherEmail) return json(400, { error: "المعلم لا يملك بريداً إلكترونياً صالحاً" });

    const { data: teacherProfile } = await admin
      .from("profiles").select("full_name, role").eq("id", targetTeacherId).maybeSingle();
    const { data: teacherRoles } = await admin
      .from("user_roles").select("role").eq("user_id", targetTeacherId);
    const isTeacher = (teacherRoles || []).some((r: any) => r.role === "teacher")
      || (teacherProfile as any)?.role === "teacher";
    if (!isTeacher) return json(400, { error: "الحساب المحدد ليس معلماً" });

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink", email: teacherEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("teacher impersonation magiclink failed", linkErr?.message);
      return json(500, { error: linkErr?.message || "تعذر إنشاء جلسة المعلم" });
    }

    const exchange = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: otpData, error: otpErr } = await exchange.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (otpErr || !otpData?.session) {
      console.error("teacher impersonation OTP exchange failed", otpErr?.message);
      return json(500, { error: otpErr?.message || "فشل إنشاء جلسة المعلم" });
    }

    try {
      await admin.from("teacher_activity_logs").insert({
        teacher_id: targetTeacherId,
        action_type: "developer_impersonate",
        action_label: "دخول المطور إلى حساب المعلم",
        description: `المطور ${callerEmail || callerId} فتح حساب المعلم`,
        metadata: { developer_id: callerId, developer_email: callerEmail },
      });
    } catch (_e) { /* best-effort */ }

    return json(200, {
      session: otpData.session,
      target: {
        id: targetTeacherId,
        email: teacherEmail,
        full_name: (teacherProfile as any)?.full_name || teacherEmail,
        role: "teacher",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // TEST STUDENT IMPERSONATION PATH (existing, unchanged behaviour)
  // ---------------------------------------------------------------------------
  if (!targetId && !targetCode) {
    return json(400, { error: "target_user_id, test_account_code, or target_teacher_id required" });
  }

  let resolvedCode = targetCode?.toUpperCase();
  let targetEmail = resolvedCode ? testEmail(resolvedCode) : "";
  let targetName = resolvedCode ? TEST_ACCOUNT_LABELS[resolvedCode] : "";

  if (targetId && !resolvedCode) {
    const { data: userResult, error: userLookupErr } = await admin.auth.admin.getUserById(targetId);
    if (userLookupErr || !userResult?.user) return json(404, { error: "test account not found" });
    const meta = userResult.user.user_metadata || {};
    const metaCode = typeof meta.test_account_code === "string" ? meta.test_account_code.toUpperCase() : "";
    if (meta.is_test_account !== true || !TEST_ACCOUNT_LABELS[metaCode]) {
      return json(400, { error: "not a test account" });
    }
    resolvedCode = metaCode;
    targetEmail = userResult.user.email || testEmail(metaCode);
    targetName = String(meta.full_name || TEST_ACCOUNT_LABELS[metaCode]);
  }

  if (!resolvedCode || !TEST_ACCOUNT_LABELS[resolvedCode]) {
    return json(404, { error: "test account not found" });
  }

  const tempPassword = makeTemporaryPassword();
  let targetUserId: string | undefined;
  if (targetId) {
    const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(targetId);
    if (targetErr) return json(404, { error: "لم يتم العثور على حساب الطالب التجريبي" });
    targetUserId = targetUser?.user?.id;
  } else {
    try {
      targetUserId = (await findAuthUserByEmail(admin, targetEmail))?.id;
    } catch (listErr: any) {
      return json(500, { error: listErr?.message || "تعذر قراءة الحساب التجريبي" });
    }
  }

  if (!targetUserId) {
    try {
      const repaired = await ensureTestStudentAccount(admin, resolvedCode, tempPassword);
      targetUserId = repaired.user.id;
      targetEmail = repaired.email;
      targetName = repaired.fullName;
    } catch (repairErr: any) {
      console.error("developer-impersonate account repair failed", { code: resolvedCode, message: repairErr?.message });
      return json(500, { error: repairErr?.message || "تعذر تجهيز حساب الطالب التجريبي" });
    }
  }

  const { error: passErr } = await admin.auth.admin.updateUserById(targetUserId, {
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: targetName,
      is_test_account: true,
      test_account_code: resolvedCode,
    },
    app_metadata: { provider: "email", providers: ["email"] },
  });
  if (passErr) {
    console.error("developer-impersonate password setup failed", { code: resolvedCode, message: passErr.message });
    return json(500, { error: passErr.message || "تعذر تجهيز جلسة الحساب التجريبي" });
  }

  const exchange = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyErr } = await exchange.auth.signInWithPassword({
    email: targetEmail,
    password: tempPassword,
  });
  if (verifyErr || !verifyData?.session) {
    console.error("developer-impersonate sign in failed", { code: resolvedCode, message: verifyErr?.message });
    return json(500, { error: verifyErr?.message || "فشل إنشاء جلسة الطالب التجريبي" });
  }

  try {
    await admin.from("student_activity_logs").insert({
      student_id: verifyData.session.user.id,
      action_type: "developer_impersonate",
      action_label: "دخول المطور إلى حساب تجريبي",
      description: `المطور ${callerEmail || callerId} فتح الحساب ${resolvedCode}`,
      metadata: { developer_id: callerId, developer_email: callerEmail },
    });
  } catch (_e) { /* best-effort */ }

  return json(200, {
    session: verifyData.session,
    target: {
      id: verifyData.session.user.id,
      email: verifyData.session.user.email || targetEmail,
      full_name: targetName,
      test_account_code: resolvedCode,
    },
  });
});
