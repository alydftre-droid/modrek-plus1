import { OpenRouterTtsError, synthesizeSpeech } from "@/lib/openrouterTts";

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
let stopGeneration = 0;

export class TextToSpeechPlaybackError extends Error {
  code: string;
  detail?: unknown;

  constructor(message: string, code: string, detail?: unknown) {
    super(message);
    this.name = "TextToSpeechPlaybackError";
    this.code = code;
    this.detail = detail;
  }
}

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

function extractDebugId(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const record = detail as Record<string, unknown>;
  if (typeof record.debug_id === "string") return record.debug_id;
  if (record.detail && typeof record.detail === "object") {
    const nested = record.detail as Record<string, unknown>;
    if (typeof nested.debug_id === "string") return nested.debug_id;
  }
  return null;
}

export function getTextToSpeechErrorMessage(error: unknown): string {
  if (error instanceof OpenRouterTtsError) {
    const debugId = extractDebugId(error.detail);
    const suffix = debugId ? ` — كود التتبع: ${debugId}` : "";
    if (error.status === 401) return `فشل تشغيل صوت OpenRouter: انتهت جلسة الدخول. سجّل الدخول من جديد${suffix}`;
    if (error.status === 402) return `فشل تشغيل صوت OpenRouter: رصيد OpenRouter غير كافٍ${suffix}`;
    if (error.status === 429) return `فشل تشغيل صوت OpenRouter: تم تجاوز الحد مؤقتاً، حاول بعد قليل${suffix}`;
    if (error.status === 503) return `فشل تشغيل صوت OpenRouter: مفتاح الخدمة غير مضبوط في Secrets${suffix}`;
    if (error.status) return `فشل تشغيل صوت OpenRouter (${error.status}): ${error.message}${suffix}`;
    return `فشل تشغيل صوت OpenRouter: ${error.message}${suffix}`;
  }

  if (error instanceof TextToSpeechPlaybackError) {
    if (error.code === "audio_unlock_required") {
      return "تم توليد صوت OpenRouter بنجاح، لكن المتصفح منع التشغيل التلقائي. اضغط زر التشغيل مرة أخرى لتفعيل الصوت.";
    }
    return `فشل تشغيل ملف صوت OpenRouter داخل المتصفح: ${error.message}`;
  }

  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "تم توليد صوت OpenRouter بنجاح، لكن المتصفح منع التشغيل التلقائي. اضغط زر التشغيل مرة أخرى لتفعيل الصوت.";
  }

  if (error instanceof Error) return `فشل تشغيل صوت OpenRouter: ${error.message}`;
  return "فشل تشغيل صوت OpenRouter بسبب خطأ غير معروف.";
}

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
  stopGeneration += 1;

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
  const playWithHtmlAudio = async (reason: string) => {
    ttsDebug("html-audio-fallback-start", { reason, contentType: result.contentType, blobSize: result.audioBlob.size });
    const audio = new Audio(result.audioUrl);
    audio.preload = "auto";
    audio.setAttribute("playsinline", "true");
    currentAudio = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        ttsDebug("html-audio-ended", { reason });
        resolve();
      };
      audio.onerror = () => {
        const mediaError = audio.error ? { code: audio.error.code, message: audio.error.message } : null;
        console.error("[TTS Debug] html-audio-error", { reason, mediaError, networkState: audio.networkState, readyState: audio.readyState });
        reject(new TextToSpeechPlaybackError(`html_audio_failed:${JSON.stringify(mediaError)}`, "html_audio_failed", mediaError));
      };
      audio.play().catch((error) => {
        console.error("[TTS Debug] html-audio-play-rejected", { reason, name: error?.name, message: error?.message });
        const code = error?.name === "NotAllowedError" ? "audio_unlock_required" : "html_audio_rejected";
        reject(new TextToSpeechPlaybackError(error?.message || "html_audio_play_rejected", code, error));
      });
    });
    if (currentAudio === audio) currentAudio = null;
  };

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
    await playWithHtmlAudio("no-audio-context");
    return;
  }

  await unlockAudioContext();
  if (ctx.state === "suspended") {
    await playWithHtmlAudio("audio-context-suspended");
    return;
  }

  const bytes = await result.audioBlob.arrayBuffer();
  ttsDebug("decode-start", { byteLength: bytes.byteLength, audioContextState: ctx.state, sampleRate: ctx.sampleRate });
  const decoded = await ctx.decodeAudioData(bytes.slice(0)).catch(async (error) => {
    console.error("[TTS Debug] decode-error", { error, contentType: result.contentType, blobType: result.audioBlob.type, blobSize: result.audioBlob.size });
    await playWithHtmlAudio("decode-error");
    return null;
  });
  if (!decoded) return;
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
      reject(new TextToSpeechPlaybackError(error instanceof Error ? error.message : String(error), "webaudio_start_failed", error));
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
  const runStopGeneration = stopGeneration;
  const chunks = splitArabicSpeechChunks(cleanText, 1200);
  ttsDebug("speak-run-start", { runToken, chunks: chunks.length, textLength: cleanText.length, rate, context });
  if (chunks.length === 0) {
    onEnd?.();
    return;
  }

  // السرعة والهوية الصوتية موحّدتان في الباك-إند (معلم Modrek Plus)؛
  // لا نرسل أي أسلوب من الواجهة حتى لا يتغير الصوت من درس لآخر.
  const speed = Math.max(0.8, Math.min(1.1, rate || 0.94));
  const controllers: AbortController[] = [];

  const fetchChunk = (index: number) => {
    const attemptController = new AbortController();
    controllers[index] = attemptController;
    currentAbortController = attemptController;
    return synthesizeSpeech({
      text: chunks[index],
      speed,
      format: "wav",
      voice: "Charon",

      subjectId: context.subjectId,
      stage: context.stage,
      grade: context.grade,
      section: context.section,
      lesson: context.lesson,
      signal: attemptController.signal,
    });
  };


  // Pipeline: keep the next chunk's fetch in flight while the current one plays,
  // so there's no network gap between chunks.
  let nextFetch: Promise<Awaited<ReturnType<typeof synthesizeSpeech>>> | null = fetchChunk(0);
  let started = false;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (runToken !== nativeSpeakToken || runStopGeneration !== stopGeneration) return;
      const currentFetch = nextFetch!;
      // Kick off the next chunk's fetch immediately so it overlaps playback.
      nextFetch = i + 1 < chunks.length ? fetchChunk(i + 1) : null;

      let result: Awaited<ReturnType<typeof synthesizeSpeech>> | null = null;
      try {
        result = await currentFetch;
      } catch (error) {
        const isAbort =
          controllers[i]?.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && /aborted|abort/i.test(error.message));
        if (isAbort || runToken !== nativeSpeakToken || runStopGeneration !== stopGeneration) {
          ttsDebug("chunk-aborted", { runToken, chunkIndex: i + 1 });
          // Abort any queued next fetch too.
          try { controllers[i + 1]?.abort(); } catch { /* ignore */ }
          return;
        }
        // Retry once for a transient failure on this chunk only.
        ttsDebug("chunk-retry", { runToken, chunkIndex: i + 1 });
        await new Promise((r) => setTimeout(r, 650));
        try { result = await fetchChunk(i); } catch (retryError) { throw retryError; }
      }
      if (!result) throw new Error("empty_tts_result");

      if (runToken !== nativeSpeakToken || runStopGeneration !== stopGeneration) {
        try { result.revoke(); } catch { /* ignore */ }
        try { controllers[i + 1]?.abort(); } catch { /* ignore */ }
        return;
      }
      currentRevoke = result.revoke;

      if (!started) {
        started = true;
        onStart?.();
      }

      ttsDebug("chunk-play-start", { runToken, chunkIndex: i + 1, totalChunks: chunks.length, cache: result.cache });
      await playOpenRouterAudio(result);

      try { result.revoke(); } catch { /* ignore */ }
      if (currentRevoke === result.revoke) currentRevoke = null;
    }
  } finally {
    // Nothing to clean up beyond what per-iteration already handles.
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
