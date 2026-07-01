import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "../shared/DataTable";

interface Row {
  group_id: string;
  group_title: string;
  grade: string | null;
  stage: string | null;
  subject_name: string | null;
  price: number;
  students_count: number;
  revenue: number;
  new_today: number;
  new_month: number;
}

export function TeacherSubscriptionsTab({ teacherId }: { teacherId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["dev-teacher-subs", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_teacher_subscriptions", { _teacher_id: teacherId });
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 60_000,
  });

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const columns: DataTableColumn<Row>[] = [
    { key: "title", header: "المجموعة", accessor: (r) => r.group_title, exportValue: (r) => r.group_title, sortValue: (r) => r.group_title },
    { key: "subject", header: "المادة", accessor: (r) => r.subject_name || "—", exportValue: (r) => r.subject_name || "" },
    { key: "grade", header: "الصف", accessor: (r) => r.grade || "—" },
    { key: "price", header: "السعر", accessor: (r) => `${fmt(r.price)} ج`, exportValue: (r) => r.price, sortValue: (r) => r.price },
    { key: "students", header: "المشتركون", accessor: (r) => fmt(r.students_count), exportValue: (r) => r.students_count, sortValue: (r) => r.students_count },
    { key: "revenue", header: "الإيراد", accessor: (r) => `${fmt(r.revenue)} ج`, exportValue: (r) => r.revenue, sortValue: (r) => r.revenue },
    { key: "today", header: "جدد اليوم", accessor: (r) => fmt(r.new_today), exportValue: (r) => r.new_today, sortValue: (r) => r.new_today },
    { key: "month", header: "جدد الشهر", accessor: (r) => fmt(r.new_month), exportValue: (r) => r.new_month, sortValue: (r) => r.new_month },
  ];

  return (
    <DataTable
      title="اشتراكات المعلم"
      data={data}
      columns={columns}
      isLoading={isLoading}
      searchable={(r) => `${r.group_title} ${r.subject_name ?? ""} ${r.grade ?? ""}`}
      exportName={`teacher-${teacherId.slice(0, 8)}-subs`}
    />
  );
}
