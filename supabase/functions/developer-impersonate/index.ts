// Developer impersonation endpoint.
// Only super admin (alyedaft@gmail.com) or users with admin role can call it.
// Returns a signed magic link session (access + refresh tokens) for a
// developer test student account, so the developer can "log in as" that
// student without any password. All test-account interactions are recorded
// in the normal student tables — they are permanent, real data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPER_ADMIN_EMAIL = "alyedaft@gmail.com";

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

function testEmail(code: string) {
  return `${code.toLowerCase()}@test.modrek.local`;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const claims = getJwtClaimsFromAuthHeader(req.headers.get("Authorization"));
  if (!claims?.sub) return json(401, { error: "missing token" });
  const callerId = claims.sub;
  const callerEmail = String(claims.email || "").toLowerCase();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authorization: super admin OR has admin role
  let isAllowed = callerEmail === SUPER_ADMIN_EMAIL;
  if (!isAllowed) {
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    isAllowed = (roleRows || []).some((r: any) => r.role === "admin");
  }
  if (!isAllowed) return json(403, { error: "forbidden" });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const targetId: string | undefined = body?.target_user_id;
  const targetCode: string | undefined = body?.test_account_code;

  if (!targetId && !targetCode) {
    return json(400, { error: "target_user_id or test_account_code required" });
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

  // Generate a magic link and exchange the token_hash for a real session
  const { data: linkData, error: linkErr } = await (admin.auth as any).admin
    .generateLink({ type: "magiclink", email: targetEmail });
  if (linkErr || !linkData) return json(500, { error: linkErr?.message || "link failed" });

  const tokenHash: string | undefined =
    linkData?.properties?.hashed_token ?? linkData?.hashed_token;
  if (!tokenHash) return json(500, { error: "no token_hash" });

  // Exchange token_hash → session using anon client
  const exchange = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyErr } = await exchange.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyErr || !verifyData?.session) {
    return json(500, { error: verifyErr?.message || "otp verification failed" });
  }

  // Log the impersonation on the test student's activity log
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
