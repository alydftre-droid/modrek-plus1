import { streamEdgeFunction } from "@/lib/aiStream";

type SupportAssistantPayload = {
  messages: Array<{ role: string; content: unknown }>;
  onDelta?: (chunk: string, full: string) => void;
};

function normalizeMessages(messages: SupportAssistantPayload["messages"]) {
  return messages
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content:
        typeof message.content === "string" || Array.isArray(message.content)
          ? message.content
          : String(message.content ?? ""),
    }));
}

export async function invokeSupportAssistant(payload: SupportAssistantPayload) {
  const { onDelta } = payload;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let aggregate = "";
      const result = await streamEdgeFunction(
        "support-assistant",
        { messages: normalizeMessages(payload.messages) },
        {
          onDelta: (delta) => {
            aggregate += delta;
            onDelta?.(delta, aggregate);
          },
        },
      );
      const content = (result.content || aggregate).trim();
      if (content) return content;
      lastError = new Error("لم يصل رد صالح من المساعد");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError || new Error("تعذر الوصول للمساعد الآن");
}
