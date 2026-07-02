import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Send, Eye, EyeOff, CalendarClock, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = { total: number; today: number; read: number; unread: number; scheduled: number; failed: number };

const CARDS: { key: keyof Stats; label: string; icon: any; tint: string; iconTint: string }[] = [
  { key: "total",     label: "إجمالي الإشعارات", icon: Bell,          tint: "bg-indigo-50",  iconTint: "text-indigo-600 bg-indigo-100" },
  { key: "today",     label: "إشعارات اليوم",     icon: CalendarClock, tint: "bg-sky-50",     iconTint: "text-sky-600 bg-sky-100" },
  { key: "read",      label: "تمت القراءة",        icon: Eye,           tint: "bg-emerald-50", iconTint: "text-emerald-600 bg-emerald-100" },
  { key: "unread",    label: "غير المقروءة",       icon: EyeOff,        tint: "bg-amber-50",   iconTint: "text-amber-600 bg-amber-100" },
  { key: "scheduled", label: "مجدولة",             icon: Send,          tint: "bg-violet-50",  iconTint: "text-violet-600 bg-violet-100" },
  { key: "failed",    label: "فشل الإرسال",        icon: AlertTriangle, tint: "bg-rose-50",    iconTint: "text-rose-600 bg-rose-100" },
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {CARDS.map((c) => {
        const Icon = c.icon;
        const val = stats?.[c.key];
        const readPct = c.key === "read" && stats && stats.total > 0
          ? Math.round((stats.read / stats.total) * 100) : null;
        return (
          <div key={c.key} className={`rounded-2xl bg-white border border-slate-200/70 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${c.iconTint}`}>
                <Icon className="h-5 w-5" />
              </div>
              {readPct !== null && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">{readPct}%</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mb-1">{c.label}</div>
            {stats ? (
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{val?.toLocaleString("ar-EG") ?? 0}</div>
            ) : (
              <Skeleton className="h-8 w-16" />
            )}
          </div>
        );
      })}
    </div>
  );
}
