import { supabase } from "@/integrations/supabase/client";

export const STUDENT_LIBRARY_BUCKET = "student-library";

export function sanitizeLibraryFileName(fileName: string) {
  const parts = fileName.split(".");
  const ext = parts.length > 1 ? parts.pop() : undefined;
  const base = parts.join(".") || fileName;

  const sanitizedBase = base
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "book";

  return ext ? `${sanitizedBase}.${ext}` : sanitizedBase;
}

export function buildStudentLibraryPath(userId: string, fileName: string) {
  return `library/${userId}/${Date.now()}_${sanitizeLibraryFileName(fileName)}`;
}

export function extractStudentLibraryPath(fileRef: string) {
  if (!fileRef) return null;
  if (!fileRef.startsWith("http")) return fileRef;

  try {
    const url = new URL(fileRef);
    const markers = [
      `/storage/v1/object/sign/${STUDENT_LIBRARY_BUCKET}/`,
      `/storage/v1/object/public/${STUDENT_LIBRARY_BUCKET}/`,
      `/storage/v1/object/authenticated/${STUDENT_LIBRARY_BUCKET}/`,
    ];

    for (const marker of markers) {
      const index = url.pathname.indexOf(marker);
      if (index !== -1) {
        const rawPath = url.pathname.slice(index + marker.length);
        return decodeURIComponent(rawPath);
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function getStudentLibrarySignedUrl(fileRef: string) {
  const storagePath = extractStudentLibraryPath(fileRef);
  if (!storagePath) return fileRef;

  const { data, error } = await supabase.storage
    .from(STUDENT_LIBRARY_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (error || !data?.signedUrl) return fileRef;
  return data.signedUrl;
}
