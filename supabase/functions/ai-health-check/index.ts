import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mask(value: string) {
  return value ? `${value.slice(0, 4)}…${value.slice(-4)}` : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const body = {
    ok: Boolean(geminiKey),
    provider: "gemini",
    project: Deno.env.get("SUPABASE_URL") || null,
    configured: {
      GEMINI_API_KEY: Boolean(geminiKey),
      keyFingerprint: mask(geminiKey),
    },
  };

  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});