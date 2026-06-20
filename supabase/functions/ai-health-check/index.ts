import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callGeminiWithFallback, loadAiSettings } from "../_shared/aiSettings.ts";
import { getJwtClaimsFromAuthHeader } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUNCTIONS_TO_CHECK = ["ai-chat", "teacher-assistant", "support-assistant", "generate-exam", "grade-essay"];

function safeError(value: unknown) {
  return String(value instanceof Error ? value.message : value || "unknown_error").slice(0, 500);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const authHeader = req.headers.get("Authorization");
  const claims = getJwtClaimsFromAuthHeader(authHeader);
  if (!claims?.sub) {
    return new Response(JSON.stringify({ ok: false, error: "غير مصرح" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
  const sb = createClient(supabaseUrl, serviceKey);

  const checks: Record<string, unknown> = {
    env: {
      supabase: Boolean(supabaseUrl && serviceKey),
      gemini: Boolean(geminiKey),
      fallback_gateway: Boolean(lovableKey),
    },
    settings: {},
    providers: {},
    tables: {},
  };

  let ok = Boolean(supabaseUrl && serviceKey && (geminiKey || lovableKey));

  for (const functionName of FUNCTIONS_TO_CHECK) {
    try {
      const settings = await loadAiSettings(sb, functionName);
      (checks.settings as Record<string, unknown>)[functionName] = {
        ok: Array.isArray(settings.models_to_try) && settings.models_to_try.length > 0,
        models: settings.models_to_try,
        streaming: settings.enable_streaming,
      };
    } catch (error) {
      ok = false;
      (checks.settings as Record<string, unknown>)[functionName] = { ok: false, error: safeError(error) };
    }
  }

  try {
    const result = await callGeminiWithFallback({
      apiKey: geminiKey,
      models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
      body: {
        temperature: 0,
        messages: [
          { role: "system", content: "رد بكلمة OK فقط." },
          { role: "user", content: "health" },
        ],
        stream: false,
      },
      timeoutMs: 20_000,
    });

    if (!result.ok) {
      ok = false;
      checks.providers = { ok: false, status: result.status, error: safeError(result.lastError) };
    } else {
      const data = await result.response.json().catch(() => ({}));
      const content = String(data?.choices?.[0]?.message?.content || "").trim();
      checks.providers = { ok: Boolean(content), provider: result.provider, model: result.model, content: content.slice(0, 50) };
      if (!content) ok = false;
    }
  } catch (error) {
    ok = false;
    checks.providers = { ok: false, error: safeError(error) };
  }

  try {
    const [conversations, messages, sources] = await Promise.all([
      sb.from("ai_conversations").select("id", { count: "exact", head: true }),
      sb.from("ai_messages").select("id", { count: "exact", head: true }),
      sb.from("ai_sources").select("id", { count: "exact", head: true }),
    ]);
    checks.tables = {
      ai_conversations: { ok: !conversations.error, count: conversations.count ?? 0, error: conversations.error?.message },
      ai_messages: { ok: !messages.error, count: messages.count ?? 0, error: messages.error?.message },
      ai_sources: { ok: !sources.error, count: sources.count ?? 0, error: sources.error?.message },
    };
    if (conversations.error || messages.error || sources.error) ok = false;
  } catch (error) {
    ok = false;
    checks.tables = { ok: false, error: safeError(error) };
  }

  return new Response(JSON.stringify({
    ok,
    status: ok ? "healthy" : "degraded",
    checked_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    checks,
  }), {
    status: ok ? 200 : 503,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});