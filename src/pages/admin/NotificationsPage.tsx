import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Bell, Send, Sparkles, Clock, Loader2, CalendarClock, Zap,
} from "lucide-react";
import StatsBar from "@/components/admin/notifications/StatsBar";
import RecipientsPanel from "@/components/admin/notifications/RecipientsPanel";
import LogsTable from "@/components/admin/notifications/LogsTable";
import AutomationTab from "@/components/admin/notifications/AutomationTab";
import type { TargetConfig, ResolvedUser, NotifKind } from "@/components/admin/notifications/types";

/* =============================================================
   DS-Compliant Notification Center
   Palette: #2563EB / #7C3AED / #059669 / #EA580C / #DC2626
   No pastels · No blur · Cards white · Radius 20 · Cairo
   ============================================================= */

const CARD =
  "bg-white rounded-[20px] border border-[#E5E7EB] shadow-[0_8px_25px_rgba(15,23,42,0.08)] p-6";

const INPUT =
  "h-[52px] rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-[#2563EB]";

const KIND_OPTIONS: { value: NotifKind; label: string; color: string }[] = [
  { value: "normal",       label: "عادي",   color: "#2563EB" },
  { value: "important",    label: "هام",    color: "#F59E0B" },
  { value: "urgent",       label: "عاجل",   color: "#DC2626" },
  { value: "warning",      label: "تحذير",  color: "#EA580C" },
  { value: "announcement", label: "إعلان",  color: "#7C3AED" },
  { value: "update",       label: "تحديث",  color: "#059669" },
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
    if (!canSend) { toast.error("أكمل العنوان، الرسالة، والمستلمين"); return; }
    setSending(true);
    try {
      const isScheduled = !!scheduledAt;
      const isSent = !isScheduled;
      const isBroadcastAll = target.audience === "all" && target.method === "all";

      if (isBroadcastAll && !isScheduled) {
        const { error } = await supabase.rpc("broadcast_notification" as any, {
          _title: title.trim(), _message: message.trim(),
          _link: link.trim() || null, _scheduled_at: null,
        });
        if (error) throw error;
      } else {
        const rows = recipients.map((u) => ({
          user_id: u.id, title: title.trim(), message: message.trim(),
          notification_type: kind, link: link.trim() || null,
          is_sent: isSent, scheduled_at: scheduledAt,
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
    } finally { setSending(false); }
  };

  return (
    <div
      className="min-h-full bg-[#F8FAFC] -m-4 md:-m-6 lg:-m-8 p-6 md:p-8"
      dir="rtl"
      style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}
    >
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-[16px] bg-[#2563EB] text-white flex items-center justify-center shadow-[0_8px_25px_rgba(37,99,235,0.25)]">
            <Bell className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">مركز الإشعارات</h1>
            <p className="text-sm text-[#475569] mt-1 font-medium">إدارة الإشعارات اليدوية والرسائل التلقائية</p>
          </div>
        </div>

        {/* Stats */}
        <StatsBar refreshKey={refreshKey} />

        {/* Main Tabs */}
        <Tabs defaultValue="compose" className="space-y-8">
          <TabsList className="bg-white border border-[#E5E7EB] rounded-[14px] p-1.5 h-auto gap-1 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <TabsTrigger
              value="compose"
              className="rounded-[10px] gap-2 px-5 py-2.5 text-[14px] font-semibold text-[#334155] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white data-[state=active]:shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition-all duration-200"
            >
              <Send className="h-4 w-4" /> إرسال إشعار
            </TabsTrigger>
            <TabsTrigger
              value="automation"
              className="rounded-[10px] gap-2 px-5 py-2.5 text-[14px] font-semibold text-[#334155] data-[state=active]:bg-[#0F172A] data-[state=active]:text-white data-[state=active]:shadow-[0_4px_12px_rgba(15,23,42,0.25)] transition-all duration-200"
            >
              <Sparkles className="h-4 w-4" /> الرسائل التلقائية
            </TabsTrigger>
          </TabsList>

          {/* COMPOSE */}
          <TabsContent value="compose" className="space-y-8 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Recipients */}
              <div className={`lg:col-span-4 ${CARD}`}>
                <RecipientsPanel config={target} onChange={setTarget} onResolved={setRecipients} />
              </div>

              {/* Content */}
              <div className={`lg:col-span-5 ${CARD} space-y-5`}>
                <div className="flex items-center gap-2 pb-2 border-b border-[#E5E7EB]">
                  <div className="h-8 w-8 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                    <Bell className="h-4 w-4" strokeWidth={2.5} />
                  </div>
                  <div className="text-[16px] font-bold text-[#0F172A]">محتوى الإشعار</div>
                </div>

                <div>
                  <label className="text-[13px] font-semibold text-[#334155] mb-2 block">عنوان الإشعار</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))} placeholder="اكتب عنوان الإشعار..." className={INPUT} />
                  <div className="text-[11px] text-[#94A3B8] mt-1 text-left tabular-nums">{title.length}/100</div>
                </div>

                <div>
                  <label className="text-[13px] font-semibold text-[#334155] mb-2 block">محتوى الرسالة</label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                    rows={6}
                    placeholder="اكتب محتوى الرسالة هنا..."
                    className="rounded-[14px] border-[#CBD5E1] bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:border-[#2563EB] resize-none"
                  />
                  <div className="text-[11px] text-[#94A3B8] mt-1 text-left tabular-nums">{message.length}/1000</div>
                </div>

                <div>
                  <label className="text-[13px] font-semibold text-[#334155] mb-2 block">رابط إجراء (اختياري)</label>
                  <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/subjects/... أو https://..." className={INPUT} />
                </div>

                <div>
                  <div className="text-[13px] font-semibold text-[#334155] mb-2">نوع الإشعار</div>
                  <div className="flex flex-wrap gap-2">
                    {KIND_OPTIONS.map((k) => {
                      const selected = kind === k.value;
                      return (
                        <button
                          key={k.value}
                          onClick={() => setKind(k.value)}
                          className="inline-flex items-center gap-2 px-4 h-9 rounded-full text-[13px] font-semibold border transition-all duration-200"
                          style={
                            selected
                              ? { background: k.color, color: "#fff", borderColor: k.color }
                              : { background: "#fff", color: k.color, borderColor: "#E5E7EB" }
                          }
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: selected ? "#fff" : k.color }}
                          />
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Send + Preview */}
              <div className="lg:col-span-3 space-y-6">
                <div className={`${CARD} space-y-3`}>
                  <div className="text-[16px] font-bold text-[#0F172A] pb-2 border-b border-[#E5E7EB]">
                    إعدادات الإرسال
                  </div>

                  <button
                    onClick={() => setSchedule(false)}
                    className="w-full text-right rounded-[14px] p-3 border transition-all duration-200"
                    style={
                      !schedule
                        ? { background: "#059669", color: "#fff", borderColor: "#059669" }
                        : { background: "#fff", color: "#0F172A", borderColor: "#E5E7EB" }
                    }
                  >
                    <div className="flex items-center gap-2 text-[14px] font-bold">
                      <div
                        className="h-8 w-8 rounded-[10px] flex items-center justify-center"
                        style={{
                          background: !schedule ? "rgba(255,255,255,0.15)" : "#ECFDF5",
                          color: !schedule ? "#fff" : "#059669",
                        }}
                      >
                        <Zap className="h-4 w-4" strokeWidth={2.5} />
                      </div>
                      إرسال الآن
                    </div>
                    <p className="text-[11px] mt-1 mr-10" style={{ color: !schedule ? "rgba(255,255,255,0.85)" : "#475569" }}>
                      سيتم الإرسال فوراً لكل المستلمين
                    </p>
                  </button>

                  <button
                    onClick={() => setSchedule(true)}
                    className="w-full text-right rounded-[14px] p-3 border transition-all duration-200"
                    style={
                      schedule
                        ? { background: "#EA580C", color: "#fff", borderColor: "#EA580C" }
                        : { background: "#fff", color: "#0F172A", borderColor: "#E5E7EB" }
                    }
                  >
                    <div className="flex items-center gap-2 text-[14px] font-bold">
                      <div
                        className="h-8 w-8 rounded-[10px] flex items-center justify-center"
                        style={{
                          background: schedule ? "rgba(255,255,255,0.15)" : "#FFF7ED",
                          color: schedule ? "#fff" : "#EA580C",
                        }}
                      >
                        <CalendarClock className="h-4 w-4" strokeWidth={2.5} />
                      </div>
                      جدولة الإرسال
                    </div>
                    <p className="text-[11px] mt-1 mr-10" style={{ color: schedule ? "rgba(255,255,255,0.85)" : "#475569" }}>
                      تحديد وقت مستقبلي للإرسال
                    </p>
                  </button>

                  {schedule && (
                    <div className="flex gap-2 pt-1">
                      <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={`flex-1 ${INPUT}`} />
                      <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className={`w-32 ${INPUT}`} />
                    </div>
                  )}
                </div>

                {/* Preview */}
                <div className={CARD}>
                  <div className="text-[16px] font-bold text-[#0F172A] pb-2 border-b border-[#E5E7EB] mb-3">
                    معاينة
                  </div>
                  <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 rounded-[10px] bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-[#0F172A] line-clamp-1">
                          {title || "عنوان الإشعار سيظهر هنا"}
                        </div>
                        <div className="text-[12px] text-[#475569] line-clamp-3 mt-0.5">
                          {message || "محتوى الرسالة يظهر هنا..."}
                        </div>
                        <div className="text-[10px] text-[#94A3B8] mt-1.5">منذ لحظات</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary + Send */}
                <div className={`${CARD} space-y-3`}>
                  <div>
                    <div className="text-[12px] text-[#475569] font-semibold">إجمالي المستلمين</div>
                    <div className="text-[28px] font-bold text-[#0F172A] tabular-nums leading-none mt-1">
                      {recipients.length.toLocaleString("ar-EG")}
                      <span className="text-[14px] font-medium text-[#475569] mr-2">مستخدم</span>
                    </div>
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className="w-full h-12 rounded-[14px] font-bold text-[14px] flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
                      color: "#fff",
                      boxShadow: "0 8px 20px rgba(37,99,235,0.30)",
                    }}
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : scheduledAt ? <CalendarClock className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                    {scheduledAt ? "جدولة الإرسال" : "إرسال الإشعار"}
                  </button>
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
