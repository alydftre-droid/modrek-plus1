import { isNative } from "@/lib/native";

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

export async function speakText(options: SpeakOptions) {
  const { text, rate = 1, lang = "ar-SA", onStart, onEnd, onError } = options;
  const cleanText = cleanSpeechText(text);
  if (!cleanText) {
    onEnd?.();
    return;
  }

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