import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Send, Sparkles, Clock, Zap, Loader2, Rocket, ChevronLeft } from "lucide-react";
import StatsBar from "@/components/admin/notifications/StatsBar";
import RecipientsPanel from "@/components/admin/notifications/RecipientsPanel";
import LogsTable from "@/components/admin/notifications/LogsTable";
import AutomationTab from "@/components/admin/notifications/AutomationTab";
import type { TargetConfig, ResolvedUser, NotifKind } from "@/components/admin/notifications/types";

const KIND_OPTIONS: { value: NotifKind; label: string; active: string; idle: string; dot: string }[] = [
  { value: "normal",       label: "عادي",   active: "bg-gradient-to-br from-slate-600 to-slate-700 text-white border-slate-700 shadow-md shadow-slate-500/30",         idle: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",              dot: "bg-slate-500" },
  { value: "important",    label: "هام",    active: "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-500 shadow-md shadow-amber-500/30",       idle: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",              dot: "bg-amber-500" },
  { value: "urgent",       label: "عاجل",   active: "bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-500 shadow-md shadow-rose-500/30",             idle: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",                  dot: "bg-rose-500" },
  { value: "warning",      label: "تحذير",  active: "bg-gradient-to-br from-orange-500 to-red-500 text-white border-orange-500 shadow-md shadow-orange-500/30",       idle: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100",          dot: "bg-orange-500" },
  { value: "announcement", label: "إعلان",  active: "bg-gradient-to-br from-violet-500 to-purple-600 text-white border-violet-500 shadow-md shadow-violet-500/30",   idle: "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100",          dot: "bg-violet-500" },
  { value: "update",       label: "تحديث",  active: "bg-gradient-to-br from-sky-500 to-blue-600 text-white border-sky-500 shadow-md shadow-sky-500/30",               idle: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100",                      dot: "bg-sky-500" },
];

const NotificationsPage = () => {
  const [target, setTarget] = useState<TargetConfig>({ audience: "students", method: "all" });
  const [recipients, setRecipients] = useState<ResolvedUser[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<NotifKind>("normal");
  const [link, setLink] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const scheduledAt = useMemo(() => {
    if (!schedule || !scheduledDate || !scheduledTime) return null;
    return new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
  }, [schedule, scheduledDate, scheduledTime]);

  const canSend = title.trim() && message.trim() && recipients.length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) {
      toast.error("أكمل العنوان، الرسالة، والمستلمين");
      return;
    }
    setSending(true);
    try {
      const isScheduled = !!scheduledAt;
      const isSent = !isScheduled;
      const isBroadcastAll = target.audience === "all" && target.method === "all";

      if (isBroadcastAll && !isScheduled) {
        const { error } = await supabase.rpc("broadcast_notification" as any, {
          _title: title.trim(),
          _message: message.trim(),
          _link: link.trim() || null,
          _scheduled_at: null,
        });
        if (error) throw error;
      } else {
        // Chunk insert for large lists
        const rows = recipients.map((u) => ({
          user_id: u.id,
          title: title.trim(),
          message: message.trim(),
          notification_type: kind,
          link: link.trim() || null,
          is_sent: isSent,
          scheduled_at: scheduledAt,
        }));
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error } = await supabase.from("notifications").insert(rows.slice(i, i + CHUNK) as any);
          if (error) throw error;
        }
      }

      toast.success(scheduledAt ? "تم جدولة الإشعار" : `تم إرسال الإشعار إلى ${recipients.length} مستخدم`);
      setTitle(""); setMessage(""); setLink("");
      setSchedule(false); setScheduledDate(""); setScheduledTime("");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-full bg-[#FAFBFD] -m-4 md:-m-6 lg:-m-8 p-4 md:p-6 lg:p-8" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Bell className="h-5 w-5" />
              </div>
              مركز الإشعارات
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">إدارة الإشعارات اليدوية والتلقائية</p>
          </div>
        </div>

        {/* Stats */}
        <StatsBar refreshKey={refreshKey} />

        {/* Main Tabs */}
        <Tabs defaultValue="compose" className="space-y-5">
          <TabsList className="bg-white border border-slate-200 rounded-2xl p-1 h-auto">
            <TabsTrigger value="compose" className="rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2 px-4 py-2">
              <Send className="h-4 w-4" /> إرسال إشعار
            </TabsTrigger>
            <TabsTrigger value="automation" className="rounded-xl data-[state=active]:bg-indigo-600 data-[state=active]:text-white gap-2 px-4 py-2">
              <Sparkles className="h-4 w-4" /> الرسائل التلقائية
            </TabsTrigger>
          </TabsList>

          {/* COMPOSE */}
          <TabsContent value="compose" className="space-y-5 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Column 1 - Recipients */}
              <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200/70 p-5 shadow-sm">
                <RecipientsPanel config={target} onChange={setTarget} onResolved={setRecipients} />
              </div>

              {/* Column 2 - Content */}
              <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/70 p-5 shadow-sm space-y-4">
                <div className="text-[13px] font-semibold text-slate-700">٢. محتوى الإشعار</div>

                <div>
                  <label className="text-xs text-slate-600 mb-1.5 block">عنوان الإشعار</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="اكتب عنوان الإشعار..." className="bg-slate-50 border-slate-200" />
                  <div className="text-[10px] text-slate-400 mt-1 text-left">{title.length}/100</div>
                </div>

                <div>
                  <label className="text-xs text-slate-600 mb-1.5 block">محتوى الرسالة</label>
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={7} placeholder="اكتب محتوى الرسالة هنا..." className="bg-slate-50 border-slate-200 resize-none" />
                  <div className="text-[10px] text-slate-400 mt-1 text-left">{message.length}/1000</div>
                </div>

                <div>
                  <label className="text-xs text-slate-600 mb-1.5 block">رابط إجراء (اختياري)</label>
                  <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/subjects/... أو https://..." className="bg-slate-50 border-slate-200" />
                </div>

                <div>
                  <div className="text-xs text-slate-600 mb-2">نوع الإشعار</div>
                  <div className="flex flex-wrap gap-2">
                    {KIND_OPTIONS.map((k) => (
                      <button
                        key={k.value}
                        onClick={() => setKind(k.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          kind === k.value ? `${k.color} ring-2 ring-offset-1 ring-indigo-400` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Column 3 - Send Settings + Preview */}
              <div className="lg:col-span-3 space-y-4">
                <div className="rounded-2xl bg-white border border-slate-200/70 p-5 shadow-sm space-y-3">
                  <div className="text-[13px] font-semibold text-slate-700">٣. إعدادات الإرسال</div>
                  <button
                    onClick={() => setSchedule(false)}
                    className={`w-full text-right rounded-xl border p-3 transition-all ${
                      !schedule ? "border-indigo-500 bg-indigo-50/50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Zap className="h-4 w-4 text-indigo-600" /> إرسال الآن
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">سيتم الإرسال فوراً</p>
                  </button>
                  <button
                    onClick={() => setSchedule(true)}
                    className={`w-full text-right rounded-xl border p-3 transition-all ${
                      schedule ? "border-indigo-500 bg-indigo-50/50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Clock className="h-4 w-4 text-indigo-600" /> جدولة الإرسال
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">تحديد وقت لاحق</p>
                  </button>
                  {schedule && (
                    <div className="flex gap-2 pt-1">
                      <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="flex-1 bg-slate-50" />
                      <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="w-28 bg-slate-50" />
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div className="rounded-2xl bg-white border border-slate-200/70 p-4 shadow-sm">
                  <div className="text-[13px] font-semibold text-slate-700 mb-3">معاينة</div>
                  <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 line-clamp-1">
                          {title || "عنوان الإشعار سيظهر هنا"}
                        </div>
                        <div className="text-[11px] text-slate-600 line-clamp-3 mt-0.5">
                          {message || "محتوى الرسالة يظهر هنا..."}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1.5">منذ لحظات</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary + send */}
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-4 shadow-lg shadow-indigo-500/25">
                  <div className="text-[11px] text-indigo-100 mb-1">ملخص الإرسال</div>
                  <div className="text-2xl font-bold tabular-nums">{recipients.length.toLocaleString("ar-EG")} <span className="text-sm font-normal text-indigo-100">مستخدم</span></div>
                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="w-full mt-3 bg-white text-indigo-700 hover:bg-indigo-50 gap-2 h-10 font-semibold disabled:opacity-60"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    {scheduledAt ? "جدولة" : "إرسال الآن"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Logs */}
            <LogsTable refreshKey={refreshKey} />
          </TabsContent>

          {/* AUTOMATION */}
          <TabsContent value="automation" className="mt-0">
            <AutomationTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default NotificationsPage;
