import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Eye, History, Megaphone, Users } from "lucide-react";

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
    <div className="rounded-2xl bg-white/95 border border-indigo-100 overflow-hidden shadow-md shadow-indigo-100/60">
      <div className="px-5 py-4 border-b border-indigo-100 flex items-center justify-between bg-gradient-to-l from-indigo-50 via-blue-50 to-cyan-50">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
            <History className="h-4.5 w-4.5" />
          </div>
          <div>
          <h3 className="text-base font-black text-slate-900">سجل الإرسال</h3>
          <p className="text-xs text-slate-500 mt-0.5">آخر الإشعارات المرسلة من هذا الحساب</p>
          </div>
        </div>
        <Badge className="rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white border-0 shadow-sm">{rows?.length ?? "..."}</Badge>
      </div>
      <div className="overflow-x-auto">
        {rows === null ? (
          <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-10">لا يوجد سجل بعد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-indigo-900 border-b border-indigo-100 bg-gradient-to-l from-indigo-100 via-blue-100 to-cyan-100">
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
                  <tr key={r.latest_id} className="border-b border-indigo-50 hover:bg-blue-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 line-clamp-1">{r.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{r.message}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="rounded-full text-[10px] bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-0 shadow-sm"><Megaphone className="h-3 w-3 ml-1" />{r.notification_type || "عادي"}</Badge>
                    </td>
                    <td className="px-4 py-3 font-black text-blue-900"><span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1"><Users className="h-3.5 w-3.5 text-blue-700" />{r.count}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-emerald-100 overflow-hidden shadow-inner">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${readPct}%` }} />
                        </div>
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 tabular-nums font-bold"><CheckCircle2 className="h-3 w-3" />{readPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[12px] whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3 text-left">
                      <Button asChild size="sm" className="h-8 gap-1 bg-gradient-to-r from-blue-500 to-cyan-600 text-white hover:from-blue-600 hover:to-cyan-700 shadow-sm">
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

