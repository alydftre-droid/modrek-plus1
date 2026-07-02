import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleCheck, Eye, History, Users } from "lucide-react";

type Row = {
  title: string;
  message: string;
  created_at: string;
  notification_type: string | null;
  count: number;
  read_count: number;
  latest_id: string;
};

const TYPE_COLOR: Record<string, string> = {
  normal:       "#2563EB",
  important:    "#F59E0B",
  urgent:       "#DC2626",
  warning:      "#EA580C",
  announcement: "#7C3AED",
  update:       "#059669",
};

export default function LogsTable({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      setRows(null);
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, created_at, notification_type, is_read, user_id")
        .eq("is_sent", true)
        .order("created_at", { ascending: false })
        .limit(500);
      const map = new Map<string, Row>();
      (data || []).forEach((r: any) => {
        const bucket = new Date(r.created_at); bucket.setSeconds(0, 0);
        const key = `${r.title}|${r.message}|${bucket.toISOString()}`;
        const ex = map.get(key);
        if (ex) {
          ex.count += 1;
          if (r.is_read) ex.read_count += 1;
        } else {
          map.set(key, {
            title: r.title, message: r.message, created_at: r.created_at,
            notification_type: r.notification_type,
            count: 1, read_count: r.is_read ? 1 : 0, latest_id: r.id,
          });
        }
      });
      setRows([...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    })();
  }, [refreshKey]);

  const fmt = (d: string) => new Date(d).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });

  return (
    <div
      className="bg-white rounded-[20px] border border-[#E5E7EB] shadow-[0_8px_25px_rgba(15,23,42,0.06)] overflow-hidden"
      style={{ fontFamily: '"Cairo", system-ui, sans-serif' }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[12px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
            <History className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-[#0F172A]">سجل الإرسال</h3>
            <p className="text-[12px] text-[#475569] font-medium">آخر الإشعارات المرسلة من هذا الحساب</p>
          </div>
        </div>
        <span className="h-9 px-3 rounded-full text-[12px] font-bold bg-[#2563EB] text-white inline-flex items-center">
          {rows?.length ?? "..."}
        </span>
      </div>

      {/* Body */}
      <div className="overflow-x-auto">
        {rows === null ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-[13px] text-[#94A3B8] py-14 font-semibold">لا يوجد سجل بعد.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase text-[#334155] border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <th className="text-right px-4 py-3 font-bold">العنوان</th>
                <th className="text-right px-4 py-3 font-bold">النوع</th>
                <th className="text-right px-4 py-3 font-bold">المستلمين</th>
                <th className="text-right px-4 py-3 font-bold">تمت القراءة</th>
                <th className="text-right px-4 py-3 font-bold">التاريخ</th>
                <th className="text-left px-4 py-3 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const readPct = r.count > 0 ? Math.round((r.read_count / r.count) * 100) : 0;
                const typeColor = TYPE_COLOR[r.notification_type || "normal"] || "#2563EB";
                return (
                  <tr key={r.latest_id} className="border-b border-[#F1F5F9] hover:bg-[#EFF6FF] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#0F172A] line-clamp-1">{r.title}</div>
                      <div className="text-[11px] text-[#475569] line-clamp-1">{r.message}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                        style={{ background: typeColor }}
                      >
                        {r.notification_type || "عادي"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] text-[#2563EB] px-2.5 py-1 text-[12px] font-bold tabular-nums">
                        <Users className="h-3.5 w-3.5" />{r.count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[#E5E7EB] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${readPct}%`, background: "#059669" }} />
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#059669] tabular-nums">
                          <CircleCheck className="h-3 w-3" />{readPct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#475569] text-[12px] whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3 text-left">
                      <Link
                        to={`/admin/notifications/${r.latest_id}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-[12px] font-bold bg-[#7C3AED] text-white hover:bg-[#6D28D9] transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" /> تفاصيل
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
