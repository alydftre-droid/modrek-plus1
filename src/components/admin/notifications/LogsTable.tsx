import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye } from "lucide-react";

type Row = {
  title: string;
  message: string;
  created_at: string;
  notification_type: string | null;
  count: number;
  read_count: number;
  latest_id: string;
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
            title: r.title,
            message: r.message,
            created_at: r.created_at,
            notification_type: r.notification_type,
            count: 1,
            read_count: r.is_read ? 1 : 0,
            latest_id: r.id,
          });
        }
      });
      setRows([...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    })();
  }, [refreshKey]);

  const fmt = (d: string) => new Date(d).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="rounded-2xl bg-white border border-slate-200/70 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">سجل الإرسال</h3>
          <p className="text-xs text-slate-500 mt-0.5">آخر الإشعارات المرسلة من هذا الحساب</p>
        </div>
        <Badge variant="secondary" className="rounded-full">{rows?.length ?? "..."}</Badge>
      </div>
      <div className="overflow-x-auto">
        {rows === null ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-10">لا يوجد سجل بعد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-slate-500 border-b border-slate-100 bg-slate-50/50">
                <th className="text-right px-4 py-2.5 font-semibold">العنوان</th>
                <th className="text-right px-4 py-2.5 font-semibold">النوع</th>
                <th className="text-right px-4 py-2.5 font-semibold">المستلمين</th>
                <th className="text-right px-4 py-2.5 font-semibold">تمت القراءة</th>
                <th className="text-right px-4 py-2.5 font-semibold">التاريخ</th>
                <th className="text-left px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const readPct = r.count > 0 ? Math.round((r.read_count / r.count) * 100) : 0;
                return (
                  <tr key={r.latest_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 line-clamp-1">{r.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{r.message}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="rounded-full text-[10px]">{r.notification_type || "عادي"}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${readPct}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-600 tabular-nums">{readPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[12px] whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3 text-left">
                      <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
                        <Link to={`/admin/notifications/${r.latest_id}`}>
                          <Eye className="h-3.5 w-3.5" /> تفاصيل
                        </Link>
                      </Button>
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

