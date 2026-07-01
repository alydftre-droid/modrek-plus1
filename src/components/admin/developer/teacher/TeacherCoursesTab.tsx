import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { EmptyState } from "../shared/EmptyState";
import { BookOpen, RefreshCw } from "lucide-react";

interface Row {
  group_id: string; group_title: string; subject_name: string | null;
  grade: string | null; stage: string | null; price: number;
  students_count: number; revenue: number; videos_count: number;
  pdfs_count: number; created_at: string; is_active: boolean;
}

export function TeacherCoursesTab({ teacherId }: { teacherId: string }) {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["dev-teacher-courses", teacherId],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(supabase.rpc("get_developer_teacher_courses", { _teacher_id: teacherId }), "كورسات المعلم") ;
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 60_000,
    retry: false,
  });

  const grouped = useMemo(() => {
    const byGrade: Record<string, Row[]> = {};
    data.forEach((r) => {
      const k = r.grade || "غير محدد";
      (byGrade[k] ??= []).push(r);
    });
    return byGrade;
  }, [data]);

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string) => new Date(s).toLocaleDateString("ar-EG", { dateStyle: "short" });

  const columns: DataTableColumn<Row>[] = [
    { key: "title", header: "المجموعة", accessor: (r) => (
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${r.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
        <span className="font-semibold text-slate-900">{r.group_title}</span>
      </div>
    ), sortValue: (r) => r.group_title, exportValue: (r) => r.group_title },
    { key: "subject", header: "المادة", accessor: (r) => r.subject_name || "—", exportValue: (r) => r.subject_name || "" },
    { key: "price", header: "السعر", accessor: (r) => `${fmt(r.price)} ج`, sortValue: (r) => Number(r.price), exportValue: (r) => r.price },
    { key: "students", header: "الطلاب", accessor: (r) => fmt(r.students_count), sortValue: (r) => r.students_count, exportValue: (r) => r.students_count },
    { key: "revenue", header: "الإيراد", accessor: (r) => <span className="font-bold text-emerald-700">{fmt(r.revenue)} ج</span>, sortValue: (r) => Number(r.revenue), exportValue: (r) => r.revenue },
    { key: "videos", header: "فيديو", accessor: (r) => fmt(r.videos_count), sortValue: (r) => r.videos_count, exportValue: (r) => r.videos_count },
    { key: "pdfs", header: "PDF", accessor: (r) => fmt(r.pdfs_count), sortValue: (r) => r.pdfs_count, exportValue: (r) => r.pdfs_count },
    { key: "created", header: "تاريخ الإنشاء", accessor: (r) => dateFmt(r.created_at), sortValue: (r) => r.created_at, exportValue: (r) => dateFmt(r.created_at) },
  ];

  if (isLoading) return <div className="tm-stats-grid">{[...Array(4)].map((_, i) => <div key={i} className="h-44 rounded-[18px] bg-white border border-emerald-100 animate-pulse" />)}</div>;
  if (isError) {
    return (
      <div className="tm-panel">
        <div className="tm-panel-content text-center space-y-3">
          <h3 className="tm-section-title justify-center">تعذر تحميل الكورسات</h3>
          <button type="button" onClick={() => refetch()} className="tm-submit-btn px-6 inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }
  if (data.length === 0) {
    return <EmptyState icon={BookOpen} title="لا توجد كورسات" description="لم ينشئ المعلم أي مجموعة بعد." />;
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([grade, rows]) => (
        <div key={grade} className="tm-panel">
          <div className="tm-panel-content space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="h-6 w-1 rounded-full bg-emerald-500" />
              <h3 className="tm-section-title !mb-0 text-base">كورسات {grade}</h3>
              <span className="tm-chip tm-chip--mint !min-h-7 !text-xs">{rows.length} مجموعة</span>
            </div>
            <DataTable
              data={rows}
              columns={columns}
              searchable={(r) => `${r.group_title} ${r.subject_name ?? ""}`}
              title={`كورسات ${grade}`}
              exportName={`teacher-courses-${grade}`}
              pageSize={10}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
