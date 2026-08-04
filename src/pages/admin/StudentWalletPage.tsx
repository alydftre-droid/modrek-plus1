import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Printer,
  RefreshCw, Search, Wallet, Clock, CheckCircle2, XCircle, Filter, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportXlsx } from "@/components/admin/notifications/exports";
import {
  STATUS_OPTIONS, fmtDate, fmtDateTime, fmtMoney, fmtTime, operationNumber,
  paymentMethodLabel, depositTypeLabel, shortId, statusMeta,
} from "@/components/admin/student-wallet/depositMeta";

export interface DepositRow {
  id: string;
  student_id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  deposit_type: string | null;
  phone_number: string | null;
  receipt_url: string | null;
  recharge_code: string | null;
  notes: string | null;
  admin_message: string | null;
  rejection_reason: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  wallet_adjustment_id: string | null;
  student_name: string | null;
  student_email: string | null;
  student_phone: string | null;
  student_avatar: string | null;
  student_code: string | null;
  student_stage: string | null;
  student_grade: string | null;
  student_section: string | null;
  student_education_type: string | null;
  is_test_account: boolean | null;
  processed_by_name: string | null;
  audit_events: number | null;
}

interface Stats {
  total: number; pending: number; approved: number; rejected: number; cancelled: number;
  total_amount: number; approved_amount: number; pending_amount: number;
  credited_today: number; credited_week: number; credited_month: number;
  avg_review_minutes: number;
}

type DateRange = "all" | "today" | "yesterday" | "week" | "month" | "custom";

const PAGE_SIZE = 25;

function rangeToDates(range: DateRange, fromStr: string, toStr: string) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (range) {
    case "today": {
      const s = startOfDay(now);
      return { from: s.toISOString(), to: null as string | null };
    }
    case "yesterday": {
      const s = startOfDay(new Date(now.getTime() - 86400000));
      const e = startOfDay(now);
      return { from: s.toISOString(), to: e.toISOString() };
    }
    case "week": {
      const s = startOfDay(new Date(now.getTime() - 6 * 86400000));
      return { from: s.toISOString(), to: null };
    }
    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: s.toISOString(), to: null };
    }
    case "custom": {
      return {
        from: fromStr ? new Date(`${fromStr}T00:00:00`).toISOString() : null,
        to: toStr ? new Date(`${toStr}T23:59:59`).toISOString() : null,
      };
    }
    default:
      return { from: null, to: null };
  }
}

const StatCard = ({
  label, value, hint, icon: Icon, tone,
}: { label: string; value: string; hint?: string; icon: any; tone: string }) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-lg font-bold text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  </div>
);

