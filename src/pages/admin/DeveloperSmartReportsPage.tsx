import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/admin/developer/shared/StatCard";
import { DataTable, DataTableColumn } from "@/components/admin/developer/shared/DataTable";
import { AlertTriangle, GraduationCap, PlayCircle, Trophy, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SmartReports {
  top_students: { student_id: string; full_name: string; avg_percentage: number; exams_count: number }[];
  top_teachers: { teacher_id: string; full_name: string; students: number; revenue: number }[];
  top_courses: { content_id: string; title: string; views: number }[];
  inactive_teachers: { teacher_id: string; full_name: string; last_content: string | null }[];
}

const fmtCur = (v: number) => `${(v ?? 0).toLocaleString("ar-EG")} ل.س`;

export default function DeveloperSmartReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-smart-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_smart_reports");
      if (error) throw error;
      return data as unknown as SmartReports;
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-4 md:p-6 space-y-4" dir="rtl">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    );
  }

  const totalRevenue = data.top_teachers.reduce((a, b) => a + Number(b.revenue || 0), 0);
  const totalViews = data.top_courses.reduce((a, b) => a + Number(b.views || 0), 0);

  const topStudentsCols: DataTableColumn<SmartReports["top_students"][number]>[] = [
    { key: "n", header: "الطالب", accessor: (r) => <span className="font-semibold text-slate-900">{r.full_name}</span>, sortValue: (r) => r.full_name, exportValue: (r) => r.full_name },
    { key: "avg", header: "متوسط الدرجات", accessor: (r) => `${Math.round(r.avg_percentage)}%`, sortValue: (r) => r.avg_percentage, exportValue: (r) => `${Math.round(r.avg_percentage)}%` },
    { key: "c", header: "عدد الامتحانات", accessor: (r) => r.exams_count, sortValue: (r) => r.exams_count, exportValue: (r) => r.exams_count },
  ];
  const topTeachersCols: DataTableColumn<SmartReports["top_teachers"][number]>[] = [
    { key: "n", header: "المعلم", accessor: (r) => <span className="font-semibold text-slate-900">{r.full_name}</span>, sortValue: (r) => r.full_name, exportValue: (r) => r.full_name },
    { key: "s", header: "عدد الطلاب", accessor: (r) => r.students, sortValue: (r) => r.students, exportValue: (r) => r.students },
    { key: "rev", header: "الإيرادات", accessor: (r) => fmtCur(Number(r.revenue)), sortValue: (r) => Number(r.revenue), exportValue: (r) => Number(r.revenue) },
  ];
  const topCoursesCols: DataTableColumn<SmartReports["top_courses"][number]>[] = [
    { key: "t", header: "الكورس", accessor: (r) => <span className="font-semibold text-slate-900">{r.title}</span>, sortValue: (r) => r.title, exportValue: (r) => r.title },
    { key: "v", header: "عدد المشاهدات", accessor: (r) => r.views.toLocaleString("ar-EG"), sortValue: (r) => r.views, exportValue: (r) => r.views },
  ];
  const inactiveTeachersCols: DataTableColumn<SmartReports["inactive_teachers"][number]>[] = [
    { key: "n", header: "المعلم", accessor: (r) => <span className="font-semibold text-slate-900">{r.full_name}</span>, sortValue: (r) => r.full_name, exportValue: (r) => r.full_name },
    { key: "l", header: "آخر محتوى منشور", accessor: (r) => r.last_content ? new Date(r.last_content).toLocaleDateString("ar-EG") : "لم ينشر", exportValue: (r) => r.last_content ?? "لم ينشر" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 bg-slate-50 min-h-screen" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">التقارير الذكية</h1>
        <p className="text-sm text-slate-500 mt-1">لوحة تحليلية للأداء الأعلى والأدنى — تُحدَّث كل دقيقة</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي أفضل الطلاب" value={data.top_students.length} icon={GraduationCap} accent="blue" />
        <StatCard label="أفضل المعلمين" value={data.top_teachers.length} icon={Users} accent="purple" />
        <StatCard label="أعلى الإيرادات (Top 10)" value={fmtCur(totalRevenue)} icon={Trophy} accent="green" />
        <StatCard label="أكثر الكورسات مشاهدة" value={totalViews.toLocaleString("ar-EG")} icon={PlayCircle} accent="amber" />
      </div>

      <DataTable
        title="🏆 أفضل الطلاب"
        exportName="top-students"
        data={data.top_students}
        columns={topStudentsCols}
        searchable={(r) => r.full_name}
        pageSize={10}
      />

      <DataTable
        title="👑 أفضل المعلمين حسب الإيرادات"
        exportName="top-teachers"
        data={data.top_teachers}
        columns={topTeachersCols}
        searchable={(r) => r.full_name}
        pageSize={10}
      />

      <DataTable
        title="▶️ أكثر الكورسات مشاهدة"
        exportName="top-courses"
        data={data.top_courses}
        columns={topCoursesCols}
        searchable={(r) => r.title}
        pageSize={10}
      />

      <DataTable
        title="⚠️ المعلمون غير النشطين"
        exportName="inactive-teachers"
        data={data.inactive_teachers}
        columns={inactiveTeachersCols}
        searchable={(r) => r.full_name}
        pageSize={10}
      />
    </div>
  );
}
