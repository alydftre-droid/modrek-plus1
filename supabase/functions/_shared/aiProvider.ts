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

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Provider-appropriate headers.
 * `HTTP-Referer` / `X-Title` are OpenRouter-specific attribution headers — we
 * only send them there. Every other OpenAI-compatible gateway gets the minimal
 * documented set (Authorization + Content-Type + Accept) plus a normal
 * User-Agent, which is what edge-protected gateways expect.
 */
export function buildAiHeaders(
  apiKey: string,
  extra: Record<string, string> = {},
  provider?: string,
): Record<string, string> {
  const isOpenRouter = !provider || provider === "openrouter";
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": BROWSER_UA,
    Authorization: `Bearer ${apiKey}`,
    ...(isOpenRouter ? { "HTTP-Referer": AI_REFERRER, "X-Title": AI_APP_TITLE } : {}),
    ...extra,
  };
}

/**
 * WAF / challenge-page detection. Some gateways (AgentRouter behind Aliyun WAF)
 * answer HTTP 200 with an HTML challenge page instead of the JSON/audio body,
 * on EVERY endpoint — including `/audio/speech` and `/audio/transcriptions`.
 * Without this check those calls look "successful" while returning garbage.
 */
export function detectAiWafBlock(contentType: string, sample: string): string | null {
  const ct = (contentType || "").toLowerCase();
  const body = (sample || "").slice(0, 600);
  const htmlish = ct.includes("text/html") || /^\s*<(!doctype|html|meta)/i.test(body);
  if (!htmlish) return null;
  const waf = /aliyun_waf|captcha|cloudflare|challenge|Just a moment/i.test(body) ? " (WAF_CHALLENGE)" : "";
  return `PROVIDER_BLOCKED_NON_JSON_RESPONSE${waf} (${ct || "unknown"}) ${body.slice(0, 300)}`;
}

/**
 * Is this failure a provider-level outage (not a request/content problem)?
 * Those are the only cases where retrying on another gateway can help:
 *  - WAF/HTML challenge pages (AgentRouter blocks datacenter IPs)
 *  - missing / rejected credentials on the active gateway
 *  - the gateway host being unreachable
 */
export function isAiProviderOutage(result: { ok: boolean; status: number; error?: string | null }): boolean {
  if (result.ok) return false;
  const err = String(result.error || "");
  if (err.includes("PROVIDER_BLOCKED_NON_JSON_RESPONSE")) return true;
  if (err.endsWith("_MISSING")) return true;
  return result.status === 0 || result.status === 401 || result.status === 403;
}


/**
 * Pick a healthy alternative gateway when the active one is down/blocked.
 * Prefers OpenRouter, then any other provider whose API key secret exists.
 */
export async function getAiFailoverProvider(currentProvider: string): Promise<AiProviderConfig | null> {
  const rows = await listAiProviders().catch(() => []);
  const candidates = rows
    .filter((row) => row.provider !== currentProvider && row.has_key)
    .sort((a, b) => (a.provider === "openrouter" ? -1 : b.provider === "openrouter" ? 1 : 0));
  const pick = candidates[0];
  if (pick) {
    const apiKey = envKey(pick.api_key_env);
    if (apiKey) {
      return {
        provider: pick.provider,
        label: pick.label,
        baseUrl: normalizeBaseUrl(pick.base_url) || OPENROUTER_FALLBACK.baseUrl,
        apiKeyEnv: pick.api_key_env,
        apiKey,
        hasKey: true,
        source: "db",
      };
    }
  }
  // Last resort: env-configured OpenRouter.
  if (currentProvider !== "openrouter") {
    const apiKey = envKey("OPENROUTER_API_KEY");
    if (apiKey) return { ...OPENROUTER_FALLBACK, apiKey, hasKey: true };
  }
  return null;
}

/**
 * Low-level unified request. Returns the raw Response (so SSE streams and
 * binary audio bodies both work) plus provider/timing metadata.
 * Guards against gateways that answer 200 with a WAF/HTML challenge page,
 * and automatically fails over to a healthy gateway in that case.
 */
export async function aiFetch(opts: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  providerName?: string | null;
  timeoutMs?: number;
  expect?: "json" | "stream" | "binary";
  headers?: Record<string, string>;
  /** Diagnostics only: never fail over, test exactly one provider. */
  noFailover?: boolean;
}): Promise<AiCallResult> {
  const first = await aiFetchOnce(await resolveAiProvider(opts.providerName), opts);
  // An explicitly requested provider (diagnostics) is never silently swapped.
  if (first.ok || opts.providerName || opts.noFailover || !isAiProviderOutage(first)) return first;
  const backup = await getAiFailoverProvider(first.provider);
  if (!backup) return first;
  console.warn("[ai-provider] failover", first.provider, "->", backup.provider, String(first.error || "").slice(0, 200));
  const second = await aiFetchOnce(backup, opts);
  if (!second.ok) {
    return { ...second, error: `${first.provider}: ${String(first.error || "").slice(0, 300)} | failover ${backup.provider}: ${String(second.error || "").slice(0, 300)}` };
  }
  return second;
}

