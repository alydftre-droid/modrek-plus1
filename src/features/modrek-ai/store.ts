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

/** Convert stored messages to Lovable AI Gateway chat format */
export function toGatewayMessages(messages: ModrekMessage[]) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      if (m.parts.length === 1 && m.parts[0].type === "text") {
        return { role: m.role, content: (m.parts[0] as any).text };
      }
      return { role: m.role, content: m.parts };
    });
}
