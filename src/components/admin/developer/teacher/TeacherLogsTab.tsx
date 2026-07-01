import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { useEffect } from "react";

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
};

export function TeacherLogsTab({ teacherId }: { teacherId: string }) {
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["dev-teacher-logs", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_teacher_logs", { _teacher_id: teacherId, _limit: 1000 });
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`teacher-logs-${teacherId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teacher_activity_logs", filter: `teacher_id=eq.${teacherId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teacherId, refetch]);

  const dateFmt = (s: string) => new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "medium" });
  const columns: DataTableColumn<Row>[] = [
    { key: "date", header: "التاريخ", accessor: (r) => dateFmt(r.created_at), exportValue: (r) => r.created_at, sortValue: (r) => r.created_at },
    { key: "action", header: "الحدث", accessor: (r) => ACTION_LABEL[r.action_type] || r.action_label || r.action_type, exportValue: (r) => ACTION_LABEL[r.action_type] || r.action_type },
    { key: "desc", header: "التفاصيل", accessor: (r) => r.description || "—", exportValue: (r) => r.description || "" },
    { key: "page", header: "الصفحة", accessor: (r) => r.page_path || "—", exportValue: (r) => r.page_path || "" },
    { key: "device", header: "الجهاز", accessor: (r) => [r.device_type, r.os, r.browser].filter(Boolean).join(" • ") || "—", exportValue: (r) => [r.device_type, r.os, r.browser].filter(Boolean).join(" / ") },
    { key: "ip", header: "IP", accessor: (r) => r.ip_address || "—", exportValue: (r) => r.ip_address || "" },
  ];

  return (
    <DataTable
      title="سجل أحداث المعلم (Audit Log)"
      data={data}
      columns={columns}
      isLoading={isLoading}
      searchable={(r) => `${r.action_type} ${r.action_label ?? ""} ${r.description ?? ""} ${r.page_path ?? ""} ${r.ip_address ?? ""} ${r.device_type ?? ""}`}
      exportName={`teacher-${teacherId.slice(0, 8)}-audit-log`}
      pageSize={25}
    />
  );
}
