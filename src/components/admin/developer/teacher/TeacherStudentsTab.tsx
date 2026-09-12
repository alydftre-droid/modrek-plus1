import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink, Users } from "lucide-react";
import StoredImage from "@/components/common/StoredImage";

interface Row {
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  grade: string | null;
  section: string | null;
  student_code: string | null;
  groups_count: number;
  total_paid: number;
  exams_count: number;
  avg_percentage: number;
  last_activity: string | null;
  first_purchase: string | null;
}

export function TeacherStudentsTab({ teacherId }: { teacherId: string }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["dev-teacher-students", teacherId],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(supabase.rpc("get_developer_teacher_students", { _teacher_id: teacherId }), "طلاب المعلم") ;
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    refetchInterval: 60_000,
    retry: false,
  });

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string | null) =>
    s ? new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—";

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "الطالب",
      accessor: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden text-xs font-bold text-slate-600">
            {r.avatar_url ? <StoredImage source={r.avatar_url} alt="" className="h-full w-full object-cover" /> : (r.full_name?.charAt(0) || "؟")}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{r.full_name || "—"}</div>
            <div className="text-[11px] text-slate-500">#{r.student_code || r.student_id.slice(0, 6)}</div>
          </div>
        </div>
      ),
      exportValue: (r) => r.full_name || "",
      sortValue: (r) => r.full_name || "",
    },
    { key: "grade", header: "الصف", accessor: (r) => r.grade || "—", exportValue: (r) => r.grade || "", sortValue: (r) => r.grade || "" },
    { key: "section", header: "الشعبة", accessor: (r) => r.section || "—", exportValue: (r) => r.section || "" },
    { key: "phone", header: "الهاتف", accessor: (r) => r.phone || "—", exportValue: (r) => r.phone || "" },
    { key: "groups", header: "المجموعات", accessor: (r) => fmt(r.groups_count), exportValue: (r) => r.groups_count, sortValue: (r) => r.groups_count },
    { key: "paid", header: "المدفوع", accessor: (r) => `${fmt(r.total_paid)} ج`, exportValue: (r) => r.total_paid, sortValue: (r) => r.total_paid },
    { key: "exams", header: "الامتحانات", accessor: (r) => fmt(r.exams_count), exportValue: (r) => r.exams_count, sortValue: (r) => r.exams_count },
    { key: "avg", header: "المتوسط", accessor: (r) => `${fmt(r.avg_percentage)}%`, exportValue: (r) => r.avg_percentage, sortValue: (r) => r.avg_percentage },
    { key: "last", header: "آخر نشاط", accessor: (r) => dateFmt(r.last_activity), exportValue: (r) => r.last_activity || "", sortValue: (r) => r.last_activity || "" },
    {
      key: "actions",
      header: "",
      accessor: (r) => (
        <Button size="sm" variant="outline" className="h-7 gap-1"
          onClick={() => navigate(`/admin?tab=students&studentId=${r.student_id}`)}>
          <ExternalLink className="h-3 w-3" /> فتح
        </Button>
      ),
    },
  ];

  return (
    <div className="tm-panel">
      <div className="tm-panel-content">
        <h4 className="tm-section-title"><Users className="h-4 w-4" /> الطلاب</h4>
        <DataTable
          title="طلاب المعلم"
          data={data}
          columns={columns}
          isLoading={isLoading}
          searchable={(r) => `${r.full_name ?? ""} ${r.email ?? ""} ${r.phone ?? ""} ${r.student_code ?? ""} ${r.grade ?? ""}`}
          exportName={`teacher-${teacherId.slice(0, 8)}-students`}
        />
      </div>
    </div>
  );
}
