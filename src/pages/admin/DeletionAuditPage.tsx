import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle, CheckCircle2, Clock, Filter, RefreshCcw, Search, ShieldAlert,
  Trash2, User, Video, FileText, Sparkles, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type ActionType = "content_delete" | "teacher_delete" | "book_delete" | "orphan_cleanup";
type StatusType = "success" | "partial" | "error";

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action_type: ActionType;
  target_id: string | null;
  target_label: string | null;
  target_meta: Record<string, unknown> | null;
  bunny_total: number;
  bunny_success: number;
  bunny_failed: number;
  bunny_details: Array<{ kind: string; ref: string; ok: boolean; status: number; error?: string }> | null;
  duration_ms: number;
  status: StatusType;
  error: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<ActionType, string> = {
  content_delete: "حذف محتوى",
  teacher_delete: "حذف حساب معلم",
  book_delete: "حذف كتاب",
  orphan_cleanup: "تنظيف ملفات يتيمة",
};
const ACTION_ICON: Record<ActionType, typeof Video> = {
  content_delete: Video,
  teacher_delete: User,
  book_delete: FileText,
  orphan_cleanup: Sparkles,
};
const STATUS_STYLE: Record<StatusType, string> = {
  success: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
  error:   "bg-rose-100 text-rose-700",
};
const STATUS_LABEL: Record<StatusType, string> = {
  success: "نجاح",
  partial: "نجاح جزئي",
  error:   "فشل",
};

const relativeTime = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "منذ لحظات";
  if (diff < 3600) return `منذ ${Math.round(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.round(diff / 3600)} ساعة`;
  return `منذ ${Math.round(diff / 86400)} يوم`;
};

