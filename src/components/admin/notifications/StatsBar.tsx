import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Send, Eye, EyeOff, CalendarClock, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = { total: number; today: number; read: number; unread: number; scheduled: number; failed: number };

/* Each stat = white card, tiny top color strip, colored icon, colored number. */
const CARDS: { key: keyof Stats; label: string; icon: any; color: string; tint: string }[] = [
  { key: "total",     label: "إجمالي الإشعارات", icon: Bell,          color: "#2563EB", tint: "#EFF6FF" },
  { key: "today",     label: "إشعارات اليوم",     icon: CalendarClock, color: "#7C3AED", tint: "#F5F3FF" },
  { key: "read",      label: "تمت القراءة",        icon: Eye,           color: "#059669", tint: "#ECFDF5" },
  { key: "unread",    label: "غير المقروءة",       icon: EyeOff,        color: "#F59E0B", tint: "#FFFBEB" },
  { key: "scheduled", label: "قيد الجدولة",        icon: Send,          color: "#EA580C", tint: "#FFF7ED" },
  { key: "failed",    label: "فشل الإرسال",        icon: AlertTriangle, color: "#DC2626", tint: "#FEF2F2" },
];

export default function StatsBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [all, todayCount, readCount, unreadCount, scheduledCount] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }),
        supabase.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", true),
        supabase.from("notifications").select("id", { count: "exact", head: true }).or("is_read.eq.false,is_read.is.null"),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_sent", false).not("scheduled_at", "is", null),
      ]);
      setStats({
        total: all.count || 0,
        today: todayCount.count || 0,
        read: readCount.count || 0,
        unread: unreadCount.count || 0,
        scheduled: scheduledCount.count || 0,
        failed: 0,
      });
    })();
  }, [refreshKey]);

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}
    >
      {CARDS.map((c) => {
        const Icon = c.icon;
        const val = stats?.[c.key];
        const readPct = c.key === "read" && stats && stats.total > 0
          ? Math.round((stats.read / stats.total) * 100) : null;
        return (
          <div
            key={c.key}
            className="relative bg-white rounded-[20px] border border-[#E5E7EB] p-5 shadow-[0_8px_25px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] transition-all duration-200 overflow-hidden"
          >
            {/* Top color strip */}
            <div
              className="absolute top-0 left-0 right-0 h-1 rounded-t-[20px]"
              style={{ background: c.color }}
            />
            <div className="flex items-center justify-between mb-3">
              <div
                className="h-11 w-11 rounded-[12px] flex items-center justify-center"
                style={{ background: c.tint, color: c.color }}
              >
                <Icon className="h-5 w-5" strokeWidth={2.5} />
              </div>
              {readPct !== null && (
                <span
                  className="text-[11px] font-bold rounded-full px-2.5 py-1"
                  style={{ background: c.tint, color: c.color }}
                >
                  {readPct}%
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#475569] font-semibold mb-1">{c.label}</div>
            {stats ? (
              <div className="text-[26px] font-bold tabular-nums leading-none" style={{ color: c.color }}>
                {val?.toLocaleString("ar-EG") ?? 0}
              </div>
            ) : (
              <Skeleton className="h-8 w-16" />
            )}
          </div>
        );
      })}
    </div>
  );
}
