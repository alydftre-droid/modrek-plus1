import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseTimeout } from "@/lib/supabaseQueryTimeout";
import { StatCard } from "../shared/StatCard";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { MonthPicker } from "../shared/MonthPicker";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Users, DollarSign, Sparkles, Layers, ChevronLeft, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface GradeRow {
  grade: string; stage: string; active_subs: number; monthly_revenue: number;
  new_this_week: number; new_this_month: number; groups_count: number;
}
interface GroupDetail {
  group_id: string; group_title: string; subject_name: string | null;
  grade: string | null; price: number; students_count: number;
  revenue: number; new_today: number; new_month: number; created_at: string;
}

export function TeacherSubscriptionsTab({ teacherId }: { teacherId: string }) {
  const [openGrade, setOpenGrade] = useState<string | null>(null);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: grades = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["dev-teacher-subs-by-grade", teacherId],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(supabase.rpc("get_developer_teacher_subs_by_grade", { _teacher_id: teacherId }), "اشتراكات المعلم") ;
      if (error) throw error;
      return (data as unknown as GradeRow[]) || [];
    },
    refetchInterval: 60_000,
    retry: false,
  });

  const totals = useMemo(() => ({
    active: grades.reduce((s, g) => s + g.active_subs, 0),
    revenue: grades.reduce((s, g) => s + Number(g.monthly_revenue), 0),
    newMonth: grades.reduce((s, g) => s + g.new_this_month, 0),
    newWeek: grades.reduce((s, g) => s + g.new_this_week, 0),
  }), [grades]);

  if (isLoading) {
    return <div className="tm-stats-grid">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-44 rounded-[18px] bg-white" />)}</div>;
  }

  if (isError) {
    return (
      <div className="tm-panel">
        <div className="tm-panel-content text-center space-y-3">
          <h3 className="tm-section-title justify-center">تعذر تحميل الاشتراكات</h3>
          <button type="button" onClick={() => refetch()} className="tm-submit-btn px-6 inline-flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="إجمالي المشتركين" value={fmt(totals.active)} icon={Users} accent="emerald" />
        <StatCard label="إيراد الشهر الحالي" value={`${fmt(totals.revenue)} ج`} icon={DollarSign} accent="amber" />
        <StatCard label="جدد هذا الأسبوع" value={fmt(totals.newWeek)} icon={Sparkles} accent="blue" />
        <StatCard label="جدد هذا الشهر" value={fmt(totals.newMonth)} icon={Sparkles} accent="violet" />
      </div>

      {grades.length === 0 ? (
        <EmptyState icon={Layers} title="لا توجد اشتراكات بعد" description="ستظهر هنا كل الاشتراكات في المجموعات التي أنشأها المعلم." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {grades.map((g) => (
            <button
              key={`${g.grade}-${g.stage}`}
              onClick={() => setOpenGrade(g.grade)}
              className="tm-list-box text-right hover:shadow-md transition group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">{g.stage || "—"}</p>
                  <h4 className="font-bold text-slate-900 text-sm mt-0.5 truncate">{g.grade}</h4>
                </div>
                <ChevronLeft className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 shrink-0" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-slate-500">مشتركون:</span> <span className="font-bold text-slate-900 tabular-nums">{fmt(g.active_subs)}</span></div>
                <div><span className="text-slate-500">مجموعات:</span> <span className="font-bold text-slate-900 tabular-nums">{fmt(g.groups_count)}</span></div>
                <div><span className="text-slate-500">إيراد الشهر:</span> <span className="font-bold text-emerald-700 tabular-nums">{fmt(g.monthly_revenue)} ج</span></div>
                <div><span className="text-slate-500">جدد الشهر:</span> <span className="font-bold text-blue-700 tabular-nums">+{fmt(g.new_this_month)}</span></div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!openGrade} onOpenChange={(v) => !v && setOpenGrade(null)}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-3xl" dir="rtl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center justify-between">
              <span>مجموعات {openGrade}</span>
              <MonthPicker value={period} onChange={setPeriod} />
            </SheetTitle>
          </SheetHeader>
          {openGrade && <GradeDetail teacherId={teacherId} grade={openGrade} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function GradeDetail({ teacherId, grade }: { teacherId: string; grade: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["dev-teacher-group-details", teacherId, grade],
    queryFn: async () => {
      const { data, error } = await withSupabaseTimeout(supabase.rpc("get_developer_teacher_group_details", { _teacher_id: teacherId, _grade: grade }), "تفاصيل مجموعات المعلم") ;
      if (error) throw error;
      return (data as unknown as GroupDetail[]) || [];
    },
  });

  const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
  const dateFmt = (s: string) => new Date(s).toLocaleDateString("ar-EG", { dateStyle: "short" });

  const columns: DataTableColumn<GroupDetail>[] = [
    { key: "title", header: "المجموعة", accessor: (r) => <span className="font-semibold text-slate-900">{r.group_title}</span>, sortValue: (r) => r.group_title, exportValue: (r) => r.group_title },
    { key: "subject", header: "المادة", accessor: (r) => r.subject_name || "—", exportValue: (r) => r.subject_name || "" },
    { key: "price", header: "السعر", accessor: (r) => `${fmt(r.price)} ج`, sortValue: (r) => Number(r.price), exportValue: (r) => r.price },
    { key: "students", header: "المشتركون", accessor: (r) => fmt(r.students_count), sortValue: (r) => r.students_count, exportValue: (r) => r.students_count },
    { key: "revenue", header: "الإيراد", accessor: (r) => <span className="font-bold text-emerald-700">{fmt(r.revenue)} ج</span>, sortValue: (r) => Number(r.revenue), exportValue: (r) => r.revenue },
    { key: "today", header: "جدد اليوم", accessor: (r) => `+${fmt(r.new_today)}`, sortValue: (r) => r.new_today, exportValue: (r) => r.new_today },
    { key: "month", header: "جدد الشهر", accessor: (r) => `+${fmt(r.new_month)}`, sortValue: (r) => r.new_month, exportValue: (r) => r.new_month },
    { key: "date", header: "تاريخ الإنشاء", accessor: (r) => dateFmt(r.created_at), sortValue: (r) => r.created_at, exportValue: (r) => dateFmt(r.created_at) },
  ];

  return (
    <div className="space-y-4 mt-4">
      {data.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">إيراد كل مجموعة</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.slice(0, 10).map((x) => ({ name: x.group_title.slice(0, 14), value: Number(x.revenue) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="value" fill="#059669" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <DataTable
        data={data}
        columns={columns}
        searchable={(r) => `${r.group_title} ${r.subject_name ?? ""}`}
        title="تفاصيل المجموعات"
        exportName={`grade-${grade}-groups`}
        isLoading={isLoading}
        emptyLabel="لا توجد مجموعات في هذا الصف"
      />
    </div>
  );
}
