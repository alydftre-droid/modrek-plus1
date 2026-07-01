import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, ChevronDown, ChevronUp,
  Clock3, CreditCard, Download, Edit3, FileText, Globe, Key, Loader2,
  LogIn, LogOut, MousePointerClick, PlayCircle, Search, Smartphone,
  Trophy, XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToExcel } from "../shared/exportHelpers";
import { fetchStudentLogsFallback } from "./fallbackData";

interface LogRow {
  id: string;
  student_id: string;
  action_type: string;
  action_label: string | null;
  description: string | null;
  page_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  session_id: string | null;
  duration_seconds: number | null;
  metadata: any;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; icon: any; tone: string }> = {
  login:           { label: "تسجيل دخول",   icon: LogIn,            tone: "emerald" },
  logout:          { label: "تسجيل خروج",   icon: LogOut,           tone: "slate" },
  video_open:      { label: "فتح فيديو",    icon: PlayCircle,       tone: "blue" },
  video_close:     { label: "إغلاق فيديو",  icon: PlayCircle,       tone: "slate" },
  video_watch:     { label: "مشاهدة فيديو", icon: PlayCircle,       tone: "blue" },
  pdf_open:        { label: "فتح PDF",      icon: FileText,         tone: "violet" },
  pdf_download:    { label: "تحميل PDF",    icon: Download,         tone: "violet" },
  exam_start:      { label: "بدء امتحان",   icon: Trophy,           tone: "amber" },
  exam_submit:     { label: "تسليم امتحان", icon: CheckCircle2,     tone: "emerald" },
  exam_abandon:    { label: "ترك امتحان",   icon: XCircle,          tone: "rose" },
  group_purchase:  { label: "شراء اشتراك",  icon: CreditCard,       tone: "emerald" },
  subscribe:       { label: "اشتراك جديد",  icon: CreditCard,       tone: "emerald" },
  unsubscribe:     { label: "إلغاء اشتراك", icon: XCircle,          tone: "rose" },
  page_view:       { label: "زيارة صفحة",   icon: MousePointerClick,tone: "slate" },
  profile_update:  { label: "تعديل البيانات", icon: Edit3,          tone: "blue" },
  password_change: { label: "تغيير كلمة السر", icon: Key,            tone: "amber" },
};

const TONE_MAP: Record<string, { bg: string; ring: string; icon: string; badge: string }> = {
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", icon: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700" },
  blue:    { bg: "bg-blue-50",    ring: "ring-blue-200",    icon: "text-blue-600",    badge: "bg-blue-100 text-blue-700" },
  violet:  { bg: "bg-violet-50",  ring: "ring-violet-200",  icon: "text-violet-600",  badge: "bg-violet-100 text-violet-700" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   icon: "text-amber-600",   badge: "bg-amber-100 text-amber-700" },
  rose:    { bg: "bg-rose-50",    ring: "ring-rose-200",    icon: "text-rose-600",    badge: "bg-rose-100 text-rose-700" },
  slate:   { bg: "bg-slate-100",  ring: "ring-slate-200",   icon: "text-slate-600",   badge: "bg-slate-200 text-slate-700" },
};

const fmt = (v: number) => Number(v || 0).toLocaleString("ar-EG");
const dateFmt = (v: string) => new Date(v).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "medium" });

