import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bell, Pencil, Trash2, Plus, Sparkles, PlayCircle, Copy, Eye, Zap, X, Save,
} from "lucide-react";
import {
  AUTOMATION_EVENTS, RECIPIENT_MODES, KIND_LABEL, renderTemplate,
  type AutomationRecipientMode,
} from "./AUTOMATION_EVENTS";

type Automation = {
  id: string;
  event_key: string;
  name: string;
  title_template: string;
  message_template: string;
  notification_type: string;
  link_template: string | null;
  recipient_mode: AutomationRecipientMode;
  delay_minutes: number;
  is_active: boolean;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
};

const KIND_OPTIONS = ["normal", "important", "urgent", "warning", "announcement", "update"];

const emptyDraft: Partial<Automation> = {
  event_key: "student.registered",
  name: "",
  title_template: "",
  message_template: "",
  notification_type: "normal",
  link_template: "",
  recipient_mode: "actor",
  delay_minutes: 0,
  is_active: true,
};

export default function AutomationTab() {
  const [rows, setRows] = useState<Automation[] | null>(null);
  const [openEdit, setOpenEdit] = useState<Automation | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setRows(null);
    const { data, error } = await supabase
      .from("automated_messages" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("فشل تحميل الرسائل التلقائية"); setRows([]); return; }
    setRows((data as any as Automation[]) || []);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (row: Automation, next: boolean) => {
    setRows((r) => r?.map((x) => x.id === row.id ? { ...x, is_active: next } : x) ?? r);
    const { error } = await supabase.from("automated_messages" as any).update({ is_active: next }).eq("id", row.id);
    if (error) { toast.error("فشل التحديث"); load(); }
    else toast.success(next ? "تم التفعيل" : "تم الإيقاف");
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("automated_messages" as any).delete().eq("id", deleteId);
    if (error) toast.error("فشل الحذف");
    else { toast.success("تم الحذف"); load(); }
    setDeleteId(null);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Automation[]>();
    (rows || []).forEach((r) => {
      const arr = map.get(r.event_key) ?? [];
      arr.push(r);
      map.set(r.event_key, arr);
    });
    return map;
  }, [rows]);

  const totalActive = (rows || []).filter((r) => r.is_active).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white p-5 flex items-center justify-between shadow-lg shadow-indigo-500/25">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-bold">محرك الأتمتة</div>
            <div className="text-xs text-indigo-100">
              {rows === null ? "..." : `${rows.length} رسالة · ${totalActive} مفعّلة`}
            </div>
          </div>
        </div>
        <Button onClick={() => setOpenNew(true)} className="bg-gradient-to-r from-lime-300 to-emerald-300 text-emerald-950 hover:from-lime-200 hover:to-emerald-200 gap-2 font-black shadow-lg shadow-emerald-900/20">
          <Plus className="h-4 w-4" /> رسالة جديدة
        </Button>
      </div>

      {/* Event catalog quick add */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-sm">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="text-sm font-bold text-slate-800">الأحداث المدعومة</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {AUTOMATION_EVENTS.map((ev, i) => {
            const count = grouped.get(ev.key)?.length || 0;
            const palettes = [
              { grad: "from-blue-500 to-indigo-600",    ring: "hover:ring-blue-300",    tint: "hover:bg-blue-50/60" },
              { grad: "from-emerald-500 to-teal-600",   ring: "hover:ring-emerald-300", tint: "hover:bg-emerald-50/60" },
              { grad: "from-violet-500 to-purple-600",  ring: "hover:ring-violet-300",  tint: "hover:bg-violet-50/60" },
              { grad: "from-amber-500 to-orange-500",   ring: "hover:ring-amber-300",   tint: "hover:bg-amber-50/60" },
              { grad: "from-rose-500 to-pink-600",      ring: "hover:ring-rose-300",    tint: "hover:bg-rose-50/60" },
              { grad: "from-sky-500 to-cyan-600",       ring: "hover:ring-sky-300",     tint: "hover:bg-sky-50/60" },
              { grad: "from-fuchsia-500 to-pink-600",   ring: "hover:ring-fuchsia-300", tint: "hover:bg-fuchsia-50/60" },
              { grad: "from-lime-500 to-emerald-600",   ring: "hover:ring-lime-300",    tint: "hover:bg-lime-50/60" },
            ];
            const p = palettes[i % palettes.length];
            return (
              <button
                key={ev.key}
                onClick={() => setOpenEdit({ ...(emptyDraft as any), id: "", event_key: ev.key, recipient_mode: ev.defaultRecipient, name: ev.label } as any)}
                className={`text-right rounded-xl border-0 bg-gradient-to-br ${p.grad} text-white p-3 transition-all shadow-md shadow-slate-900/10 hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 ${p.ring}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-white/20 text-white shadow-sm ring-1 ring-white/25">
                    <Zap className="h-4 w-4" strokeWidth={2.5} />
                  </div>
                  {count > 0 && <Badge className="text-[10px] rounded-full bg-white text-slate-900 border-0 font-bold shadow-sm">{count}</Badge>}
                </div>
                <div className="text-xs font-black text-white line-clamp-1">{ev.label}</div>
                <div className="text-[10px] text-white/85 line-clamp-2 mt-0.5 leading-relaxed">{ev.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {rows === null ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-slate-300 p-10 text-center">
            <Sparkles className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <div className="text-sm text-slate-500">لا توجد رسائل تلقائية بعد. ابدأ بإنشاء واحدة.</div>
          </div>
        ) : rows.map((r) => {
          const ev = AUTOMATION_EVENTS.find((e) => e.key === r.event_key);
          return (
            <div key={r.id} className={`rounded-2xl border p-4 transition-all hover:shadow-lg ${r.is_active ? "bg-gradient-to-br from-white to-emerald-50 border-emerald-200" : "bg-gradient-to-br from-white to-rose-50 border-rose-200"}`}>
              <div className="flex items-start gap-3">
                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-md ${r.is_active ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25" : "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/25"}`}>
                  <Bell className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold text-slate-900">{r.name}</div>
                    <Badge className="text-[10px] rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-0 shadow-sm">{ev?.label || r.event_key}</Badge>
                    <Badge className="text-[10px] rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-0 shadow-sm">{KIND_LABEL[r.notification_type] || r.notification_type}</Badge>
                    {r.delay_minutes > 0 && (
                      <Badge className="text-[10px] rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-sm">تأخير {r.delay_minutes} د</Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-700 mt-1.5 line-clamp-1"><span className="font-semibold">{r.title_template}</span></div>
                  <div className="text-[11px] text-slate-500 line-clamp-2">{r.message_template}</div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><PlayCircle className="h-3 w-3" /> {r.run_count} تشغيل</span>
                    {r.last_run_at && <span>آخر تشغيل: {new Date(r.last_run_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
                  <Button size="icon" className="h-8 w-8 bg-gradient-to-br from-blue-500 to-cyan-600 text-white hover:from-blue-600 hover:to-cyan-700 shadow-sm" onClick={() => setOpenEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" className="h-8 w-8 bg-gradient-to-br from-rose-500 to-red-600 text-white hover:from-rose-600 hover:to-red-700 shadow-sm" onClick={() => setDeleteId(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* New/Edit dialog */}
      {(openEdit || openNew) && (
        <AutomationEditor
          initial={openEdit || (emptyDraft as any)}
          onClose={() => { setOpenEdit(null); setOpenNew(false); }}
          onSaved={() => { setOpenEdit(null); setOpenNew(false); load(); }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرسالة التلقائية؟</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع. سيتم إيقاف الحدث المرتبط بها.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AutomationEditor({
  initial, onClose, onSaved,
}: {
  initial: Partial<Automation> & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Automation>>({ ...initial });
  const [saving, setSaving] = useState(false);

  const ev = AUTOMATION_EVENTS.find((e) => e.key === draft.event_key);
  const sampleVars: Record<string, string> = useMemo(() => {
    const o: Record<string, string> = {};
    ev?.variables.forEach((v) => { o[v.key] = v.sample; });
    return o;
  }, [ev]);

  const previewTitle = renderTemplate(draft.title_template || "", sampleVars);
  const previewMsg = renderTemplate(draft.message_template || "", sampleVars);

  const insertVar = (k: string) => {
    setDraft((d) => ({ ...d, message_template: (d.message_template || "") + `{{${k}}}` }));
  };

  const save = async () => {
    if (!draft.event_key || !draft.name || !draft.title_template || !draft.message_template) {
      toast.error("أكمل جميع الحقول الأساسية"); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        event_key: draft.event_key,
        name: draft.name,
        title_template: draft.title_template,
        message_template: draft.message_template,
        notification_type: draft.notification_type || "normal",
        link_template: draft.link_template || null,
        recipient_mode: draft.recipient_mode || "actor",
        delay_minutes: Number(draft.delay_minutes) || 0,
        is_active: draft.is_active ?? true,
      };
      if (initial.id) {
        const { error } = await supabase.from("automated_messages" as any).update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("تم الحفظ");
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id;
        const { error } = await supabase.from("automated_messages" as any).insert(payload);
        if (error) throw error;
        toast.success("تم الإنشاء");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{initial.id ? "تعديل الرسالة التلقائية" : "رسالة تلقائية جديدة"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">الحدث</label>
              <Select value={draft.event_key} onValueChange={(v) => {
                const e = AUTOMATION_EVENTS.find((x) => x.key === v);
                setDraft((d) => ({ ...d, event_key: v, recipient_mode: e?.defaultRecipient || "actor" }));
              }}>
                <SelectTrigger className="bg-indigo-50 border-indigo-200 text-indigo-950 focus:ring-indigo-400"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_EVENTS.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {ev && <p className="text-[10px] text-slate-500 mt-1">{ev.description}</p>}
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">اسم الرسالة (داخلي)</label>
              <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثال: ترحيب الطالب" className="bg-blue-50 border-blue-200 focus-visible:ring-blue-400" />
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">عنوان الإشعار</label>
              <Input value={draft.title_template || ""} onChange={(e) => setDraft({ ...draft, title_template: e.target.value })} placeholder="أهلاً بك في مدرك Plus" className="bg-sky-50 border-sky-200 focus-visible:ring-sky-400" />
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">
                محتوى الرسالة
                <span className="text-[10px] text-slate-400 mr-2">استخدم المتغيرات مثل {"{{full_name}}"}</span>
              </label>
              <Textarea rows={5} value={draft.message_template || ""} onChange={(e) => setDraft({ ...draft, message_template: e.target.value })} placeholder="مرحبًا {{full_name}}..." className="bg-violet-50 border-violet-200 focus-visible:ring-violet-400" />
              {ev && ev.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ev.variables.map((v) => (
                    <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="text-[10px] rounded-full bg-gradient-to-r from-indigo-500 to-blue-600 text-white hover:from-indigo-600 hover:to-blue-700 px-2 py-0.5 shadow-sm">
                      + {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">النوع</label>
                <Select value={draft.notification_type} onValueChange={(v) => setDraft({ ...draft, notification_type: v })}>
                  <SelectTrigger className="bg-amber-50 border-amber-200 text-amber-950 focus:ring-amber-400"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">التأخير (دقائق)</label>
                <Input type="number" min={0} value={draft.delay_minutes ?? 0} onChange={(e) => setDraft({ ...draft, delay_minutes: Number(e.target.value) })} className="bg-orange-50 border-orange-200 focus-visible:ring-orange-400" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">المستلم</label>
              <Select value={draft.recipient_mode} onValueChange={(v) => setDraft({ ...draft, recipient_mode: v as AutomationRecipientMode })}>
                  <SelectTrigger className="bg-emerald-50 border-emerald-200 text-emerald-950 focus:ring-emerald-400"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECIPIENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-500 mt-1">
                {RECIPIENT_MODES.find((m) => m.value === draft.recipient_mode)?.help}
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">رابط (اختياري)</label>
              <Input value={draft.link_template || ""} onChange={(e) => setDraft({ ...draft, link_template: e.target.value })} placeholder="/subjects/..." className="bg-cyan-50 border-cyan-200 focus-visible:ring-cyan-400" />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-3">
              <div>
                <div className="text-sm font-semibold">تفعيل الرسالة</div>
                <div className="text-[10px] text-slate-500">عند الإيقاف لن تُرسل تلقائيًا.</div>
              </div>
              <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> معاينة (ببيانات تجريبية)
            </div>
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-4 bg-gradient-to-br from-indigo-50/50 to-white">
              <div className="rounded-2xl bg-white shadow-sm p-3 flex items-start gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Bell className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900">{previewTitle || "عنوان الإشعار"}</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-wrap">{previewMsg || "محتوى الرسالة"}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5">منذ لحظات</div>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-slate-500">
                * سيتم استبدال المتغيرات ببيانات المستخدم الحقيقية عند الإرسال.
              </div>
            </div>

            {ev && ev.variables.length > 0 && (
              <div className="rounded-xl bg-slate-50 border p-3">
                <div className="text-[11px] font-semibold text-slate-700 mb-2">المتغيرات المتاحة</div>
                <div className="space-y-1">
                  {ev.variables.map((v) => (
                    <div key={v.key} className="flex items-center justify-between text-[11px]">
                      <code className="bg-white border rounded px-1.5 py-0.5 text-indigo-700">{"{{" + v.key + "}}"}</code>
                      <span className="text-slate-600">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="bg-gradient-to-r from-rose-500 to-red-600 text-white hover:from-rose-600 hover:to-red-700 gap-2 shadow-sm"><X className="h-4 w-4" /> إلغاء</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 gap-2 shadow-md shadow-indigo-500/25">
            {saving ? <Copy className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
