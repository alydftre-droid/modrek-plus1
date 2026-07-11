// Client helper for OpenRouter-powered TTS via the `openrouter-tts` edge
// function. Returns an object URL suitable for an <audio src=""> element or
// programmatic playback via `new Audio(url).play()`. The caller is
// responsible for revoking the URL (URL.revokeObjectURL) when done.
//
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON } from "@/lib/aiStream";

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

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
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

  const url = `${SUPABASE_URL}/functions/v1/openrouter-tts`;
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
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: "[REDACTED_PUBLISHABLE_KEY]",
      Authorization: "Bearer [REDACTED_JWT]",
    },
    body: { ...body, text_length: opts.text.length, instructions_length: opts.instructions?.length ?? 0 },
  });

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err; // caller cancelled — let it propagate
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);
    const online = typeof navigator !== "undefined" ? navigator.onLine : null;
    console.error("[TTS Debug] frontend-fetch-network-error", { requestId, name, message: msg, online, url });
    throw new OpenRouterTtsError(
      isLikelyOfflineNetworkError(err)
        ? `تعذر وصول المتصفح إلى خدمة الصوت. تحقق من الاتصال أو أعد فتح التطبيق ثم حاول مرة أخرى. السبب التقني: ${msg}`
        : `تعذر الاتصال بخدمة الصوت (شبكة): ${msg}`,
      0,
      { requestId, network: true, name, message: msg, online, url },
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
