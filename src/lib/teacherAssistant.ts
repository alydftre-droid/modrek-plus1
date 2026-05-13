import { streamEdgeFunction } from "@/lib/aiStream";

type TeacherAssistantPayload = {
  messages: Array<{ role: string; content: unknown }>;
  onDelta?: (chunk: string, full: string) => void;
};

function normalizeMessages(messages: TeacherAssistantPayload["messages"]) {
  return messages.slice(-12).map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string" || Array.isArray(m.content)
        ? m.content
        : String(m.content ?? ""),
  }));
}

export async function invokeTeacherAssistant(payload: TeacherAssistantPayload) {
  const { onDelta } = payload;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let aggregate = "";
      const result = await streamEdgeFunction(
        "teacher-assistant",
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
