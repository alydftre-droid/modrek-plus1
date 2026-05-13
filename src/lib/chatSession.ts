type ChatMessageLike = {
  id: string;
  role: string;
  createdAt?: string;
};

export type ChatHistoryEntry<TMessage extends ChatMessageLike> = {
  id: string;
  title: string;
  date: string;
  messageCount: number;
  messages: TMessage[];
};

export function loadChatHistory<TMessage extends ChatMessageLike>(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [] as ChatHistoryEntry<TMessage>[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ChatHistoryEntry<TMessage>[] : [];
  } catch {
    return [] as ChatHistoryEntry<TMessage>[];
  }
}

export function saveChatHistory<TMessage extends ChatMessageLike>(storageKey: string, history: ChatHistoryEntry<TMessage>[]) {
  localStorage.setItem(storageKey, JSON.stringify(history.slice(0, 20)));
}

export function shouldPersistActiveThread(messages: Array<ChatMessageLike>, escalated: boolean) {
  return escalated || messages.some((message) => String(message.id || "").startsWith("support-"));
}

export function buildHistoryEntry<TMessage extends ChatMessageLike>(messages: TMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user");
  return {
    id: `history-${Date.now()}`,
    title: userMessages[0]?.id ? String((userMessages[0] as any).content || "محادثة جديدة").slice(0, 40) || "محادثة جديدة" : "محادثة جديدة",
    date: new Date().toISOString(),
    messageCount: messages.length,
    messages,
  } as ChatHistoryEntry<TMessage>;
}

export function upsertDraftAssistantMessage<TMessage extends ChatMessageLike & { content: string }>(
  messages: TMessage[],
  draftMessage: TMessage,
) {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.id === draftMessage.id) {
    return [...messages.slice(0, -1), draftMessage];
  }
  return [...messages, draftMessage];
}