async function aiFetchOnce(provider: AiProviderConfig, opts: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  expect?: "json" | "stream" | "binary";
  headers?: Record<string, string>;
}): Promise<AiCallResult> {

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

// ============================================================================
// File API routing (Gemini File API vs. active provider)
// ----------------------------------------------------------------------------
// Large / scanned PDFs are processed with Google's **Gemini File API**
// (resumable upload + `file_uri` reference inside generateContent). That
// protocol is Google-specific: the OpenAI-compatible gateways (OpenRouter /
// AgentRouter) expose `/chat/completions`, `/embeddings`, `/audio/*` — they do
// NOT expose a resumable `/files` upload that can then be referenced by URI.
//
// So instead of hardcoding the exception, we PROBE the active provider on every
// check: if a gateway ever ships a real OpenAI-style Files endpoint, this
// returns `provider_supported: true` and the route flips automatically once the
// operator enables AI_PROVIDER_FILE_API_ENABLED=1. Until then the route stays
// `gemini_direct` and the reason is reported verbatim to the developer UI.
// ============================================================================

export type AiFileApiRoute = "provider" | "gemini_direct";

export interface AiFileApiStatus {
  provider: string;
  label: string;
  endpoint: string;
  /** Does the active gateway answer on an OpenAI-style /files endpoint? */
  provider_supported: boolean;
  probe_status: number;
  probe_error: string | null;
  probe_duration_ms: number;
  /** Resumable upload + file_uri references (what large PDFs need). */
  resumable_upload_supported: boolean;
  /** Effective route used by the library/book processing pipeline. */
  route: AiFileApiRoute;
  /** True when this service does NOT follow the active provider. */
  independent_of_active_provider: boolean;
  key_env: string;
  key_present: boolean;
  reason: string;
  reason_ar: string;
  note_ar: string;
}

const FILE_API_KEY_ENV = "GEMINI_API_KEY";
const FILE_API_CACHE_TTL_MS = 60_000;
let fileApiCache: { at: number; key: string; status: AiFileApiStatus } | null = null;

function geminiFileApiKey(): string {
  return envKey(FILE_API_KEY_ENV) || envKey("GOOGLE_API_KEY");
}

/**
 * Probe the active (or a named) provider for OpenAI-style Files support and
 * return the effective routing decision for the Gemini File API service.
 * Never throws.
 */
export async function probeAiProviderFileApi(providerName?: string | null): Promise<AiFileApiStatus> {
  const provider = await resolveAiProvider(providerName);
  const cacheKey = `${provider.provider}|${provider.baseUrl}`;
  const now = Date.now();
  if (fileApiCache && fileApiCache.key === cacheKey && now - fileApiCache.at < FILE_API_CACHE_TTL_MS) {
    return fileApiCache.status;
  }

  const probe = await aiFetch({
    path: "/files",
    method: "GET",
    providerName: providerName ?? provider.provider,
    timeoutMs: 15_000,
  });

  // A usable Files endpoint must answer 200 with an OpenAI-style list payload.
  const listed = (probe.data as any)?.data;
  const providerSupported = probe.ok && Array.isArray(listed);
  const overrideEnabled = envKey("AI_PROVIDER_FILE_API_ENABLED") === "1";
  const resumable = providerSupported && overrideEnabled;
  const route: AiFileApiRoute = resumable ? "provider" : "gemini_direct";
  const keyPresent = !!geminiFileApiKey();

  const reason = providerSupported
    ? overrideEnabled
      ? "PROVIDER_FILES_ENDPOINT_ENABLED"
      : "PROVIDER_FILES_ENDPOINT_FOUND_BUT_NOT_ENABLED"
    : probe.status === 404 || probe.status === 405
    ? "PROVIDER_HAS_NO_FILES_ENDPOINT"
    : `PROVIDER_FILES_PROBE_FAILED_${probe.status}`;

  const reasonAr = providerSupported
    ? overrideEnabled
      ? "المزوّد النشط يدعم Files API وتم تفعيله، لذلك تمر ملفات الكتب عبر المزوّد النشط."
      : "المزوّد النشط يعرض نقطة /files لكن التفعيل موقوف (AI_PROVIDER_FILE_API_ENABLED=1 لتشغيله)، لذلك ما زلنا نستخدم Gemini File API."
    : "المزوّد النشط (بوابة متوافقة مع OpenAI) لا يوفّر رفعًا قابلًا للاستئناف مع مراجع file_uri، وهو ما تحتاجه ملفات PDF الكبيرة/المصوّرة، لذلك تبقى هذه الخدمة على Gemini File API.";

  const status: AiFileApiStatus = {
    provider: provider.provider,
    label: provider.label,
    endpoint: route === "provider" ? `${provider.baseUrl}/files` : "https://generativelanguage.googleapis.com/upload/v1beta/files",
    provider_supported: providerSupported,
    probe_status: probe.status,
    probe_error: probe.error ? String(probe.error).slice(0, 400) : null,
    probe_duration_ms: probe.duration_ms,
    resumable_upload_supported: resumable,
    route,
    independent_of_active_provider: route === "gemini_direct",
    key_env: FILE_API_KEY_ENV,
    key_present: keyPresent,
    reason,
    reason_ar: reasonAr,
    note_ar: route === "gemini_direct"
      ? `خدمة رفع ملفات الكتب (Gemini File API) هي الخدمة الوحيدة المستقلة وتعتمد على ${FILE_API_KEY_ENV}${keyPresent ? " (المفتاح موجود)" : " (المفتاح غير موجود — رفع الكتب الكبيرة سيفشل)"}. أما باقي خدمات الذكاء الاصطناعي (محادثة، رؤية، OCR، Embeddings، TTS، STT، Streaming) فتعتمد على المزوّد النشط فقط.`
      : "جميع خدمات الذكاء الاصطناعي — بما فيها رفع ملفات الكتب — تمر الآن عبر المزوّد النشط.",
  };

  fileApiCache = { at: now, key: cacheKey, status };
  return status;
}

/** Effective File API route for the processing pipeline. */
export async function resolveFileApiRoute(): Promise<AiFileApiStatus> {
  return await probeAiProviderFileApi();
}
