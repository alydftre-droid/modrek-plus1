import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
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
  Bell, Pencil, Trash2, Plus, Sparkles, PlayCircle, Eye, Zap, X, Save, Loader2,
} from "lucide-react";
import {
  AUTOMATION_EVENTS, RECIPIENT_MODES, KIND_LABEL, renderTemplate,
  type AutomationRecipientMode,
} from "./AUTOMATION_EVENTS";

/* ==========================================================
   DS-Compliant Automation Tab
   ========================================================== */

const CARD =
  "bg-white rounded-[20px] border border-[#E5E7EB] shadow-[0_8px_25px_rgba(15,23,42,0.06)] p-6";
const INPUT =
  "h-[52px] rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-[#2563EB]";
const SELECT_TRIGGER =
  "h-[52px] rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]";

const EVENT_COLORS = ["#2563EB", "#7C3AED", "#059669", "#EA580C", "#DC2626", "#0F172A", "#F59E0B", "#10B981"];

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
      .from("automated_messages" as any).select("*")
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
      const arr = map.get(r.event_key) ?? []; arr.push(r); map.set(r.event_key, arr);
    });
    return map;
  }, [rows]);

  const totalActive = (rows || []).filter((r) => r.is_active).length;

  return (
    <div className="space-y-8" style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}>
      {/* Header */}
      <div
        className="rounded-[20px] p-6 flex items-center justify-between"
        style={{
          background: "#0F172A", color: "#fff",
          boxShadow: "0 8px 25px rgba(15,23,42,0.25)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-[14px] flex items-center justify-center bg-white/10">
            <Sparkles className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[18px] font-bold">محرك الأتمتة</div>
            <div className="text-[12px] text-white/70 font-medium">
              {rows === null ? "..." : `${rows.length} رسالة · ${totalActive} مفعّلة`}
            </div>
          </div>
        </div>
        <button
          onClick={() => setOpenNew(true)}
          className="h-11 px-5 rounded-[14px] font-bold text-[14px] flex items-center gap-2 bg-[#059669] text-white hover:bg-[#047857] transition-all duration-200 shadow-[0_4px_12px_rgba(5,150,105,0.35)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} /> رسالة جديدة
        </button>
      </div>

      {/* Event catalog */}
      <div className={CARD}>
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#E5E7EB]">
          <div className="h-9 w-9 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="text-[16px] font-bold text-[#0F172A]">الأحداث المدعومة</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {AUTOMATION_EVENTS.map((ev, i) => {
            const count = grouped.get(ev.key)?.length || 0;
            const color = EVENT_COLORS[i % EVENT_COLORS.length];
            return (
              <button
                key={ev.key}
                onClick={() => setOpenEdit({ ...(emptyDraft as any), id: "", event_key: ev.key, recipient_mode: ev.defaultRecipient, name: ev.label } as any)}
                className="relative overflow-hidden text-right rounded-[14px] border border-[#E5E7EB] bg-white p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.10)]"
              >
                <div className="absolute top-0 right-0 left-0 h-1" style={{ background: color }} />
                <div className="flex items-center justify-between mb-2 mt-1">
                  <div
                    className="h-8 w-8 rounded-[10px] flex items-center justify-center"
                    style={{ background: `${color}14`, color }}
                  >
                    <Zap className="h-4 w-4" strokeWidth={2.5} />
                  </div>
                  {count > 0 && (
                    <span
                      className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white"
                      style={{ background: color }}
                    >{count}</span>
                  )}
                </div>
                <div className="text-[13px] font-bold text-[#0F172A] line-clamp-1">{ev.label}</div>
                <div className="text-[10px] text-[#475569] font-medium line-clamp-2 mt-0.5 leading-relaxed">{ev.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {rows === null ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-[20px]" />)
        ) : rows.length === 0 ? (
          <div className="rounded-[20px] bg-white border border-dashed border-[#CBD5E1] p-10 text-center">
            <Sparkles className="h-10 w-10 text-[#CBD5E1] mx-auto mb-3" />
            <div className="text-[13px] text-[#475569] font-semibold">لا توجد رسائل تلقائية بعد. ابدأ بإنشاء واحدة.</div>
          </div>
        ) : rows.map((r) => {
          const ev = AUTOMATION_EVENTS.find((e) => e.key === r.event_key);
          const stateColor = r.is_active ? "#059669" : "#94A3B8";
          return (
            <div
              key={r.id}
              className="rounded-[20px] bg-white border border-[#E5E7EB] p-5 shadow-[0_8px_25px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] transition-all duration-200"
            >
              <div className="flex items-start gap-3">
                <div
                  className="h-11 w-11 rounded-[12px] flex items-center justify-center shrink-0 text-white"
                  style={{ background: stateColor }}
                >
                  <Bell className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold text-[#0F172A] text-[14px]">{r.name}</div>
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: "#2563EB" }}>{ev?.label || r.event_key}</span>
                    <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: "#7C3AED" }}>{KIND_LABEL[r.notification_type] || r.notification_type}</span>
                    {r.delay_minutes > 0 && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: "#EA580C" }}>تأخير {r.delay_minutes} د</span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#334155] mt-1.5 line-clamp-1 font-semibold">{r.title_template}</div>
                  <div className="text-[11px] text-[#475569] line-clamp-2">{r.message_template}</div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-[#94A3B8] font-semibold">
                    <span className="flex items-center gap-1"><PlayCircle className="h-3 w-3" /> {r.run_count} تشغيل</span>
                    {r.last_run_at && <span>آخر تشغيل: {new Date(r.last_run_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive(r, v)} />
                  <button
                    onClick={() => setOpenEdit(r)}
                    className="h-9 w-9 rounded-[10px] bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-colors flex items-center justify-center"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(r.id)}
                    className="h-9 w-9 rounded-[10px] bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(openEdit || openNew) && (
        <AutomationEditor
          initial={openEdit || (emptyDraft as any)}
          onClose={() => { setOpenEdit(null); setOpenNew(false); }}
          onSaved={() => { setOpenEdit(null); setOpenNew(false); load(); }}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الرسالة التلقائية؟</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع. سيتم إيقاف الحدث المرتبط بها.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[#DC2626] hover:bg-[#B91C1C]">حذف</AlertDialogAction>
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
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-y-auto bg-white"
        dir="rtl"
        style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}
      >
        <DialogHeader>
          <DialogTitle className="text-[18px] font-bold text-[#0F172A]">
            {initial.id ? "تعديل الرسالة التلقائية" : "رسالة تلقائية جديدة"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-[13px] font-semibold text-[#334155] mb-2 block">الحدث</label>
              <Select value={draft.event_key} onValueChange={(v) => {
                const e = AUTOMATION_EVENTS.find((x) => x.key === v);
                setDraft((d) => ({ ...d, event_key: v, recipient_mode: e?.defaultRecipient || "actor" }));
              }}>
                <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTOMATION_EVENTS.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {ev && <p className="text-[11px] text-[#475569] mt-1 font-medium">{ev.description}</p>}
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#334155] mb-2 block">اسم الرسالة (داخلي)</label>
              <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثال: ترحيب الطالب" className={INPUT} />
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#334155] mb-2 block">عنوان الإشعار</label>
              <Input value={draft.title_template || ""} onChange={(e) => setDraft({ ...draft, title_template: e.target.value })} placeholder="أهلاً بك في مدرك Plus" className={INPUT} />
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#334155] mb-2 block">
                محتوى الرسالة
                <span className="text-[10px] text-[#94A3B8] mr-2 font-medium">استخدم المتغيرات مثل {"{{full_name}}"}</span>
              </label>
              <Textarea
                rows={5}
                value={draft.message_template || ""}
                onChange={(e) => setDraft({ ...draft, message_template: e.target.value })}
                placeholder="مرحبًا {{full_name}}..."
                className="rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-[#2563EB] resize-none"
              />
              {ev && ev.variables.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {ev.variables.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      className="text-[11px] font-bold rounded-full bg-[#EFF6FF] text-[#2563EB] hover:bg-[#2563EB] hover:text-white px-2.5 py-1 transition-colors"
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-semibold text-[#334155] mb-2 block">النوع</label>
                <Select value={draft.notification_type} onValueChange={(v) => setDraft({ ...draft, notification_type: v })}>
                  <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[13px] font-semibold text-[#334155] mb-2 block">التأخير (دقائق)</label>
                <Input type="number" min={0} value={draft.delay_minutes ?? 0} onChange={(e) => setDraft({ ...draft, delay_minutes: Number(e.target.value) })} className={INPUT} />
              </div>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#334155] mb-2 block">المستلم</label>
              <Select value={draft.recipient_mode} onValueChange={(v) => setDraft({ ...draft, recipient_mode: v as AutomationRecipientMode })}>
                <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECIPIENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#475569] mt-1 font-medium">
                {RECIPIENT_MODES.find((m) => m.value === draft.recipient_mode)?.help}
              </p>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[#334155] mb-2 block">رابط (اختياري)</label>
              <Input value={draft.link_template || ""} onChange={(e) => setDraft({ ...draft, link_template: e.target.value })} placeholder="/subjects/..." className={INPUT} />
            </div>

            <div className="flex items-center justify-between rounded-[14px] border border-[#E5E7EB] bg-white p-4">
              <div>
                <div className="text-[14px] font-bold text-[#0F172A]">تفعيل الرسالة</div>
                <div className="text-[11px] text-[#475569] font-medium">عند الإيقاف لن تُرسل تلقائيًا.</div>
              </div>
              <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[13px] font-bold text-[#334155] flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-[#7C3AED]" /> معاينة (ببيانات تجريبية)
            </div>
            <div className="rounded-[20px] border border-[#E5E7EB] p-4 bg-[#F8FAFC]">
              <div className="rounded-[14px] bg-white p-3 flex items-start gap-2.5 border border-[#E5E7EB]">
                <div className="h-9 w-9 rounded-[10px] bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                  <Bell className="h-4 w-4" strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-[#0F172A]">{previewTitle || "عنوان الإشعار"}</div>
                  <div className="text-[12px] text-[#475569] mt-0.5 whitespace-pre-wrap">{previewMsg || "محتوى الرسالة"}</div>
                  <div className="text-[10px] text-[#94A3B8] mt-1.5">منذ لحظات</div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-[#475569] font-medium">
                * سيتم استبدال المتغيرات ببيانات المستخدم الحقيقية عند الإرسال.
              </div>
            </div>

            {ev && ev.variables.length > 0 && (
              <div className="rounded-[14px] bg-white border border-[#E5E7EB] p-4">
                <div className="text-[12px] font-bold text-[#334155] mb-2">المتغيرات المتاحة</div>
                <div className="space-y-1.5">
                  {ev.variables.map((v) => (
                    <div key={v.key} className="flex items-center justify-between text-[12px]">
                      <code className="bg-[#F8FAFC] border border-[#E5E7EB] rounded px-2 py-0.5 text-[#2563EB] font-bold">{"{{" + v.key + "}}"}</code>
                      <span className="text-[#475569] font-medium">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-[14px] font-bold text-[14px] flex items-center gap-2 bg-white text-[#334155] border border-[#CBD5E1] hover:bg-[#F8FAFC] transition-colors"
          >
            <X className="h-4 w-4" /> إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="h-11 px-5 rounded-[14px] font-bold text-[14px] flex items-center gap-2 bg-[#059669] text-white hover:bg-[#047857] transition-colors disabled:opacity-60 shadow-[0_4px_12px_rgba(5,150,105,0.25)]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
