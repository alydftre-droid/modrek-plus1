import { supabase } from "@/integrations/supabase/client";

export type TeacherProfileUploadKind = "photo" | "video" | "cover";

export interface TeacherVideoUploadProgress {
  loaded: number;
  total: number;
  percent: number;
  currentPart: number;
  totalParts: number;
  partPercent: number;
  phase: "preparing" | "uploading" | "finalizing";
}


const getSafeExtension = (fileName: string, fallback: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || fallback;
};

export const imageFileToJpeg = async (file: File): Promise<File> => {
  if (typeof window === "undefined" || !file.type.startsWith("image/") || file.type === "image/jpeg") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const getUploadContentType = (file: File, kind: TeacherProfileUploadKind) => {
  if (kind === "photo" || kind === "cover") return file.type.startsWith("image/") ? file.type : "image/jpeg";
  const ext = getSafeExtension(file.name, "mp4");
  if (ext === "webm") return "video/webm";
  if (ext === "mov" || ext === "m4v") return "video/mp4";
  return file.type && file.type !== "application/octet-stream" ? file.type : "video/mp4";
};

const buildPath = (file: File, userId: string, kind: TeacherProfileUploadKind) => {
  if (kind === "photo" || kind === "cover") {
    const prefix = kind === "photo" ? "photo" : "cover";
    return `${userId}/${prefix}-${Date.now()}.jpg`;
  }
  const ext = getSafeExtension(file.name, "mp4");
  return `${userId}/intro-${Date.now()}.${ext}`;
};

const uploadTeacherIntroToStream = async (
  file: File,
  userId: string,
  onProgress?: (loaded: number, total: number) => void,
  onVideoProgress?: (progress: TeacherVideoUploadProgress) => void,
) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const backendUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!token || !backendUrl || !publishableKey) throw new Error("no-session");

  onVideoProgress?.({ loaded: 0, total: file.size, percent: 0, currentPart: 1, totalParts: 1, partPercent: 0, phase: "preparing" });
  const createResponse = await fetch(`${backendUrl}/functions/v1/bunny-stream?action=create-video`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: `teacher-intro-${userId}-${Date.now()}` }),
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !created?.videoId || !created?.tusEndpoint) {
    throw new Error(created?.error || `فشل إنشاء فيديو السيرة (${createResponse.status})`);
  }

  const { Upload } = await import("tus-js-client");
  try {
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: String(created.tusEndpoint),
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 5 * 1024 * 1024,
        removeFingerprintOnSuccess: true,
        fingerprint: async () => `teacher-intro-stream-${created.videoId}-${file.name}-${file.size}-${file.lastModified}`,
        metadata: { filetype: file.type || "video/mp4", title: `teacher-intro-${userId}` },
        headers: {
          AuthorizationSignature: String(created.signature),
          AuthorizationExpire: String(created.expirationTime),
          VideoId: String(created.videoId),
          LibraryId: String(created.libraryId),
        },
        onError: reject,
        onProgress: (loaded, total) => {
          const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
          onProgress?.(loaded, total);
          onVideoProgress?.({ loaded, total, percent, currentPart: 1, totalParts: 1, partPercent: percent, phase: "uploading" });
        },
        onSuccess: () => resolve(),
      });
      upload.findPreviousUploads()
        .then((previous) => {
          if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        })
        .catch(reject);
    });
  } catch (error) {
    void fetch(`${backendUrl}/functions/v1/bunny-stream?action=delete-video`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: created.videoId }),
    }).catch(() => undefined);
    throw error;
  }

  onVideoProgress?.({ loaded: file.size, total: file.size, percent: 100, currentPart: 1, totalParts: 1, partPercent: 100, phase: "finalizing" });
  return `bunny://${created.videoId}`;
};


export const getTeacherProfileUploadErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/bucket not found/i.test(message)) return "مخزن ملفات السيرة غير موجود أو غير مفعّل";
  if (/row-level security|unauthorized|not authorized/i.test(message)) return "لا توجد صلاحية رفع لهذا الحساب، يرجى تسجيل الدخول مرة أخرى";
  if (/payload too large|exceeds \d+mb|exceeded the maximum|maximum allowed size/i.test(message)) {
    return "حجم الملف أكبر من الحد المسموح (100 ميجابايت)";
  }
  return fallback;
};

// Legacy Supabase Storage upload helpers were removed: every profile photo and
// intro video now goes to Bunny (Storage / Stream) through @/lib/storage.


export const uploadTeacherProfileFile = async (
  file: File,
  userId: string,
  kind: TeacherProfileUploadKind,
  onProgress?: (loaded: number, total: number) => void,
  onVideoProgress?: (progress: TeacherVideoUploadProgress) => void,
) => {
  const preparedFile = kind === "video" ? file : await imageFileToJpeg(file);
  const path = buildPath(preparedFile, userId, kind);
  const contentType = getUploadContentType(preparedFile, kind);

  // Intro videos belong in Bunny Stream, not raw object storage. Stream accepts
  // resumable TUS uploads, transcodes phone/desktop formats, and serves adaptive
  // HLS playback. Raw Bunny Storage was the source of the historical 404/0:00
  // failures because protected MP4 byte ranges were proxied through an old
  // backend deployment.
  if (kind === "video") {
    return await uploadTeacherIntroToStream(preparedFile, userId, onProgress, onVideoProgress);
  }


  // Profile photos live on Bunny Storage (owner-scoped path); PostgreSQL only
  // keeps the reference.
  const { uploadImage } = await import("@/lib/storage");
  const stored = await uploadImage({
    scope: { kind: "user", id: userId },
    category: "profile",
    file: preparedFile,
    fileName: path.split("/").pop() || preparedFile.name,
    onProgress: onProgress ? (loaded, total) => onProgress(loaded, total) : undefined,
  });
  return stored.url;
};