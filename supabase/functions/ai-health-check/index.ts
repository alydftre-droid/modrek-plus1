import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveOpenRouterApiKey } from "../_shared/aiSettings.ts";

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

async function verifyChatPipeline() {
  const result = await callGeminiWithFallback({
    models: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
    body: {
      messages: [
        { role: "system", content: "اسم المنصة الرسمي الوحيد مدرك بلس. أجب بكلمة ok فقط." },
        { role: "user", content: "اختبار" },
      ],
      stream: false,
    },
    timeoutMs: 20000,
  });

  if (!result.ok) {
    return { ok: false, status: result.status, model: null, provider: "openrouter", error: String(result.lastError || "").slice(0, 500) };
  }

  const payload = await result.response.json().catch(() => null);
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  return { ok: Boolean(content), status: 200, model: result.model, provider: result.provider, contentPreview: content.slice(0, 40), error: content ? null : "EMPTY_CHAT_PIPELINE_RESPONSE" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isServiceRoleRequest(req)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  const resolved = sb
    ? await resolveOpenRouterApiKey(sb)
    : { apiKey: Deno.env.get("OPENROUTER_API_KEY") || "", source: "env" as const };
  const openRouterKey = resolved.apiKey;
  const chatPipeline = openRouterKey
    ? await verifyChatPipeline()
    : { ok: false, status: 500, model: null, provider: "openrouter", error: "OPENROUTER_API_KEY_MISSING" };

  const body = {
    ok: Boolean(openRouterKey) && chatPipeline.ok,
    provider: "openrouter",
    project: supabaseUrl || null,
    configured: {
      OPENROUTER_API_KEY: Boolean(openRouterKey),
      keyFingerprint: mask(openRouterKey),
      keySource: resolved.source,
    },
    chatPipeline,
  };

  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
