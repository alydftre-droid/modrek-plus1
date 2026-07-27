// TEMPORARY: Promo video capture helper. Signs a session for a specific
// test-student email, guarded by PROMO_VIDEO_TEMP_KEY. Delete after use.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-promo-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = Deno.env.get("PROMO_VIDEO_TEMP_KEY");
  const provided = req.headers.get("x-promo-key");
  if (!gate || provided !== gate) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const body = await req.json().catch(() => ({}));
  const email: string = body.email || "gen-sec1@test.modrek.local";

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const tempPass = `PromoTmp-${crypto.randomUUID()}-9x!`;
  // Find user
  let userId: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = (data?.users || []).find(x => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) { userId = u.id; break; }
    if ((data?.users || []).length < 1000) break;
  }
  if (!userId) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  await admin.auth.admin.updateUserById(userId, { password: tempPass, email_confirm: true });
  const exchange = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error } = await exchange.auth.signInWithPassword({ email, password: tempPass });
  if (error || !sess?.session) return new Response(JSON.stringify({ error: error?.message || "signin failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ session: sess.session, email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
