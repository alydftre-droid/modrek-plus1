import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Send, Eye, EyeOff, CalendarClock, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = { total: number; today: number; read: number; unread: number; scheduled: number; failed: number };

const CARDS: { key: keyof Stats; label: string; icon: any; gradient: string; ring: string; badge: string }[] = [
  { key: "total",     label: "إجمالي الإشعارات", icon: Bell,          gradient: "from-indigo-500 to-indigo-600",    ring: "ring-indigo-200/60",   badge: "bg-indigo-50 text-indigo-700" },
  { key: "today",     label: "إشعارات اليوم",     icon: CalendarClock, gradient: "from-sky-500 to-blue-600",         ring: "ring-sky-200/60",      badge: "bg-sky-50 text-sky-700" },
  { key: "read",      label: "تمت القراءة",        icon: Eye,           gradient: "from-emerald-500 to-teal-600",     ring: "ring-emerald-200/60",  badge: "bg-emerald-50 text-emerald-700" },
  { key: "unread",    label: "غير المقروءة",       icon: EyeOff,        gradient: "from-amber-500 to-orange-500",     ring: "ring-amber-200/60",    badge: "bg-amber-50 text-amber-700" },
  { key: "scheduled", label: "مجدولة",             icon: Send,          gradient: "from-violet-500 to-purple-600",    ring: "ring-violet-200/60",   badge: "bg-violet-50 text-violet-700" },
  { key: "failed",    label: "فشل الإرسال",        icon: AlertTriangle, gradient: "from-rose-500 to-red-600",         ring: "ring-rose-200/60",     badge: "bg-rose-50 text-rose-700" },
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
          <div key={c.key} className={`group relative rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden ring-1 ${c.ring}`}>
            <div className={`absolute -top-8 -left-8 h-20 w-20 rounded-full bg-gradient-to-br ${c.gradient} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
            <div className="flex items-start justify-between mb-3 relative">
              <div className={`h-11 w-11 rounded-2xl flex items-center justify-center bg-gradient-to-br ${c.gradient} text-white shadow-md`}>
                <Icon className="h-5 w-5" strokeWidth={2.5} />
              </div>
              {readPct !== null && (
                <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${c.badge}`}>{readPct}%</span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-semibold mb-1 relative">{c.label}</div>
            {stats ? (
              <div className="text-2xl font-black text-slate-900 tabular-nums relative">{val?.toLocaleString("ar-EG") ?? 0}</div>
            ) : (
              <Skeleton className="h-8 w-16" />
            )}
          </div>
        );
      })}
    </div>
  );
}
