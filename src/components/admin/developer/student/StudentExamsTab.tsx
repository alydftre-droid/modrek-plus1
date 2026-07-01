import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  PlayCircle,
  Search,
  Trophy,
  User,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "../shared/exportHelpers";
import { fetchStudentExamsFallback, isSchemaCacheError, normalizeExamRows } from "./fallbackData";

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

const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  solved:      { label: "تم الحل",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  in_progress: { label: "جاري الحل", cls: "bg-blue-50 text-blue-700 border-blue-200",         dot: "bg-blue-500" },
  abandoned:   { label: "متروك",     cls: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500" },
  missed:      { label: "متغيّب",    cls: "bg-rose-50 text-rose-700 border-rose-200",           dot: "bg-rose-500" },
  upcoming:    { label: "قادم",      cls: "bg-slate-50 text-slate-600 border-slate-200",       dot: "bg-slate-400" },
  available:   { label: "متاح",      cls: "bg-violet-50 text-violet-700 border-violet-200",    dot: "bg-violet-500" },
};

const fmtDate = (v: string | null) => v ? new Date(v).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtNum  = (v: number) => Number(v || 0).toLocaleString("ar-EG");

export function StudentExamsTab({ studentId }: { studentId: string }) {
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["dev-student-exams", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_exams", { _student_id: studentId });
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentExamsFallback(studentId) as Promise<ExamRow[]>;
        throw error;
      }
      return normalizeExamRows(data) as ExamRow[];
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [monthF, setMonthF] = useState("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const months = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => {
      const d = r.submitted_at || r.end_at || r.created_at;
      if (d) set.add(new Date(d).toISOString().slice(0, 7));
    });
    return [...set].sort().reverse();
  }, [data]);

  const filtered = useMemo(() => data.filter((r) => {
    if (statusF !== "all" && r.status !== statusF) return false;
    if (monthF !== "all") {
      const d = r.submitted_at || r.end_at || r.created_at;
      if (!d || new Date(d).toISOString().slice(0, 7) !== monthF) return false;
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = `${r.exam_title} ${r.subject_name ?? ""} ${r.teacher_name ?? ""} ${r.group_title ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [data, q, statusF, monthF]);

  // Group by subject → group
  const grouped = useMemo(() => {
    const map: Record<string, {
      subject: string;
      groups: Record<string, { group: string; teacher: string | null; group_id: string | null; rows: ExamRow[] }>;
    }> = {};
    filtered.forEach((r) => {
      const subj = r.subject_name || "بدون مادة";
      const grpKey = r.group_id || r.group_title || "no-group";
      if (!map[subj]) map[subj] = { subject: subj, groups: {} };
      if (!map[subj].groups[grpKey]) {
        map[subj].groups[grpKey] = { group: r.group_title || "امتحان عام", teacher: r.teacher_name, group_id: r.group_id, rows: [] };
      }
      map[subj].groups[grpKey].rows.push(r);
    });
    return Object.values(map).sort((a, b) => a.subject.localeCompare(b.subject, "ar"));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = data.length;
    const solved = data.filter((r) => r.status === "solved").length;
    const missed = data.filter((r) => r.status === "missed").length;
    const abandoned = data.filter((r) => r.status === "abandoned").length;
    const inProgress = data.filter((r) => r.status === "in_progress").length;
    const solvedRows = data.filter((r) => r.status === "solved");
    const avg = solvedRows.length
      ? Math.round(solvedRows.reduce((s, r) => s + Number(r.percentage || 0), 0) / solvedRows.length)
      : 0;
    return { total, solved, missed, abandoned, inProgress, avg };
  }, [data]);

  const exportAll = () => {
    exportToExcel(filtered.map((r) => ({
      "الامتحان": r.exam_title,
      "المادة": r.subject_name || "",
      "المجموعة": r.group_title || "",
      "المعلم": r.teacher_name || "",
      "الحالة": STATUS[r.status]?.label || r.status,
      "الدرجة": r.status === "solved" ? `${Number(r.score)}/${Number(r.total)}` : "",
      "النسبة": r.status === "solved" ? `${Math.round(Number(r.percentage))}%` : "",
      "تاريخ التسليم": fmtDate(r.submitted_at),
    })), `student-exams-${studentId.slice(0, 8)}`);
  };

  const toggleGroup = (k: string) => setOpenGroups((s) => ({ ...s, [k]: !s[k] }));

  if (isLoading) {
    return (
      <div className="min-h-[240px] flex flex-col items-center justify-center gap-3 text-slate-500 bg-white rounded-3xl border border-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <p className="text-xs">جاري تحميل الامتحانات…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50/70 border border-rose-200 rounded-3xl text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-rose-500" />
        <h4 className="font-bold text-rose-700">تعذّر تحميل الامتحانات</h4>
        <p className="text-xs text-rose-600/80">{(error as Error).message}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary hero */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="إجمالي الامتحانات" value={fmtNum(stats.total)} icon={FileText} gradient="from-indigo-500 to-blue-500" />
        <SummaryCard label="تم الحل" value={fmtNum(stats.solved)} icon={CheckCircle2} gradient="from-emerald-500 to-teal-500" />
        <SummaryCard label="متغيّب" value={fmtNum(stats.missed)} icon={XCircle} gradient="from-rose-500 to-red-500" />
        <SummaryCard label="متروك / جارٍ" value={fmtNum(stats.abandoned + stats.inProgress)} icon={PlayCircle} gradient="from-amber-500 to-orange-500" />
        <SummaryCard label="متوسط الدرجة" value={`${stats.avg}%`} icon={Trophy} gradient="from-violet-500 to-fuchsia-500" />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم الامتحان، المادة، المعلم، المجموعة…"
            className="pr-9 h-9 bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
          />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-[140px] h-9 bg-slate-50 border-slate-200"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthF} onValueChange={setMonthF}>
          <SelectTrigger className="w-[140px] h-9 bg-slate-50 border-slate-200"><SelectValue placeholder="الشهر" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الشهور</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportAll} className="h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          تصدير Excel
        </Button>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl py-14 px-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-3">
            <FileText className="h-7 w-7" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">لا توجد امتحانات</h4>
          <p className="text-xs text-slate-500 mt-1">لم يشترك الطالب في مجموعات بها امتحانات، أو لا نتائج للفلترة الحالية.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((subj) => {
            const groupsList = Object.entries(subj.groups);
            const totalRows = groupsList.reduce((s, [, g]) => s + g.rows.length, 0);
            return (
              <div key={subj.subject} className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                {/* Subject header */}
                <div className="px-5 py-3 bg-gradient-to-l from-slate-50 via-white to-white border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-sm">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">{subj.subject}</h3>
                      <p className="text-[11px] text-slate-500">{groupsList.length} مجموعة • {fmtNum(totalRows)} امتحان</p>
                    </div>
                  </div>
                </div>

                {/* Groups inside subject */}
                <div className="divide-y divide-slate-100">
                  {groupsList.map(([gk, g]) => {
                    const isOpen = openGroups[`${subj.subject}::${gk}`] !== false;
                    const solvedCount = g.rows.filter((r) => r.status === "solved").length;
                    return (
                      <div key={gk}>
                        <button
                          onClick={() => toggleGroup(`${subj.subject}::${gk}`)}
                          className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50/60 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 text-right">
                              <div className="font-bold text-sm text-slate-900 truncate">{g.group}</div>
                              <div className="text-[11px] text-slate-500 truncate">
                                المعلم: {g.teacher || "—"} • {fmtNum(g.rows.length)} امتحان • تم الحل {fmtNum(solvedCount)}
                              </div>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </button>

                        {isOpen && (
                          <div className="px-5 pb-4">
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 text-[11px]">
                                  <tr>
                                    <th className="text-right px-3 py-2 font-semibold">الامتحان</th>
                                    <th className="text-right px-3 py-2 font-semibold">الحالة</th>
                                    <th className="text-right px-3 py-2 font-semibold">الدرجة</th>
                                    <th className="text-right px-3 py-2 font-semibold">النسبة</th>
                                    <th className="text-right px-3 py-2 font-semibold">التاريخ</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {g.rows
                                    .sort((a, b) => (b.submitted_at || b.end_at || "").localeCompare(a.submitted_at || a.end_at || ""))
                                    .map((r) => {
                                      const st = STATUS[r.status] ?? STATUS.available;
                                      const pct = Math.round(Number(r.percentage || 0));
                                      return (
                                        <tr key={r.exam_id + (r.attempt_id ?? "")} className="hover:bg-slate-50/60">
                                          <td className="px-3 py-2.5">
                                            <div className="font-semibold text-slate-900">{r.exam_title}</div>
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                              {r.grade ? `الصف: ${r.grade}` : ""}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2.5">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2.5 tabular-nums text-slate-700">
                                            {r.status === "solved" ? `${fmtNum(Number(r.score))}/${fmtNum(Number(r.total))}` : "—"}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            {r.status === "solved" ? (
                                              <div className="flex items-center gap-2 min-w-[110px]">
                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${pct >= 50 ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className={`text-[11px] font-bold tabular-nums ${pct >= 50 ? "text-emerald-700" : "text-rose-700"}`}>{pct}%</span>
                                              </div>
                                            ) : "—"}
                                          </td>
                                          <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                                            <Calendar className="inline h-3 w-3 ml-1" />
                                            {fmtDate(r.submitted_at || r.end_at || r.start_at)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, gradient }: { label: string; value: string; icon: any; gradient: string }) {
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-100 p-4">
      <div className={`absolute -top-6 -left-6 h-20 w-20 rounded-full bg-gradient-to-br ${gradient} opacity-10`} />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums leading-tight">{value}</p>
        </div>
        <div className={`shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-md`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}
