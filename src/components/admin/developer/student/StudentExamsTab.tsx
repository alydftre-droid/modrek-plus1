import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Trophy,
  UserCircle2,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "../shared/exportHelpers";
import {
  fetchStudentExamsFallback,
  isSchemaCacheError,
  normalizeExamRows,
} from "./fallbackData";

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

const SUBJECT_ALIASES: Record<string, string> = {
  "الأدب": "اللغة العربية",
  "النحو": "اللغة العربية",
  "البلاغة": "اللغة العربية",
  "القراءة": "اللغة العربية",
  "النصوص": "اللغة العربية",
  "التعبير": "اللغة العربية",
};
const normalizeSubject = (name?: string | null) => {
  if (!name) return "بدون مادة";
  const t = name.trim();
  return SUBJECT_ALIASES[t] || t;
};

const fmtDate = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("ar-EG", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const fmtNum = (v: number) => Number(v || 0).toLocaleString("ar-EG");

// Palette per group card (rotates)
const PALETTE = [
  { bar: "from-emerald-500 to-teal-500", ring: "border-emerald-200", chipBg: "bg-emerald-50", chipFg: "text-emerald-700" },
  { bar: "from-blue-500 to-indigo-500", ring: "border-blue-200", chipBg: "bg-blue-50", chipFg: "text-blue-700" },
  { bar: "from-violet-500 to-fuchsia-500", ring: "border-violet-200", chipBg: "bg-violet-50", chipFg: "text-violet-700" },
  { bar: "from-amber-500 to-orange-500", ring: "border-amber-200", chipBg: "bg-amber-50", chipFg: "text-amber-700" },
  { bar: "from-rose-500 to-pink-500", ring: "border-rose-200", chipBg: "bg-rose-50", chipFg: "text-rose-700" },
];

export function StudentExamsTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("dev-student") });
    queryClient.refetchQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("dev-student"), type: "active" });
  }, [queryClient, studentId]);

  const { data = [], isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dev-student-exams", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_exams", { _student_id: studentId });
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentExamsFallback(studentId) as Promise<ExamRow[]>;
        throw error;
      }
      return normalizeExamRows(data) as ExamRow[];
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const [q, setQ] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!q.trim()) return data;
    const s = q.trim().toLowerCase();
    return data.filter((r) => {
      const hay = `${r.exam_title} ${r.subject_name ?? ""} ${r.teacher_name ?? ""} ${r.group_title ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [data, q]);

  // Group by group_id (subscribed group). Each card = one group.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        group_title: string;
        subject: string;
        teacher: string;
        rows: ExamRow[];
      }
    >();
    filtered.forEach((r) => {
      const key = r.group_id || `${r.subject_name ?? "misc"}-${r.teacher_name ?? "misc"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          group_title: r.group_title || "امتحان عام",
          subject: normalizeSubject(r.subject_name),
          teacher: r.teacher_name || "—",
          rows: [],
        });
      }
      map.get(key)!.rows.push(r);
    });
    // Sort groups by newest exam date
    return [...map.values()]
      .map((g) => ({
        ...g,
        rows: g.rows.sort((a, b) =>
          (b.created_at || b.start_at || "").localeCompare(a.created_at || a.start_at || ""),
        ),
      }))
      .sort((a, b) =>
        (b.rows[0]?.created_at ?? "").localeCompare(a.rows[0]?.created_at ?? ""),
      );
  }, [filtered]);

  const totals = useMemo(() => {
    const total = data.length;
    const solved = data.filter((r) => r.status === "solved").length;
    const missed = data.filter((r) => r.status !== "solved").length;
    const solvedRows = data.filter((r) => r.status === "solved");
    const avg = solvedRows.length
      ? Math.round(solvedRows.reduce((s, r) => s + Number(r.percentage || 0), 0) / solvedRows.length)
      : 0;
    return { total, solved, missed, avg };
  }, [data]);

  const exportAll = () => {
    exportToExcel(
      filtered.map((r) => ({
        "المجموعة": r.group_title ?? "",
        "المادة": normalizeSubject(r.subject_name),
        "المعلم": r.teacher_name ?? "",
        "الامتحان": r.exam_title,
        "تاريخ النزول": fmtDate(r.created_at || r.start_at),
        "تاريخ الحل": r.status === "solved" ? fmtDate(r.submitted_at) : "متغيّب",
        "الدرجة": r.status === "solved" ? `${Number(r.score)}/${Number(r.total)}` : "متغيّب",
        "النسبة": r.status === "solved" ? `${Math.round(Number(r.percentage))}%` : "—",
      })),
      `student-exams-${studentId.slice(0, 8)}`,
    );
  };

  const toggle = (k: string) => setOpenGroups((s) => ({ ...s, [k]: !s[k] }));
  const lastSync = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

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
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="إجمالي الامتحانات" value={fmtNum(totals.total)} icon={FileText} bar="from-indigo-500 to-blue-500" />
        <SummaryTile label="امتحانات محلولة" value={fmtNum(totals.solved)} icon={CheckCircle2} bar="from-emerald-500 to-teal-500" />
        <SummaryTile label="متغيّب عنها" value={fmtNum(totals.missed)} icon={XCircle} bar="from-rose-500 to-red-500" />
        <SummaryTile label="متوسط الدرجة" value={`${totals.avg}%`} icon={Trophy} bar="from-amber-500 to-orange-500" />
      </div>

      {/* Search + export */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap gap-2 items-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 text-[11px] font-bold">
          <span className={`h-2 w-2 rounded-full bg-emerald-500 ${isFetching ? "animate-pulse" : ""}`} />
          فحص مباشر من قاعدة البيانات · آخر تحديث {lastSync}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم الامتحان، المجموعة، المادة، المعلم…"
            className="pr-9 h-10 bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-10 border-blue-200 text-blue-700 hover:bg-blue-50 gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> تحديث الآن
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={exportAll}
          className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        >
          تصدير تقرير Excel
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl py-14 px-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-3">
            <FileText className="h-7 w-7" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">لا توجد امتحانات</h4>
          <p className="text-xs text-slate-500 mt-1">لم يشترك الطالب في مجموعات بها امتحانات بعد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {groups.map((g, idx) => {
            const p = PALETTE[idx % PALETTE.length];
            const solved = g.rows.filter((r) => r.status === "solved").length;
            const missed = g.rows.filter((r) => r.status !== "solved").length;
            const isOpen = openGroups[g.key] !== false; // default open
            const solvedRows = g.rows.filter((r) => r.status === "solved");
            const avg = solvedRows.length
              ? Math.round(solvedRows.reduce((s, r) => s + Number(r.percentage || 0), 0) / solvedRows.length)
              : null;

            return (
              <div
                key={g.key}
                className={`bg-white rounded-3xl border ${p.ring} overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]`}
              >
                {/* Header */}
                <div className={`h-1.5 w-full bg-gradient-to-l ${p.bar}`} />
                <button
                  onClick={() => toggle(g.key)}
                  className="w-full text-right px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50/60 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${p.bar} text-white flex items-center justify-center shrink-0`}>
                        <BookOpen className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-black text-slate-900 truncate">{g.group_title}</h3>
                        <p className="text-[11px] text-slate-500 truncate">
                          <span className="font-semibold text-slate-700">{g.subject}</span>
                          <span className="mx-1.5">•</span>
                          <span className="inline-flex items-center gap-1">
                            <UserCircle2 className="h-3 w-3" />
                            {g.teacher}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Chip stats */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Chip label="الإجمالي" value={fmtNum(g.rows.length)} tone="slate" />
                      <Chip label="محلولة" value={fmtNum(solved)} tone="emerald" />
                      <Chip label="متغيّب" value={fmtNum(missed)} tone="rose" />
                      {avg !== null && <Chip label="المتوسط" value={`${avg}%`} tone="violet" />}
                    </div>
                  </div>
                  <div className="shrink-0 pt-1">
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </button>

                {/* Exams table */}
                {isOpen && (
                  <div className="px-3 pb-4">
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 text-[11px]">
                            <th className="text-right px-3 py-2 font-bold">الامتحان</th>
                            <th className="text-right px-3 py-2 font-bold whitespace-nowrap">تاريخ النزول</th>
                            <th className="text-right px-3 py-2 font-bold whitespace-nowrap">تاريخ الحل</th>
                            <th className="text-right px-3 py-2 font-bold">الدرجة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.rows.map((r) => {
                            const isSolved = r.status === "solved";
                            const isMissed = r.status !== "solved";
                            const pct = Math.round(Number(r.percentage || 0));
                            return (
                              <tr key={r.exam_id + (r.attempt_id ?? "")} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2.5 align-top">
                                  <div className="font-semibold text-slate-900 text-[13px]">{r.exam_title}</div>
                                  {r.grade && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">{r.grade}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap align-top">
                                  <CalendarDays className="inline h-3 w-3 ml-1 text-slate-400" />
                                  {fmtDate(r.created_at || r.start_at)}
                                </td>
                                <td className="px-3 py-2.5 text-[11px] whitespace-nowrap align-top">
                                  {isSolved ? (
                                    <span className="text-emerald-700">
                                      <CalendarDays className="inline h-3 w-3 ml-1" />
                                      {fmtDate(r.submitted_at)}
                                    </span>
                                  ) : isMissed ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                                      <XCircle className="h-3 w-3" /> متغيّب
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 align-top">
                                  {isSolved ? (
                                    <div className="flex items-center gap-2 min-w-[130px]">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold tabular-nums ${
                                          pct >= 50
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : "bg-rose-50 text-rose-700 border border-rose-200"
                                        }`}
                                      >
                                        {fmtNum(Number(r.score))}/{fmtNum(Number(r.total))}
                                      </span>
                                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${pct >= 50 ? "bg-emerald-500" : "bg-rose-500"}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className={`text-[10px] font-bold tabular-nums ${pct >= 50 ? "text-emerald-700" : "text-rose-700"}`}>
                                        {pct}%
                                      </span>
                                    </div>
                                  ) : isMissed ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                                      متغيّب
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-[11px]">
                                      قيد الحل
                                    </span>
                                  )}
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
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  bar,
}: {
  label: string;
  value: string;
  icon: any;
  bar: string;
}) {
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 p-4">
      <div className={`absolute -top-8 -left-8 h-20 w-20 rounded-full bg-gradient-to-br ${bar} opacity-10`} />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums leading-tight">{value}</p>
        </div>
        <div className={`shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br ${bar} text-white flex items-center justify-center shadow`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "emerald" | "rose" | "amber" | "violet";
}) {
  const map = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${map[tone]}`}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-black tabular-nums">{value}</span>
    </span>
  );
}
