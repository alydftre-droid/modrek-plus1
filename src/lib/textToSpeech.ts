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
let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentPlaybackResolve: (() => void) | null = null;
let audioUnlockInstalled = false;

function ttsDebug(event: string, payload: Record<string, unknown> = {}) {
  console.info(`[TTS Debug] ${event}`, payload);
}

type WindowWithWebAudio = typeof window & { webkitAudioContext?: typeof AudioContext };

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || (window as WindowWithWebAudio).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor({ sampleRate: 24000 });
  return audioContext;
}

async function unlockAudioContext() {
  const ctx = getAudioContext();
  if (!ctx) return;
  ttsDebug("audio-context-unlock-start", { state: ctx.state, sampleRate: ctx.sampleRate });
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
  if (ctx.state !== "running") return;

  const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  try { source.start(0); } catch { /* already unlocked */ }
  ttsDebug("audio-context-unlock-done", { state: ctx.state });
}

function installAudioUnlockListeners() {
  if (audioUnlockInstalled || typeof window === "undefined" || typeof document === "undefined") return;
  audioUnlockInstalled = true;
  const unlock = () => { void unlockAudioContext(); };
  window.addEventListener("pointerdown", unlock, { passive: true, capture: true });
  window.addEventListener("touchstart", unlock, { passive: true, capture: true });
  window.addEventListener("keydown", unlock, { passive: true, capture: true });
}

installAudioUnlockListeners();

function stopCurrentOpenRouterPlayback() {
  if (currentSource) {
    try { currentSource.stop(); } catch { /* ignore */ }
    currentSource.disconnect();
    currentSource = null;
  }
  if (currentPlaybackResolve) {
    const resolve = currentPlaybackResolve;
    currentPlaybackResolve = null;
    resolve();
  }
}

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
  nativeSpeakToken += 1;

  stopCurrentOpenRouterPlayback();

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

  // مهم: لا نستخدم Web Speech API أو Capacitor TTS نهائياً للتحدث.
  // نلغي فقط أي صوت قديم كان عالقاً من إصدارات سابقة حتى لا يظهر صوت Google المجاني.
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

async function playOpenRouterAudio(result: Awaited<ReturnType<typeof synthesizeSpeech>>): Promise<void> {
  const ctx = getAudioContext();
  ttsDebug("playback-start", {
    contentType: result.contentType,
    blobType: result.audioBlob.type,
    blobSize: result.audioBlob.size,
    cache: result.cache,
    provider: result.provider,
    model: result.model,
    remoteAudioUrl: result.audioUrlRemote,
  });
  if (!ctx) {
    const audio = new Audio(result.audioUrl);
    currentAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        ttsDebug("html-audio-ended");
        resolve();
      };
      audio.onerror = () => {
        const mediaError = audio.error ? { code: audio.error.code, message: audio.error.message } : null;
        console.error("[TTS Debug] html-audio-error", { mediaError, networkState: audio.networkState, readyState: audio.readyState });
        reject(new Error(`audio_playback_failed:${JSON.stringify(mediaError)}`));
      };
      audio.play().catch((error) => {
        console.error("[TTS Debug] html-audio-play-rejected", error);
        reject(error);
      });
    });
    if (currentAudio === audio) currentAudio = null;
    return;
  }

  await unlockAudioContext();
  if (ctx.state === "suspended") {
    throw new Error("audio_context_locked");
  }

  const bytes = await result.audioBlob.arrayBuffer();
  ttsDebug("decode-start", { byteLength: bytes.byteLength, audioContextState: ctx.state, sampleRate: ctx.sampleRate });
  const decoded = await ctx.decodeAudioData(bytes.slice(0)).catch((error) => {
    console.error("[TTS Debug] decode-error", { error, contentType: result.contentType, blobType: result.audioBlob.type, blobSize: result.audioBlob.size });
    throw error;
  });
  ttsDebug("decode-done", { duration: decoded.duration, sampleRate: decoded.sampleRate, channels: decoded.numberOfChannels });
  await new Promise<void>((resolve, reject) => {
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    currentSource = source;
    currentPlaybackResolve = resolve;
    source.onended = () => {
      if (currentSource === source) currentSource = null;
      if (currentPlaybackResolve === resolve) currentPlaybackResolve = null;
      ttsDebug("webaudio-ended", { duration: decoded.duration });
      resolve();
    };
    try {
      source.start(0);
      ttsDebug("webaudio-source-started", { contextTime: ctx.currentTime });
    } catch (error) {
      if (currentSource === source) currentSource = null;
      if (currentPlaybackResolve === resolve) currentPlaybackResolve = null;
      reject(error);
    }
  });
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
  ttsDebug("speak-run-start", { runToken, chunks: chunks.length, textLength: cleanText.length, rate, context });
  if (chunks.length === 0) {
    onEnd?.();
    return;
  }

  let started = false;
  for (let i = 0; i < chunks.length; i++) {
    if (runToken !== nativeSpeakToken) return;
    const chunk = chunks[i];
    ttsDebug("chunk-request-start", { runToken, chunkIndex: i + 1, totalChunks: chunks.length, chunkLength: chunk.length });
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
    ttsDebug("chunk-response-ready", { runToken, chunkIndex: i + 1, cache: result.cache, contentType: result.contentType, blobSize: result.audioBlob.size });
    if (runToken !== nativeSpeakToken) {
      result.revoke();
      return;
    }
    currentRevoke = result.revoke;

    if (!started) {
      started = true;
      onStart?.();
    }

    await playOpenRouterAudio(result);

    try { result.revoke(); } catch { /* ignore */ }
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
    if (error instanceof Error) {
      console.error("[TTS Debug] failure-stack", { name: error.name, message: error.message, stack: error.stack });
    }
    throw error;
  }
}
