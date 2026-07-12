import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ModrekChatWindow from "@/features/modrek-ai/ChatWindow";

export default function ModrekAiStudyPage() {
  const [params, setParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(params.get("conv"));

  useEffect(() => {
    const c = params.get("conv");
    setActiveId(c);
  }, [params]);

  const setActive = (id: string | null) => {
    setActiveId(id);
    const next = new URLSearchParams(params);
    if (id) next.set("conv", id);
    else next.delete("conv");
    setParams(next, { replace: true });
  };

  return (
    <ModrekChatWindow
      assistantType="study"
      conversationId={activeId || undefined}
      onConversationCreated={setActive}
      onSelectConversation={setActive}
    />
  );
}
