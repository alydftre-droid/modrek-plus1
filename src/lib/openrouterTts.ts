// Client helper for OpenRouter-powered TTS via the `openrouter-tts` edge
// function. Returns an object URL suitable for an <audio src=""> element or
// programmatic playback via `new Audio(url).play()`. The caller is
// responsible for revoking the URL (URL.revokeObjectURL) when done.
//
// This is additive — no existing feature depends on it. The current
// `textToSpeech.ts` (Web Speech + Capacitor native) remains unchanged and
// is used automatically as a graceful fallback if this helper throws.
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON } from "@/lib/aiStream";

export type OpenRouterTtsOptions = {
  text: string;
  voice?: string;
  format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
  instructions?: string;
  speed?: number;
  signal?: AbortSignal;
};

export type OpenRouterTtsResult = {
  audioUrl: string;
  contentType: string;
  provider: string | null;
  model: string | null;
  revoke: () => void;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) return data.session.access_token;
  await supabase.auth.refreshSession().catch(() => undefined);
  const { data: refreshed } = await supabase.auth.getSession();
  return refreshed?.session?.access_token ?? null;
}

export async function synthesizeSpeech(opts: OpenRouterTtsOptions): Promise<OpenRouterTtsResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error("إعدادات الاتصال غير متاحة");
  }
  const token = await getAccessToken();
  if (!token) throw new Error("جلسة غير صالحة، سجّل الدخول من جديد");

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/openrouter-tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      text: opts.text,
      voice: opts.voice,
      format: opts.format,
      instructions: opts.instructions,
      speed: opts.speed,
    }),
    signal: opts.signal,
  });

  if (!resp.ok) {
    let message = `الخدمة غير متاحة (${resp.status})`;
    try {
      const j = await resp.json();
      if (j?.error) message = String(j.error);
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const contentType = resp.headers.get("Content-Type") || "audio/mpeg";
  const blob = await resp.blob();
  const audioUrl = URL.createObjectURL(blob);
  return {
    audioUrl,
    contentType,
    provider: resp.headers.get("X-Provider"),
    model: resp.headers.get("X-Model"),
    revoke: () => URL.revokeObjectURL(audioUrl),
  };
}
