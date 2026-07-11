// Client helper for OpenRouter-powered TTS via the `openrouter-tts` edge
// function. Returns an object URL suitable for an <audio src=""> element or
// programmatic playback via `new Audio(url).play()`. The caller is
// responsible for revoking the URL (URL.revokeObjectURL) when done.
//
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON } from "@/lib/aiStream";
import { Capacitor, CapacitorHttp, type HttpResponse } from "@capacitor/core";

export type OpenRouterTtsOptions = {
  text: string;
  voice?: string;
  format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  instructions?: string;
  speed?: number;
  subjectId?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
  lesson?: string | null;
  signal?: AbortSignal;
};

export type OpenRouterTtsResult = {
  audioUrl: string;
  audioBlob: Blob;
  contentType: string;
  provider: string | null;
  model: string | null;
  cache: string | null;
  audioUrlRemote: string | null;
  durationSeconds: number | null;
  quality: string | null;
  revoke: () => void;
};

export class OpenRouterTtsError extends Error {
  status?: number;
  detail?: unknown;
  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "OpenRouterTtsError";
    this.status = status;
    this.detail = detail;
  }
}

const TTS_FUNCTION_NAME = "openrouter-tts";
// Voice is served from the managed backend where `openrouter-tts` is actually
// deployed and verified. Some production/native bundles point at an external
// data backend that currently returns gateway 404 for this function, so trying
// it first causes the repeated Failed to fetch / 404 loop the user reported.
// Keep that project as a secondary fallback only; the working voice backend is
// the primary endpoint for TTS.
const CLOUD_TTS_FALLBACK_BASE_URL = "https://qohhrliaecdtaeyfhcvb.supabase.co";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
}

function objectToHeaders(input: Record<string, string> | undefined): Headers {
  const headers = new Headers();
  Object.entries(input || {}).forEach(([key, value]) => {
    if (typeof value !== "undefined" && value !== null) headers.append(key, String(value));
  });
  return headers;
}

function getHeader(headers: Record<string, string> | undefined, name: string) {
  const lower = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === lower);
  return entry?.[1] ?? null;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType || "audio/wav" });
}

function nativeHttpResponseToFetchResponse(nativeResp: HttpResponse): Response {
  const headers = objectToHeaders(nativeResp.headers);
  const contentType = getHeader(nativeResp.headers, "content-type") || "audio/wav";
  const data = nativeResp.data;

  if (data instanceof Blob) {
    return new Response(data, { status: nativeResp.status, headers });
  }
  if (data instanceof ArrayBuffer) {
    return new Response(data, { status: nativeResp.status, headers });
  }
  if (typeof data === "string") {
    const body = contentType.includes("audio") || contentType.includes("octet-stream")
      ? base64ToBlob(data, contentType)
      : data;
    return new Response(body, { status: nativeResp.status, headers });
  }
  return new Response(JSON.stringify(data ?? {}), {
    status: nativeResp.status,
    headers: headers.has("Content-Type") ? headers : { ...headersToObject(headers), "Content-Type": "application/json" },
  });
}

function ttsDebug(event: string, payload: Record<string, unknown>) {
  // Always safe: JWT and API keys are redacted before logging.
  console.info(`[TTS Debug] ${event}`, payload);
}

function isLikelyOfflineNetworkError(err: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|تعذر/i.test(msg);
}

async function isRetryableGatewayResponse(resp: Response) {
  if (resp.status !== 404) return false;
  const text = await resp.clone().text().catch(() => "");
  return /function.*not.*found|requested function|not found|<!doctype html|<html/i.test(text);
}

function buildTtsEndpoints() {
  const endpoints: Array<{ label: string; url: string }> = [];
  const primaryBaseUrl = SUPABASE_URL.replace(/\/+$/, "");
  const primaryUrl = `${primaryBaseUrl}/functions/v1/${TTS_FUNCTION_NAME}`;
  const fallbackUrl = `${CLOUD_TTS_FALLBACK_BASE_URL}/functions/v1/${TTS_FUNCTION_NAME}`;

  endpoints.push({ label: "cloud-fallback", url: fallbackUrl });
  if (primaryUrl !== fallbackUrl) endpoints.push({ label: "primary", url: primaryUrl });

  return endpoints;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) return data.session.access_token;
  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: refreshed } = await supabase.auth.getSession();
  return refreshed?.session?.access_token ?? null;
}

