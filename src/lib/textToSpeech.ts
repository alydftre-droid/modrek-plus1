import { isNative } from "@/lib/native";
import { synthesizeSpeech } from "@/lib/openrouterTts";

type SpeakOptions = {
  text: string;
  rate?: number;
  lang?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error?: unknown) => void;
};

let nativeSpeaking = false;
let nativeSpeakToken = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentRevoke: (() => void) | null = null;
let openRouterDisabled = false; // set true after unrecoverable errors (auth/quota)

function cleanSpeechText(text: string) {
  return text
    .replace(/[#*_`>~|[\](){}]/g, " ")
    .replace(/[-–—]{2,}/g, " ")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitArabicSpeechChunks(text: string, chunkSize = 220): string[] {
  const cleanText = cleanSpeechText(text);
  if (!cleanText) return [];

  const sentences = cleanText
    .split(/(?<=[.!?،؟!。])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const sentence of sentences) {
    if (sentence.length <= chunkSize) {
      chunks.push(sentence);
      continue;
    }

    const parts = sentence.split(/(?<=[،,:؛])\s+/).filter(Boolean);
    if (parts.length > 1) {
      let buffer = "";
      for (const part of parts) {
        const candidate = buffer ? `${buffer} ${part}` : part;
        if (candidate.length <= chunkSize) {
          buffer = candidate;
        } else {
          if (buffer) chunks.push(buffer.trim());
          buffer = part;
        }
      }
      if (buffer) chunks.push(buffer.trim());
      continue;
    }

    let remaining = sentence;
    while (remaining.length > chunkSize) {
      const breakAt = remaining.lastIndexOf(" ", chunkSize);
      const safeBreak = breakAt > 30 ? breakAt : chunkSize;
      chunks.push(remaining.slice(0, safeBreak).trim());
      remaining = remaining.slice(safeBreak).trim();
    }
    if (remaining) chunks.push(remaining.trim());
  }

  return chunks.filter(Boolean);
}

export async function stopTextToSpeech() {
  const native = await isNative();
  nativeSpeakToken += 1;
  nativeSpeaking = false;

  // Stop OpenRouter-based audio playback if any
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentRevoke) {
    try { currentRevoke(); } catch { /* ignore */ }
    currentRevoke = null;
  }

  if (native) {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.stop();
      return;
    } catch {
      // fall back to web API
    }
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

async function speakWithOpenRouter(
  cleanText: string,
  rate: number,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  if (openRouterDisabled) return false;
  try {
    // Split long text so each request stays within the TTS input cap
    const chunks = splitArabicSpeechChunks(cleanText, 900);
    if (chunks.length === 0) return false;

    let started = false;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await synthesizeSpeech({
        text: chunk,
        speed: rate,
        format: "wav",
      });
      const audio = new Audio(result.audioUrl);
      audio.playbackRate = rate;
      currentAudio = audio;
      currentRevoke = result.revoke;

      if (!started) {
        started = true;
        onStart?.();
      }

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("audio_playback_failed"));
        audio.play().catch(reject);
      });

      // Clean up this chunk before the next
      try { result.revoke(); } catch { /* ignore */ }
      if (currentAudio === audio) currentAudio = null;
      if (currentRevoke === result.revoke) currentRevoke = null;
    }

    onEnd?.();
    return true;
  } catch (error) {
    const msg = String((error as Error)?.message || error);
    // Auth / quota / config errors → don't retry per-utterance
    if (/جلسة|401|402|403|503|OPENROUTER/i.test(msg)) {
      openRouterDisabled = true;
    }
    console.warn("[TTS] OpenRouter failed, falling back:", msg);
    return false;
  }
}

export async function speakText(options: SpeakOptions) {
  const { text, rate = 1, lang = "ar-SA", onStart, onEnd, onError } = options;
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    onEnd?.();
    return;
  }

  // 1. Try OpenRouter (Gemini TTS via unified provider) first on both web and native
  const ok = await speakWithOpenRouter(cleanText, rate, onStart, onEnd);
  if (ok) return;

  // 2. Fallback: native Capacitor TTS
  const native = await isNative();
  if (native) {
    const runToken = ++nativeSpeakToken;
    nativeSpeaking = true;
    onStart?.();

    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      const chunks = splitArabicSpeechChunks(cleanText, 260);

      for (const chunk of chunks) {
        if (!nativeSpeaking || runToken !== nativeSpeakToken) return;
        await TextToSpeech.speak({
          text: chunk,
          lang,
          rate,
          pitch: 1,
          volume: 1,
        });
      }

      if (runToken === nativeSpeakToken) {
        nativeSpeaking = false;
        onEnd?.();
      }
      return;
    } catch (error) {
      nativeSpeaking = false;
      onError?.(error);
      throw error;
    }
  }

  // 3. Final fallback: Web Speech API
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onError?.(new Error("speech_unsupported"));
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = (event) => onError?.(event);
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    onError?.(error);
    throw error;
  }
}
