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

// ============================================================================
// Unified AI transport (طبقة النقل الموحدة)
// ----------------------------------------------------------------------------
// EVERY AI request in the platform must go through one of the helpers below.
// No edge function may fetch openrouter.ai / agentrouter.org (or any other
// gateway host) directly, and none may read a provider API key from env.
// The active provider decides base URL + key; `providerName` is only used by
// the developer diagnostics page to test one provider independently.
// ============================================================================

const AI_REFERRER = "https://modrekplus.com";
const AI_APP_TITLE = "Modrek Plus";

export interface AiCallResult<T = unknown> {
  ok: boolean;
  status: number;
  provider: string;
  endpoint: string;
  duration_ms: number;
  data?: T;
  response?: Response;
  error?: string | null;
}

/** Resolve a specific provider by name, or the active one when omitted. */
export async function resolveAiProvider(providerName?: string | null): Promise<AiProviderConfig> {
  const name = String(providerName || "").trim();
  if (!name) return await getActiveAiProvider();
  const url = envKey("SUPABASE_URL");
  const serviceKey = envKey("SUPABASE_SERVICE_ROLE_KEY");
  if (url && serviceKey) {
    try {
      const resp = await fetch(
        `${url}/rest/v1/ai_gateway_providers?provider=eq.${encodeURIComponent(name)}&select=provider,label,base_url,api_key_env&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" } },
      );
      if (resp.ok) {
        const rows = await resp.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row?.provider) {
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
        }
      }
    } catch (err) {
      console.warn("[ai-provider] provider_lookup_failed", String((err as Error)?.message || err));
    }
  }
  return await getActiveAiProvider();
}

export function buildAiHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": AI_REFERRER,
    "X-Title": AI_APP_TITLE,
    ...extra,
  };
}

/**
 * Low-level unified request. Returns the raw Response (so SSE streams and
 * binary audio bodies both work) plus provider/timing metadata.
 * Guards against gateways that answer 200 with a WAF/HTML challenge page.
 */
export async function aiFetch(opts: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  providerName?: string | null;
  timeoutMs?: number;
  expect?: "json" | "stream" | "binary";
  headers?: Record<string, string>;
}): Promise<AiCallResult> {
  const provider = await resolveAiProvider(opts.providerName);
  const endpoint = `${provider.baseUrl}${opts.path.startsWith("/") ? opts.path : `/${opts.path}`}`;
  const started = Date.now();
  if (!provider.hasKey) {
    return {
      ok: false,
      status: 401,
      provider: provider.provider,
      endpoint,
      duration_ms: 0,
      error: `${provider.apiKeyEnv}_MISSING`,
    };
  }
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: opts.method || "POST",
      headers: buildAiHeaders(provider.apiKey, opts.headers),
      signal: controller.signal,
      body: opts.method === "GET" || opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    clearTimeout(timer);
    const duration_ms = Date.now() - started;
    const contentType = (resp.headers.get("content-type") || "").toLowerCase();
    if (resp.ok && (opts.expect ?? "json") !== "binary") {
      const looksLikeAi = contentType.includes("json") || contentType.includes("event-stream") || contentType.includes("text/plain");
      if (!looksLikeAi) {
        const preview = (await resp.text().catch(() => "")).slice(0, 300);
        return {
          ok: false,
          status: 502,
          provider: provider.provider,
          endpoint,
          duration_ms,
          error: `PROVIDER_BLOCKED_NON_JSON_RESPONSE (${contentType || "unknown"}) ${preview}`,
        };
      }
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, provider: provider.provider, endpoint, duration_ms, error: text.slice(0, 800) };
    }
    if ((opts.expect ?? "json") === "json") {
      const text = await resp.text().catch(() => "");
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 800) }; }
      return { ok: true, status: resp.status, provider: provider.provider, endpoint, duration_ms, data, error: null };
    }
    return { ok: true, status: resp.status, provider: provider.provider, endpoint, duration_ms, response: resp, error: null };
  } catch (err) {
    clearTimeout(timer);
    let msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) msg = `timeout after ${timeoutMs}ms`;
    return { ok: false, status: 0, provider: provider.provider, endpoint, duration_ms: Date.now() - started, error: msg };
  }
}

/** Chat / vision / OCR — all use the OpenAI-compatible chat endpoint. */
export async function aiChatCompletion(opts: {
  body: Record<string, unknown>;
  providerName?: string | null;
  timeoutMs?: number;
  stream?: boolean;
}): Promise<AiCallResult<any>> {
  return await aiFetch({
    path: "/chat/completions",
    body: opts.body,
    providerName: opts.providerName,
    timeoutMs: opts.timeoutMs,
    expect: opts.stream ? "stream" : "json",
  });
}

/** Embeddings through the active provider. */
export async function aiEmbeddings(opts: {
  model: string;
  input: string[];
  dimensions?: number;
  providerName?: string | null;
  timeoutMs?: number;
}): Promise<AiCallResult<any>> {
  return await aiFetch({
    path: "/embeddings",
    body: {
      model: opts.model,
      input: opts.input,
      ...(opts.dimensions ? { dimensions: opts.dimensions } : {}),
      encoding_format: "float",
    },
    providerName: opts.providerName,
    timeoutMs: opts.timeoutMs ?? 60_000,
  });
}

/** Text-to-speech through the active provider (binary/audio body). */
export async function aiSpeech(opts: {
  body: Record<string, unknown>;
  providerName?: string | null;
  timeoutMs?: number;
}): Promise<AiCallResult> {
  return await aiFetch({
    path: "/audio/speech",
    body: opts.body,
    providerName: opts.providerName,
    timeoutMs: opts.timeoutMs ?? 60_000,
    expect: "binary",
  });
}

/** Speech-to-text through the active provider (multipart upload). */
export async function aiTranscription(opts: {
  file: Blob;
  fileName?: string;
  model: string;
  language?: string;
  providerName?: string | null;
  timeoutMs?: number;
}): Promise<AiCallResult<any>> {
  const provider = await resolveAiProvider(opts.providerName);
  const endpoint = `${provider.baseUrl}/audio/transcriptions`;
  const started = Date.now();
  if (!provider.hasKey) {
    return { ok: false, status: 401, provider: provider.provider, endpoint, duration_ms: 0, error: `${provider.apiKeyEnv}_MISSING` };
  }
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  try {
    const form = new FormData();
    form.append("file", opts.file, opts.fileName || "audio.wav");
    form.append("model", opts.model);
    if (opts.language) form.append("language", opts.language);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "HTTP-Referer": AI_REFERRER,
        "X-Title": AI_APP_TITLE,
      },
      signal: controller.signal,
      body: form,
    });
    clearTimeout(timer);
    const text = await resp.text().catch(() => "");
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    return {
      ok: resp.ok,
      status: resp.status,
      provider: provider.provider,
      endpoint,
      duration_ms: Date.now() - started,
      data,
      error: resp.ok ? null : text.slice(0, 500),
    };
  } catch (err) {
    clearTimeout(timer);
    let msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("abort") || msg.toLowerCase().includes("timeout")) msg = `timeout after ${timeoutMs}ms`;
    return { ok: false, status: 0, provider: provider.provider, endpoint, duration_ms: Date.now() - started, error: msg };
  }
}

/** List models exposed by a provider (diagnostics only). */
export async function aiListModels(providerName?: string | null): Promise<AiCallResult<any>> {
  return await aiFetch({ path: "/models", method: "GET", providerName, timeoutMs: 20_000 });
}
