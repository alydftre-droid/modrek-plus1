import { supabase } from "@/integrations/supabase/client";

export const SUPPORT_BUCKET = "support-uploads";

export interface SupportThreadRow {
  id: string;
  user_id: string;
  message: string;
  is_from_admin: boolean;
  is_read?: boolean | null;
  is_resolved: boolean;
  is_teacher_request?: boolean | null;
  created_at: string;
  file_url?: string | null;
  file_type?: string | null;
  metadata?: Record<string, any> | null;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_");
}

export function createSupportClientId(prefix = "support") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function supportFilePath(userId: string, fileName: string, actor = "user") {
  return `${userId}/${actor}_${Date.now()}_${sanitizeFileName(fileName)}`;
}

/**
 * Uploads a support attachment to Bunny (owner-scoped path) and returns the
 * reference to store in `support_messages.file_url`.
 */
export async function uploadSupportAttachment(userId: string, file: File, actor = "user") {
  const { uploadFile } = await import("@/lib/storage");
  const stored = await uploadFile({
    scope: { kind: "user", id: userId },
    category: "support",
    file,
    fileName: `${actor}_${Date.now()}_${sanitizeFileName(file.name)}`,
  });
  return stored.url;
}

export async function signedSupportUrl(filePath: string | null | undefined) {
  if (!filePath) return null;
  const { isBunnyStorageFile, getFileUrl } = await import("@/lib/storage");
  if (isBunnyStorageFile(filePath)) return await getFileUrl(filePath);
  // Legacy Supabase-stored attachment (kept readable during/after migration).
  const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(filePath, 60 * 60 * 24);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function fetchSupportMessagesForUser(userId: string) {
  const { data, error } = await supabase
    .from("support_messages")
    .select("id, user_id, message, is_from_admin, is_read, is_resolved, is_teacher_request, created_at, file_url, file_type, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as SupportThreadRow[];
}

export async function mapSupportRowsToUiMessages(rows: SupportThreadRow[]) {
  return Promise.all(
    rows.map(async (row) => ({
      id: `support-${row.id}`,
      role: row.is_from_admin ? ("support" as const) : ("user" as const),
      content: row.message,
      imageUrl: row.file_type === "image" ? await signedSupportUrl(row.file_url || "") : null,
      audioUrl: row.file_type === "audio" ? await signedSupportUrl(row.file_url || "") : null,
      createdAt: row.created_at,
    })),
  );
}

export function mergeSupportMessages<T extends { id?: string | null; role: string }>(
  currentMessages: T[],
  supportMessages: T[],
) {
  const nonSupport = currentMessages.filter((message) => {
    const id = message.id || "";
    return !id.startsWith("support-") && !id.startsWith("local-support-");
  });
  return [...nonSupport, ...supportMessages];
}

export function hasActiveSupportSession(rows: SupportThreadRow[]) {
  const latest = rows.length ? rows[rows.length - 1] : null;
  return !!latest && !latest.is_resolved;
}

export async function markAdminSupportMessagesRead(userId: string) {
  await supabase
    .from("support_messages")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_from_admin", true)
    .eq("is_read", false);
}

export async function closeUserSupportConversation(userId: string, isTeacher: boolean) {
  const clientId = createSupportClientId(isTeacher ? "teacher-close" : "student-close");
  const { error } = await supabase.from("support_messages").insert({
    user_id: userId,
    message: "🔚 تم إنهاء المحادثة مع الدعم والعودة إلى المساعد الذكي.",
    is_from_admin: false,
    is_teacher_request: isTeacher,
    is_resolved: true,
    metadata: {
      source: "user-closed",
      client_id: clientId,
    },
  });

  if (error) throw error;
  return clientId;
}

export async function notifySupportReply(userId: string, message: string, isTeacher: boolean, createdBy?: string | null) {
  console.info("notifySupportReply handled by database triggers", {
    userId,
    isTeacher,
    createdBy,
    preview: (message || "").slice(0, 80),
  });
}