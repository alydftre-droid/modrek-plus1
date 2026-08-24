// Resolves the account email for a phone number so students can sign in with
// their phone. The underlying lookup used to be a public RPC callable by
// anonymous visitors, which allowed harvesting user emails by brute-forcing
// phone numbers. It is now server-only and rate limited per client IP.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const phone = String((body as Record<string, unknown>)?.phone ?? "");
    if (!phone) return json({ ok: false, reason: "invalid_phone" }, 400);

    const forwarded = req.headers.get("x-forwarded-for") || "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    // Hash the IP so we never persist raw client addresses.
    const ipHash = await sha256Hex(`modrek-login-lookup:${ip}`);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await admin.rpc("resolve_login_email_rate_limited", {
      _phone: phone,
      _ip_hash: ipHash,
    });

    if (error) {
      console.error("[resolve-login-email] rpc failed", error.message);
      return json({ ok: false, reason: "lookup_failed" }, 500);
    }

    const result = (data || {}) as Record<string, unknown>;
    if (result.ok !== true) {
      const reason = String(result.reason || "not_found");
      // Generic message on purpose: never confirm whether a phone exists.
      return json({ ok: false, reason }, reason === "rate_limited" ? 429 : 404);
    }

    return json({ ok: true, email: String(result.email) });
  } catch (err) {
    console.error("[resolve-login-email] unexpected", err);
    return json({ ok: false, reason: "unexpected_error" }, 500);
  }
});