export default function StudentWalletPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [live, setLive] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [grade, setGrade] = useState("all");
  const [range, setRange] = useState<DateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [page, setPage] = useState(1);

  // debounce search (instant feel, < 1 request per keystroke burst)
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters = useMemo(() => {
    const { from, to } = rangeToDates(range, customFrom, customTo);
    return {
      _search: search || null,
      _status: status,
      _method: method,
      _grade: grade,
      _from: from,
      _to: to,
      _min_amount: minAmount ? Number(minAmount) : null,
      _max_amount: maxAmount ? Number(maxAmount) : null,
    };
  }, [search, status, method, grade, range, customFrom, customTo, minAmount, maxAmount]);

  const reqIdRef = useRef(0);

  const fetchRows = useCallback(async (targetPage: number, silent = false) => {
    const rid = ++reqIdRef.current;
    if (!silent) setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_list_student_deposits", {
        ...filters,
        _limit: PAGE_SIZE,
        _offset: (targetPage - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      if (rid !== reqIdRef.current) return;
      setRows((data?.rows ?? []) as DepositRow[]);
      setTotal(Number(data?.total ?? 0));
    } catch (e: any) {
      if (rid === reqIdRef.current) {
        console.error(e);
        toast.error("تعذر تحميل طلبات الإيداع");
      }
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  }, [filters]);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any).rpc("admin_student_deposit_stats");
      if (error) throw error;
      setStats(data as Stats);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { fetchRows(page); }, [fetchRows, page]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Realtime — refresh silently on any deposit change
  useEffect(() => {
    const channel = supabase
      .channel("admin-student-deposits")
      .on("postgres_changes", { event: "*", schema: "public", table: "deposit_requests" }, () => {
        fetchRows(page, true);
        fetchStats();
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [fetchRows, fetchStats, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportRows = () =>
    rows.map((r) => ({
      "رقم العملية": operationNumber(r.id),
      "معرف العملية": r.id,
      "الطالب": r.student_name ?? "—",
      "ID الطالب": r.student_code ?? shortId(r.student_id),
      "البريد الإلكتروني": r.student_email ?? "—",
      "رقم الهاتف": r.student_phone ?? r.phone_number ?? "—",
      "الصف الدراسي": r.student_grade ?? "—",
      "المبلغ": Number(r.amount),
      "الرسوم": 0,
      "صافي المبلغ": Number(r.amount),
      "وسيلة الدفع": paymentMethodLabel(r.payment_method),
      "نوع الإيداع": depositTypeLabel(r.deposit_type),
      "كود الشحن": r.recharge_code ?? "—",
      "الحالة": statusMeta(r.status).label,
      "تاريخ الإنشاء": fmtDate(r.created_at),
      "وقت الإنشاء": fmtTime(r.created_at),
      "تاريخ المراجعة": fmtDate(r.processed_at),
      "وقت المراجعة": fmtTime(r.processed_at),
      "المشرف المراجع": r.processed_by_name ?? "—",
      "آخر تعديل": fmtDateTime(r.updated_at),
    }));

  const doExcel = () => {
    if (!rows.length) return toast.error("لا توجد بيانات للتصدير");
    exportXlsx(`student-deposits-${new Date().toISOString().slice(0, 10)}`, exportRows(), "طلبات الإيداع");
    toast.success("تم تصدير ملف Excel");
  };

  const doPrint = () => {
    const data = exportRows();
    if (!data.length) return toast.error("لا توجد بيانات للطباعة");
    const headers = Object.keys(data[0]);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>طلبات الإيداع</title>
      <style>body{font-family:Cairo,system-ui,sans-serif;padding:16px}h1{font-size:18px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #cbd5e1;padding:5px;text-align:right}th{background:#f1f5f9}</style></head>
      <body><h1>طلبات إيداع الطلاب — ${new Date().toLocaleString("ar-EG")}</h1>
      <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${data.map((r: any) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const resetFilters = () => {
    setSearchInput(""); setStatus("all"); setMethod("all"); setGrade("all");
    setRange("all"); setCustomFrom(""); setCustomTo(""); setMinAmount(""); setMaxAmount("");
    setPage(1);
  };

  const gradeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.student_grade).filter(Boolean))) as string[],
    [rows],
  );
  const methodOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.payment_method).filter(Boolean))) as string[],
    [rows],
  );

  return (
    <div dir="rtl" className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-mudrik">
            <Wallet className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-foreground">محفظة الطلاب</h1>
            <p className="text-[11px] text-muted-foreground">
              إدارة ومراجعة جميع عمليات الإيداع — {total.toLocaleString("ar-EG")} طلب
            </p>
          </div>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Radio className={`h-3 w-3 ${live ? "text-emerald-500" : "text-muted-foreground"}`} />
            {live ? "مباشر" : "غير متصل"}
          </Badge>
          <Button variant="outline" size="icon" onClick={() => { fetchRows(page); fetchStats(); }}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="إجمالي طلبات الإيداع" value={(stats?.total ?? 0).toLocaleString("ar-EG")}
            hint={`إجمالي المبالغ ${fmtMoney(stats?.total_amount)}`} icon={Wallet}
            tone="bg-primary/10 text-primary" />
          <StatCard label="المقبولة" value={(stats?.approved ?? 0).toLocaleString("ar-EG")}
            hint={fmtMoney(stats?.approved_amount)} icon={CheckCircle2}
            tone="bg-emerald-100 text-emerald-700" />
          <StatCard label="قيد المراجعة" value={(stats?.pending ?? 0).toLocaleString("ar-EG")}
            hint={fmtMoney(stats?.pending_amount)} icon={Clock}
            tone="bg-amber-100 text-amber-700" />
          <StatCard label="المرفوضة / الملغاة"
            value={`${(stats?.rejected ?? 0).toLocaleString("ar-EG")} / ${(stats?.cancelled ?? 0).toLocaleString("ar-EG")}`}
            icon={XCircle} tone="bg-rose-100 text-rose-700" />
          <StatCard label="رصيد مضاف اليوم" value={fmtMoney(stats?.credited_today)} icon={Wallet}
            tone="bg-sky-100 text-sky-700" />
          <StatCard label="هذا الأسبوع" value={fmtMoney(stats?.credited_week)} icon={Wallet}
            tone="bg-sky-100 text-sky-700" />
          <StatCard label="هذا الشهر" value={fmtMoney(stats?.credited_month)} icon={Wallet}
            tone="bg-sky-100 text-sky-700" />
          <StatCard label="متوسط وقت المراجعة"
            value={`${(stats?.avg_review_minutes ?? 0).toLocaleString("ar-EG")} دقيقة`} icon={Clock}
            tone="bg-violet-100 text-violet-700" />
        </div>

        {/* Search + filters */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="بحث ذكي: الاسم، ID، البريد، الهاتف، رقم العملية، المبلغ، التاريخ، وسيلة الدفع، الحالة..."
                className="pr-9"
              />
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5">
                    <Download className="h-4 w-4" /> تصدير
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={doExcel}>
                    <FileSpreadsheet className="ml-2 h-4 w-4" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={doPrint}>
                    <Printer className="ml-2 h-4 w-4" /> PDF / طباعة
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" onClick={resetFilters} className="gap-1.5">
                <Filter className="h-4 w-4" /> تصفير
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={range} onValueChange={(v) => { setRange(v as DateRange); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="الفترة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفترات</SelectItem>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="yesterday">أمس</SelectItem>
                <SelectItem value="week">هذا الأسبوع</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
                <SelectItem value="custom">فترة مخصصة</SelectItem>
              </SelectContent>
            </Select>

            <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="وسيلة الدفع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل وسائل الدفع</SelectItem>
                {methodOptions.map((m) => (
                  <SelectItem key={m} value={m}>{paymentMethodLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={grade} onValueChange={(v) => { setGrade(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="الصف الدراسي" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الصفوف</SelectItem>
                {gradeOptions.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number" inputMode="decimal" value={minAmount}
              onChange={(e) => { setMinAmount(e.target.value); setPage(1); }}
              placeholder="أقل مبلغ"
            />
            <Input
              type="number" inputMode="decimal" value={maxAmount}
              onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }}
              placeholder="أعلى مبلغ"
            />

            {range === "custom" && (
              <>
                <Input type="date" value={customFrom}
                  onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }} />
                <Input type="date" value={customTo}
                  onChange={(e) => { setCustomTo(e.target.value); setPage(1); }} />
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {["الطالب", "ID", "البريد", "الهاتف", "الصف", "رقم العملية", "المبلغ", "الرسوم", "الصافي",
                    "وسيلة الدفع", "النوع", "الحالة", "الإنشاء", "المراجعة", "المشرف", "آخر تعديل", "أحداث"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 17 }).map((__, j) => (
                        <td key={j} className="px-3 py-3"><div className="h-3 rounded bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="py-12 text-center text-sm text-muted-foreground">
                      لا توجد طلبات إيداع مطابقة
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const meta = statusMeta(r.status);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/admin/student-wallets/${r.id}`)}
                        className="cursor-pointer hover:bg-accent/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={r.student_avatar || ""} />
                              <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                                {(r.student_name || "؟").slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="max-w-[160px] truncate font-medium text-foreground">
                              {r.student_name || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                          {r.student_code ?? shortId(r.student_id)}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-xs">{r.student_email ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                          {r.student_phone ?? r.phone_number ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{r.student_grade ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{operationNumber(r.id)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-bold">{fmtMoney(r.amount)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{fmtMoney(0)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold">{fmtMoney(r.amount)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{paymentMethodLabel(r.payment_method)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{depositTypeLabel(r.deposit_type)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">
                          {fmtDate(r.created_at)}<br />
                          <span className="text-muted-foreground">{fmtTime(r.created_at)}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">
                          {r.processed_at ? (
                            <>
                              {fmtDate(r.processed_at)}<br />
                              <span className="text-muted-foreground">{fmtTime(r.processed_at)}</span>
                            </>
                          ) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{r.processed_by_name ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[11px]">{fmtDateTime(r.updated_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs">
                          {Number(r.audit_events ?? 0).toLocaleString("ar-EG")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              صفحة {page.toLocaleString("ar-EG")} من {totalPages.toLocaleString("ar-EG")} — {total.toLocaleString("ar-EG")} سجل
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronRight className="h-4 w-4" /> السابق
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
