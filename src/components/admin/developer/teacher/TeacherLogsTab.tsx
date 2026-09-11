import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { EmptyState } from "../shared/EmptyState";
import { Activity, CalendarRange, Filter, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Row {
  id: string;
  action_type: string;
  action_label: string | null;
  description: string | null;
  page_path: string | null;
  ip_address: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  session_id: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  content_created: "رفع محتوى",
  content_updated: "تعديل محتوى",
  content_deleted: "حذف محتوى",
  exam_created: "إنشاء امتحان",
  exam_updated: "تعديل امتحان",
  exam_deleted: "حذف امتحان",
  question_added: "إضافة سؤال",
  question_updated: "تعديل سؤال",
  question_deleted: "حذف سؤال",
  group_created: "إنشاء مجموعة",
  group_updated: "تعديل مجموعة",
  group_deleted: "حذف مجموعة",
  earning_received: "استلام أرباح",
  profile_updated: "تعديل البيانات",
  password_changed: "تغيير كلمة السر",
  withdrawal_requested: "طلب سحب",
  notification_sent: "إرسال إشعار",
};

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function TeacherLogsTab({ teacherId }: { teacherId: string }) {
  const [actionType, setActionType] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data = [], isLoading, isError, refetch, error } = useQuery({
    queryKey: ["dev-teacher-logs", teacherId],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(
        supabase.rpc("get_developer_teacher_logs", { _teacher_id: teacherId, _limit: 2000 }),
        "سجلات المعلم",
      );
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isError) toast.error("تعذر تحميل السجلات", { description: (error as Error)?.message });
  }, [isError, error]);

  useEffect(() => {
    const ch = supabase
      .channel(`teacher-logs-${teacherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "teacher_activity_logs", filter: `teacher_id=eq.${teacherId}` },
        () => refetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teacherId, refetch]);

  // Restrict to last 90 days
  const cutoff90 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.getTime();
  }, []);

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => set.add(r.action_type));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86_400_000 : null;
    return data.filter((r) => {
      const ts = new Date(r.created_at).getTime();
      if (ts < cutoff90) return false;
      if (actionType !== "all" && r.action_type !== actionType) return false;
      if (month !== "all" && String(new Date(r.created_at).getMonth()) !== month) return false;
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    });
  }, [data, cutoff90, actionType, month, dateFrom, dateTo]);

  const dateFmt = (s: string) =>
    new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "medium" });

  const columns: DataTableColumn<Row>[] = [
    { key: "date", header: "التاريخ", accessor: (r) => dateFmt(r.created_at), exportValue: (r) => r.created_at, sortValue: (r) => r.created_at },
    { key: "action", header: "الحدث", accessor: (r) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
          {ACTION_LABEL[r.action_type] || r.action_label || r.action_type}
        </span>
      ), exportValue: (r) => ACTION_LABEL[r.action_type] || r.action_type },
    { key: "desc", header: "التفاصيل", accessor: (r) => <span className="text-xs text-slate-600">{r.description || "—"}</span>, exportValue: (r) => r.description || "" },
    { key: "page", header: "الصفحة", accessor: (r) => <span className="text-xs text-slate-500">{r.page_path || "—"}</span>, exportValue: (r) => r.page_path || "" },
    { key: "device", header: "الجهاز", accessor: (r) => [r.device_type, r.os, r.browser].filter(Boolean).join(" • ") || "—", exportValue: (r) => [r.device_type, r.os, r.browser].filter(Boolean).join(" / ") },
    { key: "ip", header: "IP", accessor: (r) => <span className="tabular-nums text-xs">{r.ip_address || "—"}</span>, exportValue: (r) => r.ip_address || "" },
  ];

  const resetFilters = () => {
    setActionType("all"); setMonth("all"); setDateFrom(""); setDateTo("");
  };

  if (isError) {
    return (
      <div className="tm-panel">
        <div className="tm-panel-content text-center space-y-3">
          <h3 className="tm-section-title justify-center">تعذر تحميل السجلات</h3>
          <button type="button" onClick={() => refetch()} className="tm-submit-btn px-6 inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tm-panel">
      <div className="tm-panel-content space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="tm-section-title !mb-0"><Activity className="h-4 w-4" /> السجلات — آخر 90 يومًا</h4>
          <span className="tm-chip tm-chip--mint !min-h-7 !text-xs">{filtered.length.toLocaleString("ar-EG")} حدث</span>
        </div>

        {!isLoading && data.length === 0 ? (
          <EmptyState icon={Activity} title="لا يوجد نشاط" description="لم يُسجَّل أي نشاط للمعلم في آخر 90 يومًا." />
        ) : (
          <DataTable
            title="سجل أحداث المعلم"
            data={filtered}
            columns={columns}
            isLoading={isLoading}
            searchable={(r) =>
              `${r.action_type} ${r.action_label ?? ""} ${r.description ?? ""} ${r.page_path ?? ""} ${r.ip_address ?? ""} ${r.device_type ?? ""}`
            }
            exportName={`teacher-${teacherId.slice(0, 8)}-audit-log`}
            pageSize={25}
            filters={
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[150px]">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" /> نوع العملية
                  </label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {availableActions.map((a) => (
                        <SelectItem key={a} value={a}>{ACTION_LABEL[a] || a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[130px]">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">الشهر</label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الشهور</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <CalendarRange className="h-3 w-3" /> من
                  </label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm w-[140px] bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">إلى</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm w-[140px] bg-white" />
                </div>
                {(actionType !== "all" || month !== "all" || dateFrom || dateTo) && (
                  <button type="button" onClick={resetFilters}
                    className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50">
                    إعادة تعيين
                  </button>
                )}
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
