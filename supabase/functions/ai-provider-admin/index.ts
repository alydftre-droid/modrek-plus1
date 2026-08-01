// ai-provider-admin — admin-only control panel API for the AI Provider Layer.
// Actions:
//   list        -> providers + key presence + active one
//   set_active  -> switch the ACTIVE provider (instant, one only)
//   save        -> update base_url / label for a provider
//   test        -> live connectivity test against a provider (models + chat ping)
//
// Adding a future provider (Google AI Studio, OpenAI, ...) only needs a row in
// public.ai_gateway_providers + its API key secret. No code change here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function envKey(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function normalizeBaseUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "");
}

async function testProvider(baseUrl: string, apiKey: string, model?: string) {
  const started = Date.now();
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), 25_000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://modrekplus.com",
        "X-Title": "Modrek Plus",
      },
      body: JSON.stringify({
        model: model || "google/gemini-2.5-flash",
        messages: [{ role: "user", content: "قل: جاهز" }],
        max_tokens: 16,
      }),
    });
    clearTimeout(timer);
    const text = await resp.text().catch(() => "");
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("json");
    if (resp.ok && !isJson) {
      return {
        ok: false,
        status: 502,
        duration_ms: Date.now() - started,
        endpoint: url,
        reply: "",
        error: `المزود رد بصفحة حماية (WAF) بدل JSON — تأكد من صحة Base URL أو أن الخدمة تسمح بالطلبات من سيرفرات المنصة. المحتوى: ${contentType || "unknown"} — ${text.slice(0, 200)}`,
      };
    }
    let reply = "";
    try {
      const parsed = JSON.parse(text);
      reply = String(parsed?.choices?.[0]?.message?.content || "").trim();
    } catch { /* keep raw */ }
    return {
      ok: resp.ok,
      status: resp.status,
      duration_ms: Date.now() - started,
      endpoint: url,
      reply: reply.slice(0, 200),
      error: resp.ok ? null : text.slice(0, 500),
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      duration_ms: Date.now() - started,
      endpoint: url,
      reply: "",
      error: String((err as Error)?.message || err).slice(0, 500),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (isAdmin !== true) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    const loadProviders = async () => {
      const { data } = await admin
        .from("ai_gateway_providers")
        .select("provider,label,base_url,api_key_env,is_active,updated_at")
        .order("provider");
      return (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        has_key: !!envKey(String(row.api_key_env || "")),
      }));
    };

    if (action === "list") {
      return json({ providers: await loadProviders() });
    }

    if (action === "set_active") {
      const provider = String(body.provider || "").trim();
      if (!provider) return json({ error: "provider_required" }, 400);
      const { error } = await admin
        .from("ai_gateway_providers")
        .update({ is_active: true, updated_by: userData.user.id, updated_at: new Date().toISOString() })
        .eq("provider", provider);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, active: provider, providers: await loadProviders() });
    }

    if (action === "save") {
      const provider = String(body.provider || "").trim();
      if (!provider) return json({ error: "provider_required" }, 400);
      const patch: Record<string, unknown> = { updated_by: userData.user.id, updated_at: new Date().toISOString() };
      if (body.base_url) patch.base_url = normalizeBaseUrl(String(body.base_url));
      if (body.label) patch.label = String(body.label).slice(0, 60);
      const { error } = await admin.from("ai_gateway_providers").update(patch).eq("provider", provider);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, providers: await loadProviders() });
    }

    if (action === "test") {
      const provider = String(body.provider || "").trim();
      const { data: row } = await admin
        .from("ai_gateway_providers")
        .select("provider,label,base_url,api_key_env")
        .eq("provider", provider)
        .maybeSingle();
      if (!row) return json({ error: "provider_not_found" }, 404);
      const baseUrl = normalizeBaseUrl(String(body.base_url || row.base_url));
      const apiKey = envKey(String(row.api_key_env));
      if (!apiKey) {
        return json({
          ok: false,
          status: 401,
          key_missing: true,
          api_key_env: row.api_key_env,
          error: `${row.api_key_env} غير مضبوط في إعدادات الأسرار`,
        });
      }
      const result = await testProvider(baseUrl, apiKey, body.model ? String(body.model) : undefined);
      return json({ ...result, provider: row.provider, api_key_env: row.api_key_env, key_missing: false });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[ai-provider-admin] error", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
