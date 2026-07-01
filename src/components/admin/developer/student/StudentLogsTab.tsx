import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { StatCard } from "../shared/StatCard";
import { Activity, Clock3, LogIn, LogOut } from "lucide-react";

interface LogRow {
  id: string;
  student_id: string;
  action_type: string;
  action_label: string | null;
  description: string | null;
  page_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  session_id: string | null;
  duration_seconds: number | null;
  metadata: any;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  video_open: "فتح فيديو",
  video_close: "إغلاق فيديو",
  video_watch: "مشاهدة فيديو",
  pdf_open: "فتح PDF",
  pdf_download: "تحميل PDF",
  exam_start: "بدء امتحان",
  exam_submit: "تسليم امتحان",
  exam_abandon: "ترك امتحان",
  group_purchase: "شراء اشتراك",
  subscribe: "اشتراك",
  unsubscribe: "إلغاء اشتراك",
  page_view: "عرض صفحة",
  profile_update: "تعديل بيانات",
  password_change: "تغيير كلمة السر",
};

const fmt = (v: string) => new Date(v).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "medium" });

export function StudentLogsTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("student_activity_logs")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error && data) setRows(data as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`activity-${studentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "student_activity_logs", filter: `student_id=eq.${studentId}` },
        (payload) => {
          setRows((prev) => [payload.new as LogRow, ...prev].slice(0, 1000));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const summary = useMemo(() => {
    const total = rows.length;
    const logins = rows.filter((r) => r.action_type === "login").length;
    const logouts = rows.filter((r) => r.action_type === "logout").length;
    const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean)).size;
    return { total, logins, logouts, sessions };
  }, [rows]);

  const columns: DataTableColumn<LogRow>[] = [
    { key: "date", header: "التاريخ", accessor: (r) => <span className="text-slate-700 tabular-nums">{fmt(r.created_at)}</span>, sortValue: (r) => r.created_at, exportValue: (r) => fmt(r.created_at) },
    { key: "type", header: "العملية", accessor: (r) => (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
          {ACTION_LABELS[r.action_type] ?? r.action_type}
        </span>
      ), exportValue: (r) => ACTION_LABELS[r.action_type] ?? r.action_type },
    { key: "desc", header: "الوصف", accessor: (r) => <span className="text-slate-600">{r.action_label || r.description || "—"}</span>, exportValue: (r) => r.action_label || r.description || "" },
    { key: "page", header: "الصفحة", accessor: (r) => <code className="text-xs text-slate-500">{r.page_path || "—"}</code>, exportValue: (r) => r.page_path || "" },
    { key: "device", header: "الجهاز", accessor: (r) => r.device_type || "—", exportValue: (r) => r.device_type || "" },
    { key: "os", header: "النظام", accessor: (r) => r.os || "—", exportValue: (r) => r.os || "" },
    { key: "browser", header: "المتصفح", accessor: (r) => r.browser || "—", exportValue: (r) => r.browser || "" },
    { key: "ip", header: "IP", accessor: (r) => r.ip_address || "—", exportValue: (r) => r.ip_address || "" },
    { key: "dur", header: "المدة (ث)", accessor: (r) => r.duration_seconds ?? "—", exportValue: (r) => r.duration_seconds ?? "" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي السجلات" value={summary.total.toLocaleString("ar-EG")} icon={Activity} accent="blue" />
        <StatCard label="عدد الجلسات" value={summary.sessions.toLocaleString("ar-EG")} icon={Clock3} accent="purple" />
        <StatCard label="تسجيلات الدخول" value={summary.logins.toLocaleString("ar-EG")} icon={LogIn} accent="green" />
        <StatCard label="تسجيلات الخروج" value={summary.logouts.toLocaleString("ar-EG")} icon={LogOut} accent="amber" />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchable={(r) => `${ACTION_LABELS[r.action_type] ?? r.action_type} ${r.description ?? ""} ${r.action_label ?? ""} ${r.page_path ?? ""} ${r.browser ?? ""} ${r.os ?? ""}`}
        title="سجل نشاط الطالب (Audit Log)"
        exportName={`student-logs-${studentId.slice(0, 8)}`}
        isLoading={loading}
        pageSize={20}
        emptyLabel="لا توجد سجلات نشاط بعد"
      />
    </div>
  );
}