function groupByDay(rows: LogRow[]): { date: string; label: string; rows: LogRow[] }[] {
  const groups: Record<string, LogRow[]> = {};
  rows.forEach((r) => {
    const d = new Date(r.created_at);
    const key = d.toISOString().slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.keys(groups)
    .sort()
    .reverse()
    .map((k) => ({
      date: k,
      label: new Date(k).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      rows: groups[k],
    }));
}

export function StudentLogsTab({ studentId }: { studentId: string }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [dayF, setDayF] = useState("all");
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("student_activity_logs")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1500);
    if (error) {
      console.warn("student_activity_logs read failed, using fallback", error);
      try {
        setRows((await fetchStudentLogsFallback(studentId)) as LogRow[]);
      } catch (fallbackError) {
        setError((fallbackError as Error)?.message || error.message);
      }
    } else setRows((data as LogRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`activity-${studentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "student_activity_logs", filter: `student_id=eq.${studentId}` },
        (payload) => setRows((prev) => [payload.new as LogRow, ...prev].slice(0, 1500)),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const summary = useMemo(() => {
    const total = rows.length;
    const logins = rows.filter((r) => r.action_type === "login").length;
    const logouts = rows.filter((r) => r.action_type === "logout").length;
    const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean)).size;
    const uniqueDays = new Set(rows.map((r) => r.created_at.slice(0, 10))).size;
    const lastActivity = rows[0]?.created_at || null;
    return { total, logins, logouts, sessions, uniqueDays, lastActivity };
  }, [rows]);

  const days = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.created_at.slice(0, 10)));
    return [...set].sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (typeF !== "all" && r.action_type !== typeF) return false;
    if (dayF !== "all" && r.created_at.slice(0, 10) !== dayF) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = `${ACTION_META[r.action_type]?.label ?? r.action_type} ${r.description ?? ""} ${r.action_label ?? ""} ${r.page_path ?? ""} ${r.ip_address ?? ""} ${r.browser ?? ""} ${r.os ?? ""} ${r.device_type ?? ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [rows, q, typeF, dayF]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const exportAll = () => {
    exportToExcel(filtered.map((r) => ({
      "التاريخ": dateFmt(r.created_at),
      "الحدث": ACTION_META[r.action_type]?.label ?? r.action_type,
      "التفاصيل": r.description || r.action_label || "",
      "الصفحة": r.page_path || "",
      "الجهاز": r.device_type || "",
      "النظام": r.os || "",
      "المتصفح": r.browser || "",
      "IP": r.ip_address || "",
      "المدة (ث)": r.duration_seconds ?? "",
    })), `student-logs-${studentId.slice(0, 8)}`);
  };

  const toggleDay = (d: string) => setOpenDays((s) => ({ ...s, [d]: !s[d] }));

  if (loading) {
    return (
      <div className="min-h-[240px] flex flex-col items-center justify-center gap-3 text-slate-500 bg-white rounded-3xl border border-slate-100">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <p className="text-xs">جاري تحميل السجلات…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50/70 border border-rose-200 rounded-3xl text-center space-y-3">
        <AlertTriangle className="h-8 w-8 mx-auto text-rose-500" />
        <h4 className="font-bold text-rose-700">تعذّر تحميل السجلات</h4>
        <p className="text-xs text-rose-600/80">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>إعادة المحاولة</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SumCard label="إجمالي السجلات"   value={fmt(summary.total)}     icon={Activity} gradient="from-indigo-500 to-blue-500" />
        <SumCard label="عدد الجلسات"      value={fmt(summary.sessions)}  icon={Clock3}   gradient="from-violet-500 to-fuchsia-500" />
        <SumCard label="تسجيلات الدخول"   value={fmt(summary.logins)}    icon={LogIn}    gradient="from-emerald-500 to-teal-500" />
        <SumCard label="تسجيلات الخروج"   value={fmt(summary.logouts)}   icon={LogOut}   gradient="from-amber-500 to-orange-500" />
        <SumCard label="أيام نشطة"        value={fmt(summary.uniqueDays)} icon={BookOpen} gradient="from-rose-500 to-red-500" />
      </div>

      {summary.lastActivity && (
        <div className="bg-gradient-to-l from-emerald-50 via-white to-white border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white text-emerald-600 flex items-center justify-center ring-2 ring-emerald-100">
            <Activity className="h-4 w-4" />
          </div>
          <div className="text-xs text-slate-600">
            <span className="font-bold text-slate-800">آخر نشاط:</span>{" "}
            <span className="text-emerald-700 font-semibold">{dateFmt(summary.lastActivity)}</span>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث في السجلات (نوع الحدث، صفحة، جهاز، IP…)"
            className="pr-9 h-9 bg-slate-50 border-slate-200 focus-visible:ring-emerald-500"
          />
        </div>
        <Select value={typeF} onValueChange={setTypeF}>
          <SelectTrigger className="w-[160px] h-9 bg-slate-50 border-slate-200"><SelectValue placeholder="نوع الحدث" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأحداث</SelectItem>
            {Object.entries(ACTION_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={dayF} onValueChange={setDayF}>
          <SelectTrigger className="w-[150px] h-9 bg-slate-50 border-slate-200"><SelectValue placeholder="اليوم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأيام</SelectItem>
            {days.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportAll} className="h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          تصدير Excel
        </Button>
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl py-14 px-6 text-center">
          <Activity className="h-8 w-8 mx-auto text-slate-300 mb-3" />
          <h4 className="text-sm font-bold text-slate-800">لا توجد سجلات نشاط</h4>
          <p className="text-xs text-slate-500 mt-1">لم يقم الطالب بأي نشاط ضمن الفلترة الحالية.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((day) => {
            const isOpen = openDays[day.date] !== false;
            return (
              <div key={day.date} className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                <button
                  onClick={() => toggleDay(day.date)}
                  className="w-full px-5 py-3 flex items-center justify-between bg-gradient-to-l from-slate-50 via-white to-white hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[11px]">
                      {new Date(day.date).getDate()}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900">{day.label}</div>
                      <div className="text-[11px] text-slate-500">{fmt(day.rows.length)} حدث</div>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                {isOpen && (
                  <ol className="relative px-5 py-4 space-y-3">
                    <span className="absolute right-[38px] top-4 bottom-4 w-px bg-slate-100" />
                    {day.rows.map((r) => {
                      const meta = ACTION_META[r.action_type] ?? { label: r.action_type, icon: Activity, tone: "slate" };
                      const tone = TONE_MAP[meta.tone];
                      const Icon = meta.icon;
                      return (
                        <li key={r.id} className="relative flex items-start gap-3 pr-2">
                          <div className={`relative z-10 h-8 w-8 rounded-full ring-4 ring-white ${tone.bg} ${tone.icon} flex items-center justify-center`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-50/60 rounded-2xl border border-slate-100 p-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${tone.badge}`}>{meta.label}</span>
                                {r.duration_seconds ? (
                                  <span className="text-[10px] text-slate-500 inline-flex items-center gap-1">
                                    <Clock3 className="h-3 w-3" /> {fmt(Math.round(r.duration_seconds))} ث
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">{new Date(r.created_at).toLocaleTimeString("ar-EG")}</span>
                            </div>
                            {(r.description || r.action_label) && (
                              <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">{r.description || r.action_label}</p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                              {r.page_path && <span className="font-mono">{r.page_path}</span>}
                              {r.device_type && <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" />{r.device_type}</span>}
                              {(r.os || r.browser) && <span>{[r.os, r.browser].filter(Boolean).join(" • ")}</span>}
                              {r.ip_address && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{r.ip_address}</span>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SumCard({ label, value, icon: Icon, gradient }: { label: string; value: string; icon: any; gradient: string }) {
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-100 p-4">
      <div className={`absolute -top-6 -left-6 h-20 w-20 rounded-full bg-gradient-to-br ${gradient} opacity-10`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 truncate">{label}</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums leading-tight">{value}</p>
        </div>
        <div className={`shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-md`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
