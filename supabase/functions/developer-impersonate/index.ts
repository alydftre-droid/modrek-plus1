// Developer impersonation endpoint.
// Only super admin (alyedaft@gmail.com) or users with admin role can call it.
// Returns a signed magic link session (access + refresh tokens) for a
// developer test student account, so the developer can "log in as" that
// student without any password. All test-account interactions are recorded
// in the normal student tables — they are permanent, real data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPER_ADMIN_EMAIL = "alyedaft@gmail.com";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "missing token" });

  // Verify caller identity with anon client + JWT
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "invalid session" });
  const callerId = userData.user.id;
  const callerEmail = (userData.user.email || "").toLowerCase();

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

  // Resolve target test-student profile through a database function so the
  // endpoint is not affected by stale REST schema cache for newly added columns.
  const { data: profRows, error: profErr } = await admin.rpc("resolve_developer_test_student", {
    _target_user_id: targetId ?? null,
    _test_account_code: targetCode ?? null,
  });
  if (profErr) return json(500, { error: profErr.message });
  const target = (profRows || [])[0];
  if (!target) return json(404, { error: "test account not found" });
  if (!target.is_test_account) return json(400, { error: "not a test account" });

  // Generate a magic link and exchange the token_hash for a real session
  const { data: linkData, error: linkErr } = await (admin.auth as any).admin
    .generateLink({ type: "magiclink", email: target.email });
  if (linkErr || !linkData) return json(500, { error: linkErr?.message || "link failed" });

  const tokenHash: string | undefined =
    linkData?.properties?.hashed_token ?? linkData?.hashed_token;
  if (!tokenHash) return json(500, { error: "no token_hash" });

  // Exchange token_hash → session using anon client
  const exchange = createClient(SUPABASE_URL, ANON_KEY, {
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
      student_id: target.id,
      action_type: "developer_impersonate",
      action_label: "دخول المطور إلى حساب تجريبي",
      description: `المطور ${callerEmail} فتح الحساب ${target.test_account_code}`,
      metadata: { developer_id: callerId, developer_email: callerEmail },
    });
  } catch (_e) { /* best-effort */ }

  return json(200, {
    session: verifyData.session,
    target: {
      id: target.id,
      email: target.email,
      full_name: target.full_name,
      test_account_code: target.test_account_code,
    },
  });
});
