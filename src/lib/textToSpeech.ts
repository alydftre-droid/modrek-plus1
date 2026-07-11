import { isNative } from "@/lib/native";
import { synthesizeSpeech } from "@/lib/openrouterTts";

type SpeakOptions = {
  text: string;
  rate?: number;
  lang?: string;
  subjectId?: string | null;
  stage?: string | null;
  grade?: string | null;
  section?: string | null;
  lesson?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error?: unknown) => void;
};

let nativeSpeakToken = 0;
let currentAudio: HTMLAudioElement | null = null;
let currentRevoke: (() => void) | null = null;
let currentAbortController: AbortController | null = null;

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

  if (currentAbortController) {
    try { currentAbortController.abort(); } catch { /* ignore */ }
    currentAbortController = null;
  }

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

  // مهم: لا نستخدم Web Speech API نهائياً حتى لا يعود صوت متصفح Google القديم.
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

async function speakWithOpenRouter(
  cleanText: string,
  rate: number,
  context: Pick<SpeakOptions, "subjectId" | "stage" | "grade" | "section" | "lesson">,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  const runToken = ++nativeSpeakToken;
  const chunks = splitArabicSpeechChunks(cleanText, 1200);
  if (chunks.length === 0) {
    onEnd?.();
    return;
  }

  let started = false;
  for (let i = 0; i < chunks.length; i++) {
    if (runToken !== nativeSpeakToken) return;
    const chunk = chunks[i];
    currentAbortController = new AbortController();
    const result = await synthesizeSpeech({
      text: chunk,
      speed: Math.max(0.75, Math.min(1.05, rate || 0.92)),
      format: "wav",
      voice: "Charon",
      instructions: "لهجة مصرية طبيعية، معلم مصري رجولي دافئ وواضح، وقفات طبيعية، نبرة غير رتيبة، شرح مفهوم وليس قراءة آلية.",
      subjectId: context.subjectId,
      stage: context.stage,
      grade: context.grade,
      section: context.section,
      lesson: context.lesson,
      signal: currentAbortController.signal,
    });
    currentAbortController = null;
    if (runToken !== nativeSpeakToken) {
      result.revoke();
      return;
    }
    const audio = new Audio(result.audioUrl);
    audio.playbackRate = 1;
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

    try { result.revoke(); } catch { /* ignore */ }
    if (currentAudio === audio) currentAudio = null;
    if (currentRevoke === result.revoke) currentRevoke = null;
  }

  if (runToken === nativeSpeakToken) onEnd?.();
}

export async function speakText(options: SpeakOptions) {
  const { text, rate = 0.92, onStart, onEnd, onError } = options;
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    onEnd?.();
    return;
  }

  try {
    await speakWithOpenRouter(
      cleanText,
      rate,
      {
        subjectId: options.subjectId,
        stage: options.stage,
        grade: options.grade,
        section: options.section,
        lesson: options.lesson,
      },
      onStart,
      onEnd,
    );
  } catch (error) {
    onError?.(error);
    console.error("[TTS] OpenRouter-only speech failed:", error);
    throw error;
  }
}
