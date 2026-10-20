// Teacher-side recording of a live class.
// The Zoom host account is on the free plan (no cloud recording), so the
// teacher's browser records its own camera + microphone while the class runs.
// When the class ends the file is uploaded to Bunny and listed under the
// group's recorded classes for students.
import { supabase } from "@/integrations/supabase/client";

type ActiveRecording = {
  sessionId: string;
  groupId: string;
  teacherId: string;
  title: string;
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  mimeType: string;
  startedAt: number;
};

let active: ActiveRecording | null = null;
let starting = false;

function pickMimeType(withVideo: boolean): string {
  const candidates = withVideo
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

export function isLiveRecordingActive(sessionId?: string) {
  return Boolean(active && (!sessionId || active.sessionId === sessionId));
}

export async function startLiveRecording(input: {
  sessionId: string;
  groupId: string;
  teacherId: string;
  title: string;
}): Promise<boolean> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  if (active?.sessionId === input.sessionId || starting) return Boolean(active);
  starting = true;
  try {
    let stream: MediaStream | null = null;
    let withVideo = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { facingMode: "user", width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
      });
    } catch {
      withVideo = false;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    }
    if (!stream) return false;
    const mimeType = pickMimeType(withVideo);
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 450_000,
      audioBitsPerSecond: 64_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(10_000);
    active = {
      ...input,
      recorder,
      stream,
      chunks,
      mimeType: recorder.mimeType || mimeType || (withVideo ? "video/webm" : "audio/webm"),
      startedAt: Date.now(),
    };
    return true;
  } catch (error) {
    console.warn("[liveRecorder] start failed", error);
    return false;
  } finally {
    starting = false;
  }
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Stops the recording and uploads it as a recorded class. */
export async function stopAndSaveLiveRecording(
  onProgress?: (percent: number) => void,
): Promise<{ saved: boolean; reason?: string }> {
  const current = active;
  if (!current) return { saved: false, reason: "no_recording" };
  active = null;

  await new Promise<void>((resolve) => {
    if (current.recorder.state === "inactive") return resolve();
    current.recorder.addEventListener("stop", () => resolve(), { once: true });
    try {
      current.recorder.stop();
    } catch {
      resolve();
    }
  });
  current.stream.getTracks().forEach((track) => track.stop());

  const durationMs = Date.now() - current.startedAt;
  if (!current.chunks.length || durationMs < 5_000) return { saved: false, reason: "too_short" };

  const blob = new Blob(current.chunks, { type: current.mimeType.split(";")[0] });
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const { uploadVideo } = await import("@/lib/storage");
  const stored = await uploadVideo({
    scope: { kind: "user", id: current.teacherId },
    category: "live-recordings",
    file: new File([blob], `${current.sessionId}_${Date.now()}.${ext}`, { type: blob.type }),
    fileName: `${current.sessionId}_${Date.now()}.${ext}`,
    onProgress: (loaded, total) => onProgress?.(Math.round((loaded / Math.max(total, 1)) * 100)),
  });

  const { error } = await supabase.from("live_session_recordings" as any).insert({
    session_id: current.sessionId,
    group_id: current.groupId,
    teacher_id: current.teacherId,
    title: `تسجيل - ${current.title}`,
    video_url: stored.url,
    duration: formatDuration(durationMs),
  });
  if (error) throw error;
  return { saved: true };
}
