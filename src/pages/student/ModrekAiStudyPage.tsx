import { useState } from "react";
import StudentLayout from "@/components/student/StudentLayout";
import ModrekChatWindow from "@/features/modrek-ai/ChatWindow";
import ConversationSidebar from "@/features/modrek-ai/ConversationSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { List } from "lucide-react";

export default function ModrekAiStudyPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreated = (id: string) => {
    setActiveId(id);
    setRefreshKey((k) => k + 1);
  };

  return (
    <StudentLayout title="المساعد الدراسي">
      <div className="flex h-[calc(100dvh-64px)]">
        {/* Desktop sidebar */}
        <div className="hidden md:block w-64 shrink-0">
          <ConversationSidebar
            assistantType="study"
            activeId={activeId || undefined}
            onSelect={setActiveId}
            refreshKey={refreshKey}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile: sheet trigger */}
          <div className="md:hidden p-2 border-b flex items-center justify-between">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <List className="h-4 w-4" /> المحادثات
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 w-72">
                <ConversationSidebar
                  assistantType="study"
                  activeId={activeId || undefined}
                  onSelect={(id) => setActiveId(id)}
                  refreshKey={refreshKey}
                />
              </SheetContent>
            </Sheet>
          </div>

          <ModrekChatWindow
            key={activeId || "new"}
            assistantType="study"
            conversationId={activeId || undefined}
            onConversationCreated={handleCreated}
          />
        </div>
      </div>
    </StudentLayout>
  );
}
