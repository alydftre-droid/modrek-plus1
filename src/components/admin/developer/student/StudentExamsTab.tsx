import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable, DataTableColumn } from "../shared/DataTable";
import { StatCard } from "../shared/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock3, FileText, Star, Trophy, XCircle } from "lucide-react";

interface ExamRow {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  subject_name: string | null;
  grade: string | null;
  stage: string | null;
  group_title: string | null;
  teacher_name: string | null;
  created_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_seconds: number | null;
  questions_count: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  status: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  submitted:   { label: "✅ تم الحل",   color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  graded:      { label: "✅ تم التصحيح", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  in_progress: { label: "🔄 جاري الحل", color: "bg-blue-100 text-blue-700",       icon: Clock3 },
  expired:     { label: "❌ متغيب",     color: "bg-rose-100 text-rose-700",       icon: XCircle },
  not_started: { label: "⏳ لم يبدأ",    color: "bg-slate-100 text-slate-600",     icon: Clock3 },
};

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtDur = (s: number | null) => {
  if (!s || s < 0) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}د ${sec}ث`;
};

export function StudentExamsTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dev-student-exams", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_exams", { _student_id: studentId });
      if (error) throw error;
      return data as unknown as { rows: ExamRow[]; summary: any };
    },
    refetchInterval: 30_000,
  });

  const [subjectF, setSubjectF] = useState<string>("all");
  const [groupF, setGroupF] = useState<string>("all");
  const [teacherF, setTeacherF] = useState<string>("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [monthF, setMonthF] = useState<string>("all");

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? {};

  const opts = useMemo(() => {
    const s = new Set<string>(), g = new Set<string>(), t = new Set<string>(), m = new Set<string>();
    rows.forEach((r) => {
      if (r.subject_name) s.add(r.subject_name);
      if (r.group_title) g.add(r.group_title);
      if (r.teacher_name) t.add(r.teacher_name);
      const d = r.submitted_at || r.created_at;
      if (d) m.add(new Date(d).toISOString().slice(0, 7));
    });
    return { subjects: [...s].sort(), groups: [...g].sort(), teachers: [...t].sort(), months: [...m].sort().reverse() };
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (subjectF !== "all" && r.subject_name !== subjectF) return false;
    if (groupF   !== "all" && r.group_title !== groupF) return false;
    if (teacherF !== "all" && r.teacher_name !== teacherF) return false;
    if (statusF  !== "all" && r.status !== statusF) return false;
    if (monthF   !== "all") {
      const d = r.submitted_at || r.created_at;
      if (!d || new Date(d).toISOString().slice(0, 7) !== monthF) return false;
    }
    return true;
  }), [rows, subjectF, groupF, teacherF, statusF, monthF]);

  const columns: DataTableColumn<ExamRow>[] = [
    { key: "exam_title", header: "الامتحان", accessor: (r) => <span className="font-semibold text-slate-900">{r.exam_title}</span>, sortValue: (r) => r.exam_title, exportValue: (r) => r.exam_title },
    { key: "subject", header: "المادة", accessor: (r) => r.subject_name || "—", exportValue: (r) => r.subject_name || "" },
    { key: "grade", header: "الصف", accessor: (r) => r.grade || "—", exportValue: (r) => r.grade || "" },
    { key: "group", header: "المجموعة", accessor: (r) => r.group_title || "—", exportValue: (r) => r.group_title || "" },
    { key: "teacher", header: "المعلم", accessor: (r) => r.teacher_name || "—", exportValue: (r) => r.teacher_name || "" },
    { key: "started", header: "بدأ في", accessor: (r) => fmtDate(r.started_at), sortValue: (r) => r.started_at || "", exportValue: (r) => fmtDate(r.started_at) },
    { key: "submitted", header: "أُنجز في", accessor: (r) => fmtDate(r.submitted_at), sortValue: (r) => r.submitted_at || "", exportValue: (r) => fmtDate(r.submitted_at) },
    { key: "dur", header: "مدة الحل", accessor: (r) => fmtDur(r.duration_seconds), exportValue: (r) => fmtDur(r.duration_seconds) },
    { key: "q", header: "الأسئلة", accessor: (r) => r.questions_count, sortValue: (r) => r.questions_count, exportValue: (r) => r.questions_count },
    { key: "c", header: "صحيح", accessor: (r) => <span className="text-emerald-600 font-semibold">{r.correct_count}</span>, sortValue: (r) => r.correct_count, exportValue: (r) => r.correct_count },
    { key: "w", header: "خطأ", accessor: (r) => <span className="text-rose-600 font-semibold">{r.wrong_count}</span>, sortValue: (r) => r.wrong_count, exportValue: (r) => r.wrong_count },
    { key: "u", header: "بدون إجابة", accessor: (r) => <span className="text-slate-500">{r.unanswered_count}</span>, exportValue: (r) => r.unanswered_count },
    { key: "score", header: "الدرجة", accessor: (r) => `${r.total_score ?? 0}/${r.max_score ?? 0}`, sortValue: (r) => r.total_score ?? 0, exportValue: (r) => `${r.total_score ?? 0}/${r.max_score ?? 0}` },
    { key: "pct", header: "النسبة %", accessor: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${(r.percentage ?? 0) >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{Math.round(r.percentage ?? 0)}%</span>, sortValue: (r) => r.percentage ?? 0, exportValue: (r) => `${Math.round(r.percentage ?? 0)}%` },
    { key: "status", header: "الحالة", accessor: (r) => {
      const m = STATUS_META[r.status] ?? STATUS_META.not_started;
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>{m.label}</span>;
    }, exportValue: (r) => STATUS_META[r.status]?.label ?? r.status },
  ];

  const filterBar = (
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
      <DataTable
        data={filtered}
        columns={columns}
        searchable={(r) => `${r.exam_title} ${r.subject_name ?? ""} ${r.teacher_name ?? ""} ${r.group_title ?? ""}`}
        title="امتحانات الطالب"
        exportName={`student-exams-${studentId.slice(0, 8)}`}
        filters={filterBar}
        isLoading={isLoading}
        emptyLabel="لا توجد امتحانات لهذا الطالب"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي الامتحانات" value={(summary.total_exams ?? 0).toLocaleString("ar-EG")} icon={FileText} accent="blue" />
        <StatCard label="تم الحل" value={(summary.submitted ?? 0).toLocaleString("ar-EG")} icon={CheckCircle2} accent="green" />
        <StatCard label="متغيب" value={(summary.expired ?? 0).toLocaleString("ar-EG")} icon={XCircle} accent="red" />
        <StatCard label="متوسط الدرجات" value={`${Math.round(summary.avg_percentage ?? 0)}%`} icon={Star} accent="amber" />
        <StatCard label="أعلى درجة" value={`${Math.round(summary.max_percentage ?? 0)}%`} icon={Trophy} accent="green" />
        <StatCard label="أقل درجة" value={`${Math.round(summary.min_percentage ?? 0)}%`} icon={Star} accent="red" />
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options, labels,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <div className="min-w-[130px]">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs bg-white">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل {label}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