export async function synthesizeSpeech(opts: OpenRouterTtsOptions): Promise<OpenRouterTtsResult> {
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const started = now();
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new OpenRouterTtsError("إعدادات الاتصال غير متاحة");
  }
  const token = await getAccessToken();
  if (!token) throw new OpenRouterTtsError("جلسة غير صالحة، سجّل الدخول من جديد", 401);

  const endpoints = buildTtsEndpoints();
  const body = {
    text: opts.text,
    voice: opts.voice,
    format: opts.format,
    instructions: opts.instructions,
    speed: opts.speed,
    subject_id: opts.subjectId ?? null,
    stage: opts.stage ?? null,
    grade: opts.grade ?? null,
    section: opts.section ?? null,
    lesson: opts.lesson ?? null,
  };

  ttsDebug("frontend-request", {
    requestId,
    endpoint: endpoints[0]?.label,
    endpointCount: endpoints.length,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: "[REDACTED_PUBLISHABLE_KEY]",
      Authorization: "Bearer [REDACTED_JWT]",
    },
    body: { ...body, text_length: opts.text.length, instructions_length: opts.instructions?.length ?? 0 },
  });

  let resp: Response;
  const networkErrors: Array<{ endpoint: string; transport: string; name: string; message: string }> = [];

  const postWithFetch = async (endpoint: { label: string; url: string }, transport: string, init: RequestInit) => {
    ttsDebug("frontend-transport-start", { requestId, endpoint: endpoint.label, transport });
    const response = await fetch(endpoint.url, init);
    if (await isRetryableGatewayResponse(response)) {
      throw new TypeError(`${transport}: retryable gateway 404`);
    }
    return response;
  };

  const postWithXhr = async (endpoint: { label: string; url: string }) => new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint.url, true);
    xhr.responseType = "blob";
    xhr.timeout = 140_000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("apikey", SUPABASE_ANON);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    const onAbort = () => { try { xhr.abort(); } catch { /* ignore */ } };
    if (opts.signal) {
      if (opts.signal.aborted) { onAbort(); reject(new DOMException("Aborted", "AbortError")); return; }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.onerror = () => reject(new TypeError("Failed to fetch (XHR network error)"));
    xhr.ontimeout = () => reject(new TypeError("Failed to fetch (XHR timeout)"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    xhr.onload = async () => {
      const rawHeaders = xhr.getAllResponseHeaders();
      const headers = new Headers();
      rawHeaders.trim().split(/[\r\n]+/).forEach((line) => {
        const idx = line.indexOf(":");
        if (idx > 0) headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
      });
      const response = new Response(xhr.response, { status: xhr.status, statusText: xhr.statusText, headers });
      if (await isRetryableGatewayResponse(response)) {
        reject(new TypeError("xhr-json: retryable gateway 404"));
        return;
      }
      resolve(response);
    };
    xhr.send(JSON.stringify(body));
  });

  try {
    let lastError: unknown = null;
    endpointLoop:
    for (const endpoint of endpoints) {
      const transports: Array<{ name: string; run: () => Promise<Response> }> = [];

      if (Capacitor.isNativePlatform()) {
        transports.push({
          name: "native-http-json",
          run: async () => {
            const nativeResp = await CapacitorHttp.request({
              method: "POST",
              url: endpoint.url,
              headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON,
                Authorization: `Bearer ${token}`,
              },
              data: body,
              responseType: "arraybuffer",
              connectTimeout: 25_000,
              readTimeout: 140_000,
            });
            const response = nativeHttpResponseToFetchResponse(nativeResp);
            if (await isRetryableGatewayResponse(response)) throw new TypeError("native-http-json: retryable gateway 404");
            return response;
          },
        });
      }

      transports.push(
        {
          name: "fetch-json",
          run: () => postWithFetch(endpoint, "fetch-json", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: opts.signal,
            cache: "no-store",
          }),
        },
        { name: "xhr-json", run: () => postWithXhr(endpoint) },
        {
          name: "fetch-simple-text",
          run: () => postWithFetch(endpoint, "fetch-simple-text", {
            method: "POST",
            // No custom auth/apikey headers here: this is a CORS-simple fallback
            // for mobile WebViews/browsers that fail before preflight reaches the edge.
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify({ ...body, access_token: token }),
            signal: opts.signal,
            cache: "no-store",
          }),
        },
      );

      for (const transport of transports) {
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        try {
          resp = await transport.run();
          ttsDebug("frontend-transport-success", { requestId, endpoint: endpoint.label, transport: transport.name, status: resp.status });
          lastError = null;
          break endpointLoop;
        } catch (err) {
          if (opts.signal?.aborted) throw err;
          const name = err instanceof Error ? err.name : "Error";
          const message = err instanceof Error ? err.message : String(err);
          networkErrors.push({ endpoint: endpoint.label, transport: transport.name, name, message });
          console.warn("[TTS Debug] frontend-transport-failed", { requestId, endpoint: endpoint.label, transport: transport.name, name, message });
          lastError = err;
        }
      }
    }
    if (!resp!) throw lastError || new TypeError("All TTS transports failed");
  } catch (err) {
    if (opts.signal?.aborted) throw err; // caller cancelled — let it propagate
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    const online = typeof navigator !== "undefined" ? navigator.onLine : null;
    console.error("[TTS Debug] frontend-fetch-network-error", { requestId, name, message: msg, online, endpointCount: endpoints.length, transports: networkErrors });
    const attempted = networkErrors.map((e) => `${e.endpoint}/${e.transport}: ${e.message}`).join(" | ");
    throw new OpenRouterTtsError(
      isLikelyOfflineNetworkError(err)
        ? `تعذر وصول المتصفح إلى خدمة الصوت. تحقق من الاتصال أو أعد فتح التطبيق ثم حاول مرة أخرى. السبب التقني: ${attempted || msg}`
        : `تعذر الاتصال بخدمة الصوت (شبكة): ${attempted || msg}`,
      0,
      { requestId, network: true, name, message: msg, online, endpointCount: endpoints.length, transports: networkErrors },
    );
  }


  const responseHeaders = headersToObject(resp.headers);
  ttsDebug("frontend-response", {
    requestId,
    status: resp.status,
    ok: resp.ok,
    durationMs: Math.round(now() - started),
    headers: responseHeaders,
  });

  if (!resp.ok) {
    let message = `الخدمة غير متاحة (${resp.status})`;
    let detail: unknown = null;
    const raw = await resp.text().catch(() => "");
    try {
      const j = raw ? JSON.parse(raw) : null;
      detail = j;
      if (j?.error) message = String(j.error);
    } catch {
      detail = raw;
    }
    console.error("[TTS Debug] frontend-error-response", {
      requestId,
      status: resp.status,
      message,
      responseBody: detail,
      responseHeaders,
    });
    throw new OpenRouterTtsError(message, resp.status, detail);
  }

  const contentType = resp.headers.get("Content-Type") || "audio/mpeg";
  const blob = await resp.blob();
  if (blob.size < 44) {
    throw new OpenRouterTtsError("ملف الصوت فارغ أو غير صالح", 502, { contentType, size: blob.size, responseHeaders });
  }
  const audioUrl = URL.createObjectURL(blob);
  ttsDebug("frontend-audio-blob", {
    requestId,
    contentType,
    blobType: blob.type,
    blobSize: blob.size,
    provider: resp.headers.get("X-Provider"),
    model: resp.headers.get("X-Model"),
    voice: resp.headers.get("X-Voice"),
    cache: resp.headers.get("X-Cache"),
    remoteAudioUrl: resp.headers.get("X-Audio-Url"),
    durationSeconds: resp.headers.get("X-Audio-Duration"),
  });
  return {
    audioUrl,
    audioBlob: blob,
    contentType,
    provider: resp.headers.get("X-Provider"),
    model: resp.headers.get("X-Model"),
    cache: resp.headers.get("X-Cache"),
    audioUrlRemote: resp.headers.get("X-Audio-Url"),
    durationSeconds: Number(resp.headers.get("X-Audio-Duration") || "") || null,
    quality: resp.headers.get("X-Audio-Quality"),
    revoke: () => URL.revokeObjectURL(audioUrl),
  };
}
