import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Filter,
  Loader2,
  Printer,
  RefreshCw,
  RotateCcw,
  Star,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const fmtDate = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  const date = d.toLocaleDateString("ar-EG-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  return `${date}\n${time}`;
};
const fmtNum = (v: number) => Number(v || 0).toLocaleString("ar-EG");

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

// Palette per group card (rotates) — matches reference image
const PALETTE = [
  { accent: "emerald", bar: "bg-emerald-500", ring: "border-r-4 border-r-emerald-500", iconBg: "bg-emerald-50", iconFg: "text-emerald-600", titleFg: "text-emerald-600" },
  { accent: "violet",  bar: "bg-violet-500",  ring: "border-r-4 border-r-violet-500",  iconBg: "bg-violet-50",  iconFg: "text-violet-600",  titleFg: "text-violet-600"  },
  { accent: "orange",  bar: "bg-orange-500",  ring: "border-r-4 border-r-orange-500",  iconBg: "bg-orange-50",  iconFg: "text-orange-600",  titleFg: "text-orange-600"  },
  { accent: "blue",    bar: "bg-blue-500",    ring: "border-r-4 border-r-blue-500",    iconBg: "bg-blue-50",    iconFg: "text-blue-600",    titleFg: "text-blue-600"    },
  { accent: "rose",    bar: "bg-rose-500",    ring: "border-r-4 border-r-rose-500",    iconBg: "bg-rose-50",    iconFg: "text-rose-600",    titleFg: "text-rose-600"    },
];

type Status = "solved" | "missed" | "expired" | "upcoming" | "in_progress" | "available" | "abandoned";

function resolveStatus(r: ExamRow): Status {
  const now = Date.now();
  const end = r.end_at ? new Date(r.end_at).getTime() : null;
  const start = r.start_at ? new Date(r.start_at).getTime() : null;
  if (r.status === "solved" || r.submitted_at) return "solved";
  if (r.status === "in_progress") return "in_progress";
  if (r.status === "upcoming" || (start && now < start)) return "upcoming";
  if (r.status === "missed") return "missed";
  if (end && now > end) return "expired";
  return "available";
}

const STATUS_LABELS: Record<Status, string> = {
  solved: "تم الحل",
  missed: "متغيّب",
  expired: "منتهي الوقت",
  upcoming: "لم يبدأ بعد",
  in_progress: "جارٍ الحل",
  available: "متاح",
  abandoned: "متغيّب",
};

const STATUS_STYLES: Record<Status, string> = {
  solved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  missed: "bg-rose-50 text-rose-700 border-rose-200",
  expired: "bg-orange-50 text-orange-700 border-orange-200",
  upcoming: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  available: "bg-slate-50 text-slate-700 border-slate-200",
  abandoned: "bg-rose-50 text-rose-700 border-rose-200",
};

const INITIAL_ROWS = 3;

