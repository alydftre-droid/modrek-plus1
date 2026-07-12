import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { listConversations, deleteConversation } from "./store";
import type { AssistantType, ModrekConversation } from "./types";
import { toast } from "sonner";

interface Props {
  assistantType: AssistantType;
  activeId?: string;
  onSelect: (id: string | null) => void;
  refreshKey?: number;
}

export default function ConversationSidebar({ assistantType, activeId, onSelect, refreshKey }: Props) {
  const [items, setItems] = useState<ModrekConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listConversations(assistantType));
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assistantType, refreshKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("حذف هذه المحادثة نهائيًا؟")) return;
    try {
      await deleteConversation(id);
      if (activeId === id) onSelect(null);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err: any) {
      toast.error(err?.message || "فشل الحذف");
    }
  };

  return (
    <div className="flex flex-col h-full border-l bg-muted/20">
      <div className="p-3 border-b">
        <Button className="w-full gap-2" onClick={() => onSelect(null)} size="sm">
          <Plus className="h-4 w-4" /> محادثة جديدة
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="text-center text-xs text-muted-foreground py-8">جاري التحميل...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">لا توجد محادثات بعد</div>
        ) : (
          items.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`group w-full text-right p-2 rounded-lg text-sm flex items-center justify-between gap-2 hover:bg-accent transition-colors ${activeId === c.id ? "bg-accent" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{c.title}</span>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleDelete(c.id, e)}
                className="opacity-0 group-hover:opacity-100 text-destructive p-1 rounded hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
