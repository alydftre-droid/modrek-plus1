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

const BUCKET = "teacher-profiles";

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

const parseUploadError = async (response: Response) => {
  const text = await response.text().catch(() => "");
  if (!text) return `HTTP ${response.status}`;
  try {
    const payload = JSON.parse(text);
    return payload?.error || payload?.message || text;
  } catch {
    return text;
  }
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

const directStorageUpload = async (file: File, path: string, contentType: string) => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType, cacheControl: "3600" });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Resumable (TUS) upload. Required for intro videos: single-request uploads are
 * capped by the storage API body limit, which is what kept rejecting files
 * larger than 50MB. TUS streams the file in 6MB chunks instead.
 */
const resumableStorageUpload = async (
  file: File,
  path: string,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!token || !supabaseUrl) throw new Error("no-session");

  const { Upload } = await import("tus-js-client");

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 6000],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "true",
      },
      // Unique per target object so a previous stalled upload can never be resumed
      // onto a different file (the bug that produced 0-byte media).
      fingerprint: async () => `teacher-profile-${path}-${file.size}`,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => onProgress?.(bytesUploaded, bytesTotal),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(() => upload.start());
  });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

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

  // Videos: go through the Bunny chunked pipeline (4MB chunks). The Supabase
  // storage API enforces a project-wide per-file body limit (50MB) that also
  // applies to resumable/TUS uploads — that limit is what kept rejecting real
  // intro videos. Bunny has no such cap and is already used for lesson videos.
  if (kind === "video") {
    const ext = getSafeExtension(preparedFile.name, "mp4");
    const bunnyPath = `content/teacher-intros/${userId}/intro-${Date.now()}.${ext}`;
    const { uploadToBunnyStorage } = await import("@/lib/bunnyStorage");
    // Keep one authoritative backend for intro videos. Falling back silently to
    // another bucket saved URLs with different access semantics and produced
    // persistent 404s after an otherwise recoverable Bunny verification delay.
    return await uploadToBunnyStorage(preparedFile, bunnyPath, onProgress, undefined, undefined, onVideoProgress);
  }



  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  if (token && supabaseUrl && supabaseKey) {
    const form = new FormData();
    form.append("file", preparedFile);
    form.append("kind", "photo");
    form.append("path", path);
    form.append("contentType", contentType);

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/teacher-profile-upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseKey,
        },
        body: form,
      });

      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload?.publicUrl) return String(payload.publicUrl);
      }

      console.warn("teacher profile secure upload failed", await parseUploadError(response));
    } catch (error) {
      console.warn("teacher profile secure upload request failed", error);
    }
  }

  try {
    return await directStorageUpload(preparedFile, path, contentType);
  } catch (error) {
    console.error("teacher profile direct storage upload failed", error);
    throw error;
  }
};