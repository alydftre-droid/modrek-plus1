// Client helper for the voice-answer edge function (library-first Q&A +
// cached TTS). Returns both the answer text and a playable audio URL.
// The URL points to Bunny CDN when generated, or the cached WAV when a
// previous student already asked the same/similar question.

import { supabase } from "@/integrations/supabase/client";

export interface VoiceAnswerRequest {
  question: string;
  subjectId?: string | null;
  subjectName?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
  lesson?: string | null;
  voice?: string;
  forceRegen?: boolean;
}

export interface VoiceAnswerResult {
  cached: boolean;
  match: "exact" | "similar" | "generated";
  similarity?: number;
  answer_text: string;
  audio_url: string;
  source: "library" | "general";
  voice?: string;
  model?: string;
  chat_provider?: string;
  chat_model?: string;
  citations?: unknown;
  id?: string | null;
}

export async function askVoiceAnswer(req: VoiceAnswerRequest): Promise<VoiceAnswerResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("جلسة غير صالحة — يرجى تسجيل الدخول");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-answer`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    },
    body: JSON.stringify({
      question: req.question,
      subject_id: req.subjectId ?? null,
      subject_name: req.subjectName ?? null,
      stage: req.stage ?? null,
      grade: req.grade ?? null,
      section: req.section ?? null,
      lesson: req.lesson ?? null,
      voice: req.voice ?? "Charon",
      force_regen: req.forceRegen === true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `فشل الطلب (${res.status})`);
  }
  return json as VoiceAnswerResult;
}
