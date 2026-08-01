// ============================================================================
// AI Provider Layer (طبقة مزوّد الذكاء الاصطناعي)
// ----------------------------------------------------------------------------
// Single decision point for WHICH OpenAI-compatible gateway every AI feature
// in the platform talks to. Adding a new provider later (Google AI Studio,
// OpenAI, Anthropic-compatible proxies, ...) only needs a row in
// public.ai_gateway_providers + its API key secret — no code changes.
//
// Rules:
//  - Exactly one provider is active at a time (enforced by a DB trigger).
//  - Each provider is fully independent: own API key env, own base URL, own
//    per-function model lists (public.ai_provider_function_settings).
//  - OpenRouter behaviour is unchanged and remains the default/fallback.
// ============================================================================

export type AiGatewayProvider = string;

export interface AiProviderConfig {
  provider: AiGatewayProvider;
  label: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKey: string;
  hasKey: boolean;
  source: "db" | "fallback";
}

export const OPENROUTER_FALLBACK: AiProviderConfig = {
  provider: "openrouter",
  label: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKeyEnv: "OPENROUTER_API_KEY",
  apiKey: "",
  hasKey: false,
  source: "fallback",
};

const CACHE_TTL_MS = 10_000; // switching in the dashboard applies within ~10s
let cache: { at: number; config: AiProviderConfig } | null = null;

function normalizeBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

function envKey(name: string): string {
  return String(Deno.env.get(name) || "").trim();
}

/** Invalidate the in-memory provider cache (used after admin saves). */
export function clearAiProviderCache() {
  cache = null;
}

async function fetchActiveProviderRow(): Promise<AiProviderConfig> {
  const url = envKey("SUPABASE_URL");
  const serviceKey = envKey("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return { ...OPENROUTER_FALLBACK, apiKey: envKey("OPENROUTER_API_KEY"), hasKey: !!envKey("OPENROUTER_API_KEY") };
  }
  try {
    const resp = await fetch(
      `${url}/rest/v1/ai_gateway_providers?is_active=eq.true&select=provider,label,base_url,api_key_env&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) throw new Error(`status_${resp.status}`);
    const rows = await resp.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.provider) throw new Error("no_active_provider");
    const apiKeyEnv = String(row.api_key_env || "OPENROUTER_API_KEY");
    const apiKey = envKey(apiKeyEnv);
    return {
      provider: String(row.provider),
      label: String(row.label || row.provider),
      baseUrl: normalizeBaseUrl(row.base_url) || OPENROUTER_FALLBACK.baseUrl,
      apiKeyEnv,
      apiKey,
      hasKey: !!apiKey,
      source: "db",
    };
  } catch (err) {
    console.warn("[ai-provider] active_provider_lookup_failed", String((err as Error)?.message || err));
    const apiKey = envKey("OPENROUTER_API_KEY");
    return { ...OPENROUTER_FALLBACK, apiKey, hasKey: !!apiKey };
  }
}

/**
 * Resolve the currently active AI provider (cached briefly).
 * Never throws — always returns a usable config (OpenRouter fallback).
 */
export async function getActiveAiProvider(): Promise<AiProviderConfig> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.config;
  const config = await fetchActiveProviderRow();
  cache = { at: now, config };
  return config;
}

/** Base URL of the active provider (e.g. for direct fetch calls). */
export async function getActiveAiBaseUrl(): Promise<string> {
  return (await getActiveAiProvider()).baseUrl;
}

/** API key of the active provider. Empty string when the secret is missing. */
export async function getActiveAiApiKey(): Promise<string> {
  return (await getActiveAiProvider()).apiKey;
}

/**
 * Build a full endpoint URL on the active provider,
 * e.g. `await activeAiEndpoint("/chat/completions")`.
 */
export async function activeAiEndpoint(path: string): Promise<string> {
  const base = await getActiveAiBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * List every configured provider (admin dashboard / diagnostics).
 */
export async function listAiProviders(): Promise<
  Array<{ provider: string; label: string; base_url: string; api_key_env: string; is_active: boolean; has_key: boolean }>
> {
  const url = envKey("SUPABASE_URL");
  const serviceKey = envKey("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return [];
  const resp = await fetch(
    `${url}/rest/v1/ai_gateway_providers?select=provider,label,base_url,api_key_env,is_active&order=provider`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" } },
  );
  if (!resp.ok) return [];
  const rows = await resp.json();
  return (Array.isArray(rows) ? rows : []).map((row: Record<string, unknown>) => ({
    provider: String(row.provider),
    label: String(row.label || row.provider),
    base_url: String(row.base_url || ""),
    api_key_env: String(row.api_key_env || ""),
    is_active: row.is_active === true,
    has_key: !!envKey(String(row.api_key_env || "")),
  }));
}
