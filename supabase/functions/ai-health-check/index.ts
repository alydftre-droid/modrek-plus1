import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, resolveGeminiApiKey } from "../_shared/aiSettings.ts";

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
  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let last = { ok: false, status: 502, error: "NO_MODEL_TESTED", model: null as string | null };

  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Return only: ok" }] }] }),
    });
    if (res.ok) return { ok: true, status: res.status, error: null, model };

    const upstream = await res.text().catch(() => "");
    last = { ok: false, status: res.status, error: upstream.slice(0, 500), model };
    if (![404, 429].includes(res.status)) break;
  }

  return last;
}

async function verifyChatPipeline(apiKey: string) {
  const result = await callGeminiWithFallback({
    apiKey,
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
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
    return { ok: false, status: result.status, model: null, provider: "gemini", error: String(result.lastError || "").slice(0, 500) };
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
    ? await resolveGeminiApiKey(sb, Deno.env.get("GEMINI_API_KEY") || "")
    : { apiKey: Deno.env.get("GEMINI_API_KEY") || "", source: "env" as const };
  const geminiKey = resolved.apiKey;
  const verification = await verifyGeminiKey(geminiKey);
  const chatPipeline = geminiKey ? await verifyChatPipeline(geminiKey) : { ok: false, status: 500, model: null, provider: "gemini", error: "GEMINI_API_KEY_MISSING" };
  const body = {
    ok: Boolean(geminiKey) && verification.ok && chatPipeline.ok,
    provider: "gemini",
    project: supabaseUrl || null,
    configured: {
      GEMINI_API_KEY: Boolean(geminiKey),
      keyFingerprint: mask(geminiKey),
      keySource: resolved.source,
    },
    verification: {
      status: verification.status,
      model: verification.model,
      error: verification.error,
    },
    chatPipeline,
  };

  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : (verification.status || 500),
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});