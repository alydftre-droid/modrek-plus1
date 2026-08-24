import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight, Bell, CheckCircle2, Clock, Download, FileSpreadsheet,
  FileText, RefreshCw, Search, Send, Users, XCircle,
} from "lucide-react";
import { exportCsv, exportPdfFromElement, exportXlsx } from "@/components/admin/notifications/exports";

type Recipient = {
  id: string;
  user_id: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  scheduled_at: string | null;
  is_sent: boolean;
  full_name: string;
  student_code: string | null;
  teacher_code: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
};

type Meta = {
  title: string;
  message: string;
  notification_type: string;
  created_at: string;
  link: string | null;
};

export default function NotificationDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "read" | "unread">("all");
  const [resending, setResending] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    setRows(null);
    const { data: seed } = await supabase.from("notifications")
      .select("id, title, message, notification_type, created_at, link")
      .eq("id", id).maybeSingle();
    if (!seed) { toast.error("الإشعار غير موجود"); return; }
    setMeta(seed as any);

    // Group siblings by title+message+minute bucket
    const bucket = new Date(seed.created_at); bucket.setSeconds(0, 0);
    const from = bucket.toISOString();
    const to = new Date(bucket.getTime() + 60_000).toISOString();

    const { data } = await supabase.from("notifications")
      .select("id, user_id, is_read, created_at, scheduled_at, is_sent, profiles:user_id(full_name, student_code, teacher_code, phone, email, role)")
      .eq("title", seed.title).eq("message", seed.message)
      .gte("created_at", from).lt("created_at", to)
      .limit(5000);

    const mapped: Recipient[] = (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      is_read: !!r.is_read,
      read_at: null, // no dedicated column; use is_read + created_at
      created_at: r.created_at,
      scheduled_at: r.scheduled_at,
      is_sent: !!r.is_sent,
      full_name: r.profiles?.full_name || "—",
      student_code: r.profiles?.student_code || null,
      teacher_code: r.profiles?.teacher_code || null,
      phone: r.profiles?.phone || null,
      email: r.profiles?.email || null,
      role: r.profiles?.role || null,
    }));
    setRows(mapped);
  };

  useEffect(() => { load();  }, [id]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let r = rows;
    if (tab === "read") r = r.filter((x) => x.is_read);
    if (tab === "unread") r = r.filter((x) => !x.is_read);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((x) =>
      (x.full_name || "").toLowerCase().includes(q) ||
      (x.phone || "").toLowerCase().includes(q) ||
      (x.email || "").toLowerCase().includes(q) ||
      (x.student_code || "").toLowerCase().includes(q) ||
      (x.teacher_code || "").toLowerCase().includes(q)
    );
    return r;
  }, [rows, tab, search]);

  const stats = useMemo(() => {
    const total = rows?.length || 0;
    const read = rows?.filter((r) => r.is_read).length || 0;
    const unread = total - read;
    const sent = rows?.filter((r) => r.is_sent).length || 0;
    const pending = total - sent;
    return { total, read, unread, sent, pending, pct: total ? Math.round((read / total) * 100) : 0 };
  }, [rows]);

  const exportRows = useMemo(() => filtered.map((r) => ({
    "الاسم": r.full_name,
    "الدور": r.role || "",
    "الكود": r.student_code || r.teacher_code || "",
    "الهاتف": r.phone || "",
    "البريد": r.email || "",
    "الحالة": r.is_read ? "قرأ" : (r.is_sent ? "لم يقرأ" : "مجدول"),
    "تاريخ الإرسال": new Date(r.created_at).toLocaleString("ar-EG"),
  })), [filtered]);

  const doExport = async (fmt: "csv" | "xlsx" | "pdf") => {
    const base = `notification-${(meta?.title || "log").slice(0, 30)}`;
    if (fmt === "csv") exportCsv(base, exportRows);
    else if (fmt === "xlsx") exportXlsx(base, exportRows, "المستلمون");
    else if (fmt === "pdf" && printRef.current) {
      toast.info("جاري توليد PDF...");
      await exportPdfFromElement(base, printRef.current);
    }
  };

  const resendUnread = async () => {
    if (!meta || !rows) return;
    const unread = rows.filter((r) => !r.is_read).map((r) => r.user_id);
    if (unread.length === 0) { toast.info("لا يوجد مستخدمون لم يقرأوا"); return; }
    setResending(true);
    try {
      const chunk = 500;
      for (let i = 0; i < unread.length; i += chunk) {
        const batch = unread.slice(i, i + chunk).map((uid) => ({
          user_id: uid,
          title: meta.title,
          message: meta.message,
          notification_type: meta.notification_type,
          link: meta.link,
          is_sent: true,
        }));
        const { error } = await supabase.from("notifications").insert(batch as any);
        if (error) throw error;
      }
      toast.success(`تم إعادة الإرسال إلى ${unread.length} مستخدم`);
    } catch (e: any) {
      toast.error(e?.message || "فشل الإرسال");
    } finally { setResending(false); }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-sky-50 via-indigo-50/80 to-emerald-50/70 -m-4 md:-m-6 lg:-m-8 p-4 md:p-6 lg:p-8" dir="rtl">
      <div className="max-w-[1200px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button size="icon" className="h-9 w-9 bg-gradient-to-br from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 shadow-md shadow-indigo-500/25" onClick={() => navigate(-1)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">تفاصيل الإشعار</h1>
              <p className="text-xs text-slate-500 mt-0.5">قراءة وتصدير وإعادة إرسال</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={load} className="gap-2 h-9 bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700 shadow-sm">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2 h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-sm">
                  <Download className="h-4 w-4" /> تصدير
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => doExport("csv")} className="gap-2">
                  <FileText className="h-4 w-4" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("xlsx")} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("pdf")} className="gap-2">
                  <FileText className="h-4 w-4" /> PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Preview card */}
        {meta ? (
          <div className="rounded-2xl bg-white/95 border border-indigo-100 p-5 shadow-md shadow-indigo-100/60">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Bell className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge className="rounded-full text-[10px] bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-0 shadow-sm">{meta.notification_type || "عادي"}</Badge>
                  <span className="text-[11px] text-slate-500">{new Date(meta.created_at).toLocaleString("ar-EG")}</span>
                </div>
                <div className="text-lg font-bold text-slate-900">{meta.title}</div>
                <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{meta.message}</div>
                {meta.link && <div className="text-[11px] text-indigo-600 mt-1.5">🔗 {meta.link}</div>}
              </div>
            </div>
          </div>
        ) : <Skeleton className="h-32 rounded-2xl" />}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="المستلمون" value={stats.total} icon={<Users className="h-4 w-4" />} tone="indigo" />
          <StatCard label="تمت القراءة" value={stats.read} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" hint={`${stats.pct}%`} />
          <StatCard label="لم يقرأ" value={stats.unread} icon={<XCircle className="h-4 w-4" />} tone="amber" />
          <StatCard label="مجدول" value={stats.pending} icon={<Clock className="h-4 w-4" />} tone="slate" />
        </div>

        {/* Toolbar */}
        <div className="rounded-2xl bg-white/95 border border-blue-100 p-4 flex flex-col md:flex-row md:items-center gap-3 shadow-md shadow-blue-100/60">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم / الكود / الهاتف..." className="pr-9 bg-blue-50 border-blue-200 focus-visible:ring-blue-400" />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-900 to-blue-900 p-1 shadow-sm">
            {[
              { k: "all", l: "الكل" },
              { k: "read", l: `قرأوا (${stats.read})` },
              { k: "unread", l: `لم يقرأوا (${stats.unread})` },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.k ? "bg-gradient-to-r from-cyan-600 to-blue-700 text-white shadow-md shadow-cyan-500/25" : "text-white/80 hover:bg-white/15 hover:text-white"
                }`}
              >{t.l}</button>
            ))}
          </div>
          <Button onClick={resendUnread} disabled={resending || stats.unread === 0} className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-sm disabled:opacity-60">
            <Send className="h-3.5 w-3.5" /> إعادة إرسال لغير القارئين
          </Button>
        </div>

        {/* Recipients table */}
        <div ref={printRef} className="rounded-2xl bg-white/95 border border-indigo-100 overflow-hidden shadow-md shadow-indigo-100/60">
          <div className="overflow-x-auto">
            {rows === null ? (
              <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-sm text-slate-500 py-10">لا توجد نتائج مطابقة.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-indigo-900 border-b border-indigo-100 bg-gradient-to-l from-indigo-100 via-blue-100 to-cyan-100">
                    <th className="text-right px-4 py-2.5 font-semibold">المستخدم</th>
                    <th className="text-right px-4 py-2.5 font-semibold">الدور</th>
                    <th className="text-right px-4 py-2.5 font-semibold">التواصل</th>
                    <th className="text-right px-4 py-2.5 font-semibold">الحالة</th>
                    <th className="text-right px-4 py-2.5 font-semibold">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((r) => (
                    <tr key={r.id} className="border-b border-indigo-50 hover:bg-blue-50/70 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{r.full_name}</div>
                        <div className="text-[10px] text-slate-500">#{r.student_code || r.teacher_code || "—"}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-[12px]">{r.role === "teacher" ? "معلم" : r.role === "student" ? "طالب" : r.role || "—"}</td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-600">
                        <div>{r.phone || "—"}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{r.email || ""}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.is_read ? (
                          <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 rounded-full text-[10px] shadow-sm">قرأ</Badge>
                        ) : !r.is_sent ? (
                          <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white border-0 rounded-full text-[10px] shadow-sm">مجدول</Badge>
                        ) : (
                          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 rounded-full text-[10px] shadow-sm">لم يقرأ</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-[11px] whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {filtered.length > 500 && (
            <div className="p-3 text-center text-[11px] text-slate-500 border-t">
              يتم عرض 500 من أصل {filtered.length}. صدّر إلى Excel للحصول على القائمة الكاملة.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, tone, hint }: any) {
  const tones: Record<string, string> = {
    indigo: "from-indigo-500 to-indigo-600",
    emerald: "from-emerald-500 to-emerald-600",
    amber: "from-amber-500 to-orange-500",
    slate: "from-slate-500 to-slate-600",
  };
  return (
    <div className="rounded-2xl bg-white/95 border border-indigo-100 p-4 shadow-md shadow-indigo-100/50">
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${tones[tone]} text-white flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        {hint && <span className="text-[10px] text-slate-400 font-semibold">{hint}</span>}
      </div>
      <div className="text-2xl font-bold text-slate-900 tabular-nums mt-2">{value.toLocaleString("ar-EG")}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
