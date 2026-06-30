import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mask(value: string) {
  return value ? `${value.slice(0, 4)}…${value.slice(-4)}` : null;
}

function isServiceRoleRequest(req: Request) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  return Boolean(serviceRoleKey && bearerToken === serviceRoleKey);
}

async function verifyGeminiKey(apiKey: string) {
  if (!apiKey) return { ok: false, status: 500, error: "GEMINI_API_KEY_MISSING" };
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Return only: ok" }] }] }),
  });
  if (!res.ok) {
    const upstream = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: upstream.slice(0, 500) };
  }
  return { ok: true, status: res.status, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isServiceRoleRequest(req)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const verification = await verifyGeminiKey(geminiKey);
  const body = {
    ok: Boolean(geminiKey) && verification.ok,
    provider: "gemini",
    project: Deno.env.get("SUPABASE_URL") || null,
    configured: {
      GEMINI_API_KEY: Boolean(geminiKey),
      keyFingerprint: mask(geminiKey),
    },
    verification: {
      status: verification.status,
      error: verification.error,
    },
  };

  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : (verification.status || 500),
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});