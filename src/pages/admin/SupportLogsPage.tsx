import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MessageCircle, Bot, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";

type LogRow = {
  id: string;
  user_id: string;
  user_role: string | null;
  user_code: string | null;
  channel: "whatsapp" | "messenger" | "assistant";
  created_at: string;
  full_name?: string | null;
};

const CHANNELS = [
  { key: "all", label: "الكل" },
  { key: "whatsapp", label: "واتساب" },
  { key: "assistant", label: "المساعد" },
  { key: "messenger", label: "Messenger" },
] as const;

export default function SupportLogsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("support_contact_logs")
        .select("id, user_id, user_role, user_code, channel, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") q = q.eq("channel", filter);
      const { data } = await q;
      const logs = (data as any[]) || [];
      const ids = Array.from(new Set(logs.map((r) => r.user_id))).filter(Boolean);
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        (profs || []).forEach((p: any) => { names[p.id] = p.full_name; });
      }
      setRows(logs.map((r) => ({ ...r, full_name: names[r.user_id] || null })));
      setLoading(false);
    })();
  }, [filter]);

  const icon = (c: string) => c === "whatsapp" ? <MessageCircle className="h-4 w-4 text-emerald-600" />
    : c === "messenger" ? <Facebook className="h-4 w-4 text-sky-600" />
    : <Bot className="h-4 w-4 text-blue-600" />;

  return (
    <div className="space-y-4" dir="rtl">
      <h2 className="text-lg font-bold">سجل التواصل مع الدعم</h2>
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((c) => (
          <Button key={c.key} size="sm" variant={filter === c.key ? "default" : "outline"} onClick={() => setFilter(c.key)}>
            {c.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">لا توجد سجلات.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center">{icon(r.channel)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.full_name || "—"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.user_role || "-"} • {r.user_code || "-"} • {new Date(r.created_at).toLocaleString("ar-EG")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