const DeletionAuditPage = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusType | "all">("all");
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState<"dry" | "run" | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deletion_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("تعذر تحميل السجل");
      console.error(error);
    } else {
      setRows((data ?? []) as unknown as AuditRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.action_type !== filter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = [r.target_label, r.actor_email, r.target_id, r.error].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, statusFilter, query]);

  const stats = useMemo(() => ({
    total: rows.length,
    ok: rows.filter((r) => r.status === "success").length,
    partial: rows.filter((r) => r.status === "partial").length,
    err: rows.filter((r) => r.status === "error").length,
    bunnyFailed: rows.reduce((sum, r) => sum + (r.bunny_failed || 0), 0),
  }), [rows]);

  const runOrphanCleanup = async (dry: boolean) => {
    if (!dry && !confirm("سيتم حذف كل ملف على Bunny غير مرتبط بأي سجل في قاعدة البيانات. هل أنت متأكد؟")) return;
    setCleanupBusy(dry ? "dry" : "run");
    try {
      const { data, error } = await supabase.functions.invoke("bunny-orphan-cleanup", {
        body: { dry_run: dry },
      });
      if (error) throw error;
      const d = data as { stream?: { orphans: number; deleted: number }; storage?: { orphans: number; deleted: number } };
      toast.success(
        dry
          ? `فحص فقط: ${d?.stream?.orphans ?? 0} فيديو يتيم و ${d?.storage?.orphans ?? 0} ملف يتيم`
          : `تم حذف ${(d?.stream?.deleted ?? 0) + (d?.storage?.deleted ?? 0)} ملف من Bunny`,
      );
      await load();
    } catch (err) {
      toast.error("فشل التنظيف: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCleanupBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">إجمالي العمليات</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3 bg-emerald-50">
          <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> ناجحة</p>
          <p className="text-lg font-bold text-emerald-700">{stats.ok}</p>
        </Card>
        <Card className="p-3 bg-amber-50">
          <p className="text-xs text-amber-700 flex items-center gap-1"><AlertCircle className="h-3 w-3"/> جزئية</p>
          <p className="text-lg font-bold text-amber-700">{stats.partial}</p>
        </Card>
        <Card className="p-3 bg-rose-50">
          <p className="text-xs text-rose-700 flex items-center gap-1"><ShieldAlert className="h-3 w-3"/> فاشلة</p>
          <p className="text-lg font-bold text-rose-700">{stats.err}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">ملفات Bunny فشلت</p>
          <p className="text-lg font-bold">{stats.bunnyFailed}</p>
        </Card>
      </div>

      {/* Orphan cleanup panel */}
      <Card className="p-4 border-2 border-dashed border-primary/40 bg-primary/5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4"/></div>
          <div className="flex-1">
            <p className="font-semibold text-sm">تنظيف الملفات اليتيمة على Bunny</p>
            <p className="text-xs text-muted-foreground mb-2">
              يفحص كل الفيديوهات والملفات على Bunny ويحذف كل ما لا يوجد له مرجع في قاعدة البيانات (متبقي من حذف حسابات معلمين قديمة).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={cleanupBusy !== null} onClick={() => runOrphanCleanup(true)}>
                {cleanupBusy === "dry" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Filter className="h-3.5 w-3.5"/>} فحص فقط
              </Button>
              <Button size="sm" variant="destructive" disabled={cleanupBusy !== null} onClick={() => runOrphanCleanup(false)}>
                {cleanupBusy === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5"/>} تنظيف فعلي
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو البريد أو المعرف" className="pr-9"/>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as ActionType | "all")}
                className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="all">كل العمليات</option>
          <option value="content_delete">حذف محتوى</option>
          <option value="teacher_delete">حذف معلم</option>
          <option value="book_delete">حذف كتاب</option>
          <option value="orphan_cleanup">تنظيف Bunny</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusType | "all")}
                className="rounded-md border bg-background px-3 py-2 text-sm">
          <option value="all">كل الحالات</option>
          <option value="success">نجاح</option>
          <option value="partial">جزئي</option>
          <option value="error">فشل</option>
        </select>
        <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-4 w-4"/></Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">لا توجد سجلات مطابقة</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const Icon = ACTION_ICON[r.action_type] ?? Trash2;
            return (
              <button key={r.id} onClick={() => setSelected(r)}
                      className="w-full text-right p-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted"><Icon className="h-4 w-4"/></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{ACTION_LABEL[r.action_type] ?? r.action_type}</span>
                      <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {r.bunny_total > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Bunny: {r.bunny_success}/{r.bunny_total}
                          {r.bunny_failed > 0 && <span className="text-rose-600"> · {r.bunny_failed} فشل</span>}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {r.target_label ?? r.target_id ?? "—"}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><User className="h-3 w-3"/>{r.actor_email ?? "?"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3"/>{relativeTime(r.created_at)}</span>
                      <span>{r.duration_ms} ms</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Details dialog */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? ACTION_LABEL[selected.action_type] : ""}</DialogTitle>
            <DialogDescription>{selected?.target_label ?? selected?.target_id ?? ""}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Card className="p-3"><p className="text-xs text-muted-foreground">الحالة</p>
                  <Badge className={STATUS_STYLE[selected.status]}>{STATUS_LABEL[selected.status]}</Badge></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">مدة التنفيذ</p>
                  <p className="font-bold">{selected.duration_ms} ms</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">Bunny ناجحة</p>
                  <p className="font-bold text-emerald-700">{selected.bunny_success} / {selected.bunny_total}</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">Bunny فاشلة</p>
                  <p className="font-bold text-rose-700">{selected.bunny_failed}</p></Card>
              </div>

              <div>
                <p className="font-semibold mb-1">المنفذ</p>
                <p className="text-xs text-muted-foreground">{selected.actor_email ?? "?"} · {selected.actor_id ?? "?"}</p>
              </div>

              {selected.error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs whitespace-pre-wrap">
                  {selected.error}
                </div>
              )}

              {(selected.bunny_details?.length ?? 0) > 0 && (
                <div>
                  <p className="font-semibold mb-2">تفاصيل عمليات Bunny</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {selected.bunny_details!.map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[10px]">{d.kind}</Badge>
                          <span className="truncate font-mono text-[11px]">{d.ref}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-muted-foreground">{d.status}</span>
                          {d.ok
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/>
                            : <AlertCircle className="h-4 w-4 text-rose-600"/>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.target_meta && Object.keys(selected.target_meta).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">بيانات إضافية</summary>
                  <pre className="mt-2 p-2 rounded bg-muted overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.target_meta, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeletionAuditPage;
