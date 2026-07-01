import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { StatCard } from "../shared/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock3, FileText, Percent, XCircle, AlertCircle, PlayCircle } from "lucide-react";

interface ExamRow {
  exam_id: string;
  attempt_id: string | null;
  exam_title: string;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  group_id: string | null;
  group_title: string | null;
  grade: string | null;
  start_at: string | null;
  end_at: string | null;
  submitted_at: string | null;
  score: number;
  total: number;
  percentage: number;
  status: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  solved:      { label: "تم الحل",      cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  in_progress: { label: "جاري الحل",    cls: "bg-blue-100 text-blue-700 border-blue-200" },
  abandoned:   { label: "متروك",        cls: "bg-amber-100 text-amber-700 border-amber-200" },
  missed:      { label: "متخلَّف",       cls: "bg-rose-100 text-rose-700 border-rose-200" },
  upcoming:    { label: "قادم",         cls: "bg-slate-100 text-slate-600 border-slate-200" },
  available:   { label: "متاح",         cls: "bg-violet-100 text-violet-700 border-violet-200" },
};

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—");

export function StudentExamsTab({ studentId }: { studentId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["dev-student-exams", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_exams", { _student_id: studentId });
      if (error) throw error;
      return (data as unknown as ExamRow[]) || [];
    },
    refetchInterval: 30_000,
  });

  const [subjectF, setSubjectF] = useState("all");
  const [groupF, setGroupF] = useState("all");
  const [teacherF, setTeacherF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [monthF, setMonthF] = useState("all");

  const opts = useMemo(() => {
    const s = new Set<string>(), g = new Set<string>(), t = new Set<string>(), m = new Set<string>();
    data.forEach((r) => {
      if (r.subject_name) s.add(r.subject_name);
      if (r.group_title) g.add(r.group_title);
      if (r.teacher_name) t.add(r.teacher_name);
      const d = r.submitted_at || r.created_at;
      if (d) m.add(new Date(d).toISOString().slice(0, 7));
    });
    return { subjects: [...s].sort(), groups: [...g].sort(), teachers: [...t].sort(), months: [...m].sort().reverse() };
  }, [data]);

  const filtered = useMemo(() => data.filter((r) => {
    if (subjectF !== "all" && r.subject_name !== subjectF) return false;
    if (groupF !== "all" && r.group_title !== groupF) return false;
    if (teacherF !== "all" && r.teacher_name !== teacherF) return false;
    if (statusF !== "all" && r.status !== statusF) return false;
    if (monthF !== "all") {
      const d = r.submitted_at || r.created_at;
      if (!d || new Date(d).toISOString().slice(0, 7) !== monthF) return false;
    }
    return true;
  }), [data, subjectF, groupF, teacherF, statusF, monthF]);

  const stats = useMemo(() => {
    const total = data.length;
    const solved = data.filter((r) => r.status === "solved").length;
    const missed = data.filter((r) => r.status === "missed" || r.status === "abandoned").length;
    const solvedRows = data.filter((r) => r.status === "solved");
    const avg = solvedRows.length ? Math.round(solvedRows.reduce((s, r) => s + Number(r.percentage || 0), 0) / solvedRows.length) : 0;
    return { total, solved, missed, avg };
  }, [data]);

  const columns: DataTableColumn<ExamRow>[] = [
    { key: "exam_title", header: "الامتحان", accessor: (r) => <span className="font-semibold text-slate-900">{r.exam_title}</span>, sortValue: (r) => r.exam_title, exportValue: (r) => r.exam_title },
    { key: "subject", header: "المادة", accessor: (r) => r.subject_name || "—", exportValue: (r) => r.subject_name || "" },
    { key: "teacher", header: "المعلم", accessor: (r) => r.teacher_name || "—", exportValue: (r) => r.teacher_name || "" },
    { key: "group", header: "المجموعة", accessor: (r) => r.group_title || "—", exportValue: (r) => r.group_title || "" },
    { key: "date", header: "التاريخ", accessor: (r) => fmtDate(r.submitted_at || r.end_at || r.start_at), sortValue: (r) => r.submitted_at || r.created_at, exportValue: (r) => fmtDate(r.submitted_at || r.end_at) },
    { key: "status", header: "الحالة", accessor: (r) => {
      const m = STATUS_META[r.status] ?? STATUS_META.available;
      return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${m.cls}`}>{m.label}</span>;
    }, exportValue: (r) => STATUS_META[r.status]?.label ?? r.status },
    { key: "score", header: "الدرجة", accessor: (r) => r.status === "solved" ? `${Number(r.score)}/${Number(r.total)}` : "—", exportValue: (r) => r.status === "solved" ? `${r.score}/${r.total}` : "" },
    { key: "pct", header: "النسبة", accessor: (r) => r.status === "solved"
      ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${Number(r.percentage) >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{Math.round(Number(r.percentage))}%</span>
      : "—",
      sortValue: (r) => Number(r.percentage || 0),
      exportValue: (r) => r.status === "solved" ? `${Math.round(Number(r.percentage))}%` : "" },
  ];

  const filters = (
    <div className="flex flex-wrap gap-2">
      <FilterSelect label="المادة" value={subjectF} onChange={setSubjectF} options={opts.subjects} />
      <FilterSelect label="المجموعة" value={groupF} onChange={setGroupF} options={opts.groups} />
      <FilterSelect label="المعلم" value={teacherF} onChange={setTeacherF} options={opts.teachers} />
      <FilterSelect label="الحالة" value={statusF} onChange={setStatusF} options={Object.keys(STATUS_META)} labels={Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.label]))} />
      <FilterSelect label="الشهر" value={monthF} onChange={setMonthF} options={opts.months} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="إجمالي الامتحانات" value={stats.total.toLocaleString("ar-EG")} icon={FileText} accent="blue" />
        <StatCard label="تم الحل" value={stats.solved.toLocaleString("ar-EG")} icon={CheckCircle2} accent="emerald" />
        <StatCard label="متخلَّف/متروك" value={stats.missed.toLocaleString("ar-EG")} icon={XCircle} accent="rose" />
        <StatCard label="متوسط الدرجة" value={`${stats.avg}%`} icon={Percent} accent="amber" />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        searchable={(r) => `${r.exam_title} ${r.subject_name ?? ""} ${r.teacher_name ?? ""} ${r.group_title ?? ""}`}
        title="امتحانات الطالب"
        exportName={`student-exams-${studentId.slice(0, 8)}`}
        filters={filters}
        isLoading={isLoading}
        emptyLabel="لا توجد امتحانات مرتبطة بمجموعات الطالب"
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <div className="min-w-[130px]">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs bg-white"><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل {label}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
