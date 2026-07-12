import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StudentLayout from "@/components/student/StudentLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ClipboardList, GraduationCap, MessageSquare, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { deleteConversation, listConversations } from "@/features/modrek-ai/store";
import type { AssistantType, ModrekConversation } from "@/features/modrek-ai/types";

const ICONS: Record<AssistantType, any> = {
  study: BookOpen,
  exams: ClipboardList,
  review: GraduationCap,
};
const LABELS: Record<AssistantType, string> = {
  study: "المساعد الدراسي",
  exams: "مساعد الامتحانات",
  review: "مراجعة امتحان",
};
const PATHS: Record<AssistantType, string> = {
  study: "/ai/study",
  exams: "/ai/exams",
  review: "/ai/study", // review conversations reopen inside study window
};

export default function ModrekAiConversationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ModrekConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | AssistantType>("all");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listConversations());
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذه المحادثة نهائيًا؟")) return;
    try {
      await deleteConversation(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
      toast.success("تم الحذف");
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    }
  };

  const openConv = (c: ModrekConversation) => {
    const path = PATHS[c.assistant_type] || "/ai";
    navigate(`${path}?conv=${c.id}`);
  };

  const filtered = items.filter((c) => {
    if (filter !== "all" && c.assistant_type !== filter) return false;
    if (q.trim() && !c.title?.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <StudentLayout title="محادثاتي">
      <div className="px-4 py-5 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-black">جميع محادثاتك مع Modrek AI</h1>
            <p className="text-sm text-muted-foreground">أنشئ محادثة جديدة أو أكمل محادثة سابقة في أي وقت.</p>
          </div>
          <Button onClick={() => navigate("/ai")} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> جديدة
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث بالعنوان..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pr-8"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "study", "exams", "review"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "الكل" : LABELS[f]}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center space-y-3">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">لا توجد محادثات بعد.</p>
            <Button onClick={() => navigate("/ai")} className="gap-2">
              <Plus className="h-4 w-4" /> ابدأ محادثة جديدة
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => {
              const Icon = ICONS[c.assistant_type] || MessageSquare;
              return (
                <Card
                  key={c.id}
                  className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition"
                  onClick={() => openConv(c)}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{c.title || "محادثة"}</h3>
                      <Badge variant="secondary" className="text-[10px]">{LABELS[c.assistant_type]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(c.last_message_at || c.created_at).toLocaleString("ar-EG")}
                      {c.context_json?.subject_name ? ` • ${c.context_json.subject_name}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