export function StudentExamsTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("dev-student") });
  }, [queryClient, studentId]);

  const { data: rawData = [], isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["dev-student-exams", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_developer_student_exams", { _student_id: studentId });
      if (error) {
        if (isSchemaCacheError(error)) return fetchStudentExamsFallback(studentId) as Promise<ExamRow[]>;
        throw error;
      }
      return normalizeExamRows(data) as ExamRow[];
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  // Filters
  const [fSubject, setFSubject] = useState<string>("all");
  const [fGroup, setFGroup] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fMonth, setFMonth] = useState<string>("all");
  const [fYear, setFYear] = useState<string>("all");
  const [fSort, setFSort] = useState<string>("date_desc");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedExam, setSelectedExam] = useState<ExamRow | null>(null);

  const resetFilters = () => {
    setFSubject("all"); setFGroup("all"); setFStatus("all");
    setFMonth("all"); setFYear("all"); setFSort("date_desc");
  };

  // Extra: fetch student's ACTIVE subscribed subjects & groups (independent of exams)
  const { data: subscribed } = useQuery({
    queryKey: ["dev-student-subscribed-subjects-groups", studentId],
    queryFn: async () => {
      const [subsRes, purchRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("subject_id, subjects:subject_id(name)")
          .eq("student_id", studentId)
          .eq("is_active", true),
        supabase
          .from("student_group_purchases")
          .select("group_id, content_groups:group_id(id, title, subject_id, subjects:subject_id(name))")
          .eq("student_id", studentId),
      ]);
      const subjects = new Set<string>();
      const groups = new Map<string, string>();
      (subsRes.data ?? []).forEach((s: any) => {
        const n = s?.subjects?.name;
        if (n) subjects.add(normalizeSubject(n));
      });
      (purchRes.data ?? []).forEach((p: any) => {
        const g = p?.content_groups;
        if (g?.id) groups.set(g.id, g.title || "مجموعة");
        const n = g?.subjects?.name;
        if (n) subjects.add(normalizeSubject(n));
      });
      return { subjects: [...subjects], groups: [...groups.entries()] };
    },
    staleTime: 30_000,
  });

  const subjects = useMemo(() => {
    const set = new Set<string>();
    rawData.forEach(r => set.add(normalizeSubject(r.subject_name)));
    (subscribed?.subjects ?? []).forEach(s => set.add(s));
    return [...set].filter(Boolean).sort();
  }, [rawData, subscribed]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    rawData.forEach(r => {
      if (r.group_id) map.set(r.group_id, r.group_title || "مجموعة");
    });
    (subscribed?.groups ?? []).forEach(([id, t]) => {
      if (!map.has(id)) map.set(id, t);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [rawData, subscribed]);

  const years = useMemo(() => {
    const set = new Set<string>();
    rawData.forEach(r => {
      const d = r.created_at || r.start_at;
      if (d) set.add(String(new Date(d).getFullYear()));
    });
    if (set.size === 0) set.add(String(new Date().getFullYear()));
    return [...set].sort().reverse();
  }, [rawData]);

  const filtered = useMemo(() => {
    let list = rawData.map(r => ({ ...r, _status: resolveStatus(r) }));
    if (fSubject !== "all") list = list.filter(r => normalizeSubject(r.subject_name) === fSubject);
    if (fGroup !== "all") list = list.filter(r => r.group_id === fGroup);
    if (fStatus !== "all") list = list.filter(r => r._status === fStatus);
    if (fMonth !== "all" || fYear !== "all") {
      list = list.filter(r => {
        const d = r.created_at || r.start_at;
        if (!d) return false;
        const dt = new Date(d);
        if (fMonth !== "all" && String(dt.getMonth() + 1) !== fMonth) return false;
        if (fYear !== "all" && String(dt.getFullYear()) !== fYear) return false;
        return true;
      });
    }
    list.sort((a, b) => {
      if (fSort === "date_asc") return (a.created_at || "").localeCompare(b.created_at || "");
      if (fSort === "score_desc") return Number(b.percentage || 0) - Number(a.percentage || 0);
      if (fSort === "score_asc") return Number(a.percentage || 0) - Number(b.percentage || 0);
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return list;
  }, [rawData, fSubject, fGroup, fStatus, fMonth, fYear, fSort]);

  // Group by group_id
  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string; group_title: string; subject: string; teacher: string;
      rows: (ExamRow & { _status: Status })[];
    }>();
    filtered.forEach(r => {
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
    return [...map.values()].sort((a, b) =>
      (b.rows[0]?.created_at ?? "").localeCompare(a.rows[0]?.created_at ?? "")
    );
  }, [filtered]);

  const totals = useMemo(() => {
    const total = rawData.length;
    const solvedRows = rawData.filter(r => resolveStatus(r) === "solved");
    const missed = rawData.filter(r => {
      const s = resolveStatus(r);
      return s === "missed" || s === "expired" || s === "abandoned";
    }).length;
    const avg = solvedRows.length
      ? Math.round(solvedRows.reduce((s, r) => s + Number(r.percentage || 0), 0) / solvedRows.length)
      : 0;
    const best = solvedRows.reduce<ExamRow | null>((acc, r) =>
      !acc || Number(r.percentage || 0) > Number(acc.percentage || 0) ? r : acc, null);
    return { total, solved: solvedRows.length, missed, avg, best };
  }, [rawData]);

  const toggle = (k: string) => setExpandedGroups(s => ({ ...s, [k]: !s[k] }));
  const lastSync = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  const printMonthlyReport = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const monthLabel = fMonth !== "all" ? MONTHS_AR[Number(fMonth) - 1] : "جميع الأشهر";
    const yearLabel = fYear !== "all" ? fYear : new Date().getFullYear();
    const rowsHtml = filtered.map(r => `
      <tr>
        <td>${r.exam_title}</td>
        <td>${normalizeSubject(r.subject_name)}</td>
        <td>${r.group_title ?? "—"}</td>
        <td>${r.teacher_name ?? "—"}</td>
        <td>${(r.created_at || r.start_at || "").slice(0,10) || "—"}</td>
        <td>${r._status === "solved" ? (r.submitted_at || "").slice(0,10) : "—"}</td>
        <td style="text-align:center">${r._status === "solved" ? `${r.score} / ${r.total}` : `<span style="color:#e11d48;font-weight:bold">متغيّب</span>`}</td>
        <td>${STATUS_LABELS[r._status]}</td>
      </tr>`).join("");
    win.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>تقرير الامتحانات - ${monthLabel} ${yearLabel}</title>
      <style>
        body{font-family:'Cairo',Arial;padding:24px;color:#0f172a}
        h1{margin:0 0 4px;font-size:22px}
        .sub{color:#64748b;font-size:13px;margin-bottom:16px}
        .kpi{display:flex;gap:12px;margin:16px 0}
        .kpi div{flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:10px;text-align:center}
        .kpi b{display:block;font-size:20px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #e2e8f0;padding:8px;text-align:right}
        th{background:#f8fafc}
      </style></head><body>
      <h1>تقرير الامتحانات الشهري</h1>
      <div class="sub">${monthLabel} ${yearLabel} — منصة مدرك Plus</div>
      <div class="kpi">
        <div><span>إجمالي</span><b>${filtered.length}</b></div>
        <div><span>محلولة</span><b>${filtered.filter(r=>r._status==="solved").length}</b></div>
        <div><span>متغيّب</span><b>${filtered.filter(r=>r._status!=="solved").length}</b></div>
        <div><span>المتوسط</span><b>${totals.avg}%</b></div>
      </div>
      <table><thead><tr>
        <th>الامتحان</th><th>المادة</th><th>المجموعة</th><th>المعلم</th>
        <th>تاريخ النزول</th><th>تاريخ الحل</th><th>الدرجة</th><th>الحالة</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
      </body></html>`);
    win.document.close();
  };

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
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
            <FileText className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">الامتحانات</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">عرض جميع الامتحانات الخاصة بالطالب</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 text-[11px] font-bold">
            <span className={`h-2 w-2 rounded-full bg-emerald-500 ${isFetching ? "animate-pulse" : ""}`} />
            مباشر · {lastSync}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
            className="h-9 border-slate-200 gap-1">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={printMonthlyReport}
            className="h-9 bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
            <Printer className="h-4 w-4" /> تقرير الشهر
          </Button>
        </div>
      </div>

      {/* Stat cards — 5 tiles matching reference */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile label="إجمالي الامتحانات" value={fmtNum(totals.total)} suffix="امتحان"
          icon={FileText} tone="violet" />
        <StatTile label="تم الحل" value={fmtNum(totals.solved)} suffix="امتحان"
          icon={CheckCircle2} tone="emerald" />
        <StatTile label="متغيّب" value={fmtNum(totals.missed)} suffix="امتحانات"
          icon={XCircle} tone="rose" />
        <StatTile label="متوسط الدرجات" value={`${totals.avg}%`} suffix={totals.avg >= 75 ? "جيد" : totals.avg >= 50 ? "متوسط" : "يحتاج تحسين"}
          icon={TrendingUp} tone="blue" />
        <StatTile label="أعلى درجة"
          value={totals.best ? `${Math.round((Number(totals.best.score) / Math.max(Number(totals.best.total), 1)) * 100)}%` : "0%"}
          suffix={totals.best ? totals.best.exam_title : "—"}
          icon={Star} tone="orange" />

      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3">
        <div className="flex items-center gap-2 mb-2.5 text-slate-600">
          <Filter className="h-4 w-4" />
          <span className="text-[12px] font-bold">تصفية النتائج</span>
          <button onClick={resetFilters}
            className="mr-auto inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
            <RotateCcw className="h-3 w-3" /> إعادة الضبط
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <FilterSelect value={fSubject} onChange={setFSubject} placeholder="جميع المواد"
            options={[{ v: "all", l: "جميع المواد" }, ...subjects.map(s => ({ v: s, l: s }))]} />
          <FilterSelect value={fGroup} onChange={setFGroup} placeholder="جميع المجموعات"
            options={[{ v: "all", l: "جميع المجموعات" }, ...groupOptions.map(([id, t]) => ({ v: id, l: t }))]} />
          <FilterSelect value={fStatus} onChange={setFStatus} placeholder="جميع الحالات"
            options={[
              { v: "all", l: "جميع الحالات" },
              { v: "solved", l: "تم الحل" },
              { v: "missed", l: "متغيّب" },
              { v: "expired", l: "منتهي الوقت" },
              { v: "upcoming", l: "لم يبدأ بعد" },
            ]} />
          <FilterSelect value={fMonth} onChange={setFMonth} placeholder="الشهر"
            options={[{ v: "all", l: "كل الأشهر" }, ...MONTHS_AR.map((m, i) => ({ v: String(i + 1), l: m }))]} />
          <FilterSelect value={fYear} onChange={setFYear} placeholder="السنة"
            options={[{ v: "all", l: "كل السنوات" }, ...years.map(y => ({ v: y, l: y }))]} />
          <FilterSelect value={fSort} onChange={setFSort} placeholder="الترتيب"
            options={[
              { v: "date_desc", l: "الأحدث أولاً" },
              { v: "date_asc", l: "الأقدم أولاً" },
              { v: "score_desc", l: "الأعلى درجة" },
              { v: "score_asc", l: "الأقل درجة" },
            ]} />
        </div>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl py-14 px-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-3">
            <FileText className="h-7 w-7" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">لا توجد امتحانات</h4>
          <p className="text-xs text-slate-500 mt-1">جرّب تغيير الفلاتر أو إعادة الضبط.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g, idx) => {
            const p = PALETTE[idx % PALETTE.length];
            const solved = g.rows.filter(r => r._status === "solved").length;
            const missed = g.rows.filter(r => r._status !== "solved").length;
            const expanded = expandedGroups[g.key] === true;
            const visibleRows = expanded ? g.rows : g.rows.slice(0, INITIAL_ROWS);

            return (
              <div key={g.key}
                className={`bg-white rounded-2xl border border-slate-200 ${p.ring} overflow-hidden shadow-sm`}>
                {/* Header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
                  {/* Right side: title + subject + icon */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`h-11 w-11 rounded-2xl ${p.iconBg} ${p.iconFg} flex items-center justify-center shrink-0`}>
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-black text-slate-900 truncate">{g.group_title}</h3>
                      <p className={`text-[13px] font-bold ${p.titleFg} mt-0.5`}>{g.subject}</p>
                    </div>
                  </div>
                  {/* Left side: mini stats */}
                  <div className="flex items-stretch gap-4 text-center">
                    <MiniStat label="تم الحل" value={solved} tone="emerald" />
                    <MiniStat label="متغيّب" value={missed} tone="rose" />
                    <MiniStat label="الإجمالي" value={g.rows.length} tone="slate" />
                  </div>
                </div>
                <div className="px-4 pb-1">
                  <div className="text-[11px] text-slate-500">{g.rows.length} امتحانات</div>
                </div>

                {/* Table */}
                <div className="px-3 pb-2">
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-[11px]">
                          <th className="text-right px-3 py-2.5 font-bold">الامتحان</th>
                          <th className="text-right px-3 py-2.5 font-bold">المادة</th>
                          <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">تاريخ نزول الامتحان</th>
                          <th className="text-right px-3 py-2.5 font-bold whitespace-nowrap">تاريخ الحل</th>
                          <th className="text-center px-3 py-2.5 font-bold">الدرجة</th>
                          <th className="text-center px-3 py-2.5 font-bold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleRows.map((r) => (
                          <tr key={r.exam_id + (r.attempt_id ?? "")}
                            onClick={() => setSelectedExam(r)}
                            className="hover:bg-slate-50/70 cursor-pointer">
                            <td className="px-3 py-3 align-middle">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-semibold text-slate-800 text-[13px]">{r.exam_title}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[12px] text-slate-600 align-middle">
                              {normalizeSubject(r.subject_name)}
                            </td>
                            <td className="px-3 py-3 text-[11px] text-slate-500 whitespace-pre-line leading-tight align-middle">
                              {fmtDate(r.created_at || r.start_at)}
                            </td>
                            <td className="px-3 py-3 text-[11px] whitespace-pre-line leading-tight align-middle">
                              {r._status === "solved" ? (
                                <span className="text-slate-500">{fmtDate(r.submitted_at)}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 align-middle text-center">
                              {r._status === "solved" ? (
                                <PercentBadge score={Number(r.score)} total={Number(r.total)} />
                              ) : (
                                <div className="text-center text-slate-300">—</div>
                              )}
                            </td>

                            <td className="px-3 py-3 align-middle">
                              <div className="flex justify-center">
                                <StatusBadge status={r._status} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Toggle */}
                {g.rows.length > INITIAL_ROWS && (
                  <button onClick={() => toggle(g.key)}
                    className={`w-full py-3 flex items-center justify-center gap-1.5 text-[12px] font-bold ${p.titleFg} hover:bg-slate-50/60 border-t border-slate-100`}>
                    {expanded ? <>عرض أقل <ChevronUp className="h-3.5 w-3.5" /></>
                      : <>عرض كل الامتحانات ({g.rows.length}) <ChevronDown className="h-3.5 w-3.5" /></>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="text-center text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded-xl py-2">
        ملاحظة: جميع الأوقات والتواريخ حسب توقيت مصر المحلي
      </div>

      {/* Details dialog */}
      <ExamDetailsDialog exam={selectedExam} onClose={() => setSelectedExam(null)} studentId={studentId} />
    </div>
  );
}

/* ==================== Sub components ==================== */

function StatTile({ label, value, suffix, icon: Icon, tone }: {
  label: string; value: string; suffix?: string; icon: any;
  tone: "violet" | "emerald" | "rose" | "blue" | "orange";
}) {
  const map = {
    violet: { bg: "bg-violet-50", fg: "text-violet-600", border: "border-violet-100" },
    emerald: { bg: "bg-emerald-50", fg: "text-emerald-600", border: "border-emerald-100" },
    rose: { bg: "bg-rose-50", fg: "text-rose-600", border: "border-rose-100" },
    blue: { bg: "bg-blue-50", fg: "text-blue-600", border: "border-blue-100" },
    orange: { bg: "bg-orange-50", fg: "text-orange-600", border: "border-orange-100" },
  }[tone];
  return (
    <div className={`bg-white rounded-2xl border ${map.border} p-3.5 shadow-sm`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className={`h-8 w-8 rounded-xl ${map.bg} ${map.fg} flex items-center justify-center`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`text-[11px] font-bold ${map.fg}`}>{label}</span>
      </div>
      <div className={`text-2xl font-black ${map.fg} tabular-nums leading-none`}>{value}</div>
      {suffix && <div className="text-[10px] text-slate-400 mt-1">{suffix}</div>}
    </div>
  );
}




function PercentBadge({ score, total }: { score: number; total: number }) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const tone = pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-blue-600" : "text-rose-600";
  return <span className={`text-base font-black tabular-nums ${tone}`}>{pct}%</span>;
}


function StatusBadge({ status }: { status: Status }) {
  const label = STATUS_LABELS[status];
  const cls = STATUS_STYLES[status];
  const Icon = status === "solved" ? CheckCircle2 : status === "upcoming" ? FileText : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function MiniStat({ label, value, tone }: {
  label: string; value: number; tone: "emerald" | "rose" | "slate";
}) {
  const cls = { emerald: "text-emerald-600", rose: "text-rose-600", slate: "text-slate-700" }[tone];
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
      <div className={`text-lg font-black tabular-nums ${cls}`}>{fmtNum(value)}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: { v: string; l: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-[12px] bg-slate-50 border-slate-200">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.v} value={o.v} className="text-[12px]">{o.l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ==================== Details Dialog ==================== */

function ExamDetailsDialog({ exam, onClose, studentId }: {
  exam: ExamRow | null; onClose: () => void; studentId: string;
}) {
  const { data: details } = useQuery({
    enabled: !!exam?.attempt_id,
    queryKey: ["exam-attempt-details", exam?.attempt_id],
    queryFn: async () => {
      if (!exam?.attempt_id) return null;
      const [{ data: attempt }, { count: qCount }] = await Promise.all([
        supabase.from("exam_attempts")
          .select("started_at, submitted_at, total_score, max_score, percentage, status")
          .eq("id", exam.attempt_id).maybeSingle(),
        supabase.from("exam_questions").select("*", { count: "exact", head: true }).eq("exam_id", exam.exam_id),
      ]);
      const { data: answers } = await supabase.from("exam_answers")
        .select("is_correct").eq("attempt_id", exam.attempt_id);
      const correct = (answers ?? []).filter(a => a.is_correct === true).length;
      const wrong = (answers ?? []).filter(a => a.is_correct === false).length;
      const unanswered = Math.max((qCount ?? 0) - (answers?.length ?? 0), 0);
      return { attempt, questions: qCount ?? 0, correct, wrong, unanswered };
    },
  });

  if (!exam) return null;
  const status = resolveStatus(exam);
  const pct = exam.total ? Math.round((exam.score / exam.total) * 100) : 0;
  const started = details?.attempt?.started_at ?? null;
  const submitted = details?.attempt?.submitted_at ?? exam.submitted_at;
  const durationMin = started && submitted
    ? Math.max(1, Math.round((new Date(submitted).getTime() - new Date(started).getTime()) / 60000))
    : null;

  return (
    <Dialog open={!!exam} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-slate-900 font-black">{exam.exam_title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <InfoRow label="المادة" value={normalizeSubject(exam.subject_name)} />
            <InfoRow label="المجموعة" value={exam.group_title ?? "—"} />
            <InfoRow label="المعلم" value={exam.teacher_name ?? "—"} />
            <InfoRow label="الحالة" value={STATUS_LABELS[status]} />
            <InfoRow label="تاريخ النشر" value={fmtDate(exam.created_at || exam.start_at).replace("\n"," ")} />
            <InfoRow label="تاريخ الحل" value={status === "solved" ? fmtDate(submitted).replace("\n"," ") : "—"} />
            {started && <InfoRow label="بداية الحل" value={fmtDate(started).replace("\n"," ")} />}
            {durationMin && <InfoRow label="مدة الحل" value={`${durationMin} دقيقة`} />}
          </div>
          {status === "solved" && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <MetricBox label="الدرجة" value={`${exam.score} / ${exam.total}`} tone="emerald" />
              <MetricBox label="نسبة النجاح" value={`${pct}%`} tone="blue" />
              <MetricBox label="الأسئلة" value={String(details?.questions ?? "—")} tone="violet" />
              <MetricBox label="صحيحة" value={String(details?.correct ?? "—")} tone="emerald" />
              <MetricBox label="خطأ" value={String(details?.wrong ?? "—")} tone="rose" />
              <MetricBox label="بدون إجابة" value={String(details?.unanswered ?? "—")} tone="slate" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-[12px] font-bold text-slate-800 truncate">{value}</div>
    </div>
  );
}

function MetricBox({ label, value, tone }: {
  label: string; value: string;
  tone: "emerald" | "rose" | "blue" | "violet" | "slate";
}) {
  const map = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  }[tone];
  return (
    <div className={`rounded-lg p-2 border ${map} text-center`}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}
