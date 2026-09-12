import { supabase } from "@/integrations/supabase/client";
import type { AssistantType, ModrekConversation, ModrekMessage } from "./types";

export async function listConversations(assistantType?: AssistantType): Promise<ModrekConversation[]> {
  let q = supabase
    .from("modrek_ai_conversations" as any)
    .select("*")
    .eq("is_archived", false)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (assistantType) q = q.eq("assistant_type", assistantType);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as ModrekConversation[];
}

export async function createConversation(input: {
  assistant_type: AssistantType;
  title?: string;
  context_json?: Record<string, any>;
}): Promise<ModrekConversation> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("modrek_ai_conversations" as any)
    .insert({
      student_id: uid,
      assistant_type: input.assistant_type,
      title: input.title || "محادثة جديدة",
      context_json: input.context_json || {},
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ModrekConversation;
}

export async function updateConversation(id: string, patch: Partial<Pick<ModrekConversation, "title" | "context_json" | "is_archived">>) {
  const { error } = await supabase.from("modrek_ai_conversations" as any).update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from("modrek_ai_conversations" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function getConversation(id: string): Promise<ModrekConversation | null> {
  const { data, error } = await supabase.from("modrek_ai_conversations" as any).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as ModrekConversation) || null;
}

export async function listMessages(conversationId: string): Promise<ModrekMessage[]> {
  const { data, error } = await supabase
    .from("modrek_ai_messages" as any)
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as ModrekMessage[];
}

export async function appendMessage(conversationId: string, msg: Pick<ModrekMessage, "role" | "parts"> & { metadata?: any }): Promise<ModrekMessage> {
  const { data, error } = await supabase
    .from("modrek_ai_messages" as any)
    .insert({
      conversation_id: conversationId,
      role: msg.role,
      parts: msg.parts,
      metadata: msg.metadata || {},
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ModrekMessage;
}

/**
 * Convert stored messages to Lovable AI Gateway chat format.
 *
 * Attachments are persisted as Bunny references (`bstorage://...`) so no file
 * bytes live in PostgreSQL. The model still needs inline bytes, so references
 * are rehydrated into data URLs here — only for the most recent messages, to
 * keep the request small.
 */
const REHYDRATE_LAST_MESSAGES = 4;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function rehydratePart(part: any): Promise<any> {
  try {
    const { isBunnyStorageFile, getFileBlob } = await import("@/lib/storage");
    if (part?.type === "image_url" && isBunnyStorageFile(part.image_url?.url || "")) {
      const dataUrl = await blobToDataUrl(await getFileBlob(part.image_url.url));
      return { type: "image_url", image_url: { url: dataUrl } };
    }
    if (part?.type === "file" && isBunnyStorageFile(part.file?.file_data || "")) {
      const dataUrl = await blobToDataUrl(await getFileBlob(part.file.file_data));
      return { type: "file", file: { filename: part.file.filename, file_data: dataUrl } };
    }
  } catch {
    return { type: "text", text: "[تعذر تحميل المرفق]" };
  }
  return part;
}

function stripAttachment(part: any) {
  if (part?.type === "image_url") return { type: "text", text: "[صورة مرفقة سابقًا]" };
  if (part?.type === "file") return { type: "text", text: `[ملف مرفق سابقًا: ${part.file?.filename || "ملف"}]` };
  return part;
}

export async function toGatewayMessages(messages: ModrekMessage[]) {
  const chat = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const rehydrateFrom = Math.max(0, chat.length - REHYDRATE_LAST_MESSAGES);
  const out: Array<{ role: string; content: any }> = [];
  for (let i = 0; i < chat.length; i += 1) {
    const m = chat[i];
    if (m.parts.length === 1 && m.parts[0].type === "text") {
      out.push({ role: m.role, content: (m.parts[0] as any).text });
      continue;
    }
    const parts = i >= rehydrateFrom
      ? await Promise.all(m.parts.map((p) => rehydratePart(p)))
      : m.parts.map((p) => stripAttachment(p));
    out.push({ role: m.role, content: parts });
  }
  return out;
}
