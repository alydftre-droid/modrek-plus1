export type AssistantType = "study" | "exams" | "review";

export interface ModrekConversation {
  id: string;
  student_id: string;
  assistant_type: AssistantType;
  title: string;
  context_json: Record<string, any>;
  last_message_at: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModrekMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "file"; file: { filename: string; file_data: string } }>;
  attachments?: any[];
  metadata?: Record<string, any>;
  created_at: string;
}
