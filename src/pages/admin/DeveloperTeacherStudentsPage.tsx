import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "@/components/admin/developer/shared/DataTable";
import { PageHeader } from "@/components/admin/developer/shared/PageHeader";
import { GradeChipFilter } from "@/components/admin/developer/shared/GradeChipFilter";
import { EmptyState } from "@/components/admin/developer/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { ExternalLink, Users } from "lucide-react";
import StoredImage from "@/components/common/StoredImage";

interface Row {
  student_id: string; full_name: string; avatar_url: string | null;
  email: string | null; phone: string | null; stage: string | null;
  grade: string | null; section: string | null; student_code: string | null;
  groups_count: number; total_paid: number;
  first_purchase: string | null; last_activity: string | null;
}

export default function DeveloperTeacherStudentsPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const [gradeF, setGradeF] = useState("all");
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    if (!teacherId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", teacherId).maybeSingle();
      if (data?.full_name) setTeacherName(data.full_name);
    })();
  }, [teacherId]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["dev-teacher-students-by-grade", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_teacher_students_by_grade", { _teacher_id: teacherId! });
      if (error) throw error;
      return (data as unknown as Row[]) || [];
    },
    enabled: !!teacherId,
    refetchInterval: 60_000,
  });

  const chips = useMemo(() => {
    const byGrade: Record<string, number> = {};
    data.forEach((r) => {
      const k = r.grade || "غير محدد";
      byGrade[k] = (byGrade[k] || 0) + 1;
    });
    return Object.entries(byGrade).map(([k, count]) => ({ key: k, label: k, count }));
  }, [data]);

  const filtered = useMemo(() => gradeF === "all" ? data : data.filter((r) => (r.grade || "غير محدد") === gradeF), [data, gradeF]);

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string | null) => s ? new Date(s).toLocaleDateString("ar-EG", { dateStyle: "short" }) : "—";

  const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "الطالب", accessor: (r) => (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden text-xs font-bold text-slate-600">
          {r.avatar_url ? <StoredImage source={r.avatar_url} alt="" className="h-full w-full object-cover" /> : (r.full_name?.charAt(0) || "؟")}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{r.full_name || "—"}</div>
          <div className="text-[11px] text-slate-500">#{r.student_code || r.student_id.slice(0, 6)}</div>
        </div>
      </div>
    ), sortValue: (r) => r.full_name || "", exportValue: (r) => r.full_name || "" },
    { key: "grade", header: "الصف", accessor: (r) => r.grade || "—", sortValue: (r) => r.grade || "", exportValue: (r) => r.grade || "" },
    { key: "section", header: "الشعبة", accessor: (r) => r.section || "—", exportValue: (r) => r.section || "" },
    { key: "phone", header: "الهاتف", accessor: (r) => r.phone || "—", exportValue: (r) => r.phone || "" },
    { key: "groups", header: "المجموعات", accessor: (r) => fmt(r.groups_count), sortValue: (r) => r.groups_count, exportValue: (r) => r.groups_count },
    { key: "paid", header: "إجمالي المدفوع", accessor: (r) => <span className="font-bold text-emerald-700">{fmt(Number(r.total_paid))} ج</span>, sortValue: (r) => Number(r.total_paid), exportValue: (r) => r.total_paid },
    { key: "first", header: "أول اشتراك", accessor: (r) => dateFmt(r.first_purchase), sortValue: (r) => r.first_purchase || "", exportValue: (r) => dateFmt(r.first_purchase) },
    { key: "last", header: "آخر نشاط", accessor: (r) => dateFmt(r.last_activity), sortValue: (r) => r.last_activity || "", exportValue: (r) => dateFmt(r.last_activity) },
    { key: "actions", header: "", accessor: (r) => (
      <Button size="sm" variant="outline" className="h-7 gap-1"
        onClick={() => navigate(`/admin?tab=students&studentId=${r.student_id}`)}>
        <ExternalLink className="h-3 w-3" /> فتح
      </Button>
    ) },
  ];

  if (!teacherId) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        <PageHeader
          title={`طلاب المعلم ${teacherName ? "— " + teacherName : ""}`}
          subtitle={`الإجمالي: ${fmt(data.length)} طالب`}
          backTo={`/admin/developer/teacher/${teacherId}`}
        />

        {chips.length > 0 && <GradeChipFilter chips={chips} active={gradeF} onChange={setGradeF} />}

        {data.length === 0 && !isLoading ? (
          <EmptyState icon={Users} title="لا يوجد طلاب" description="لم يشترك أي طالب مع هذا المعلم بعد." />
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            searchable={(r) => `${r.full_name ?? ""} ${r.email ?? ""} ${r.phone ?? ""} ${r.student_code ?? ""} ${r.grade ?? ""} ${r.section ?? ""}`}
            title="قائمة الطلاب"
            exportName={`teacher-${teacherId.slice(0, 8)}-students`}
            isLoading={isLoading}
            pageSize={25}
          />
        )}
      </div>
    </div>
  );
}
