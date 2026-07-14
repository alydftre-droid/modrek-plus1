// integrity-check
// -----------------------------------------------------------------------------
// Returns a SHA-256 hash of the caller's canonical "critical data snapshot"
// (wallet balance, active subscription count, unread notification count).
// The client computes the same snapshot locally, hashes it the same way, and
// compares. If the hashes differ, the client invalidates its caches. This is
// how the Data Integrity Layer keeps Web / PWA / Android identical.
//
// SECURITY: we require and verify a Supabase JWT via _shared/auth.ts. No
// data is ever returned — only a hash — so this endpoint cannot be used to
// exfiltrate rows even if abused.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getVerifiedUserFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};



function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "number") return Number.isFinite(value as number) ? String(value) : "null";
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
  }
  return "null";
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const user = await getVerifiedUserFromAuthHeader(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    req.headers.get("Authorization"),
  );
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [wallet, subs, notif] = await Promise.all([
    admin.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", user.id)
      .eq("is_active", true)
      .gt("end_date", new Date().toISOString()),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  const snapshot = {
    wallet_balance: (wallet.data as any)?.balance ?? null,
    active_subscriptions: (subs as any).count ?? 0,
    unread_notifications: (notif as any).count ?? 0,
  };

  const hash = await sha256Hex(stableStringify(snapshot));

  return new Response(JSON.stringify({ hash, ts: Date.now() }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
