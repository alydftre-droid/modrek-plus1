import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Save, CalendarDays, Clock, Lock, Unlock, Zap, ShieldAlert,
  Wallet, Snowflake, Users, ArrowUpRight, CheckCircle2, XCircle, History,
  AlertTriangle, PlayCircle, RefreshCw, TrendingUp, Search, User, Crown,
  Sparkles, Activity, FileText, ChevronRight, Coins, Landmark, Gift,
  MinusCircle, PlusCircle, ShieldCheck, Bell, Settings as SettingsIcon,
  Archive, HandCoins,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";


const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 30, 40, 45, 50];

const fmt = (n: any) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: any) => Number(n || 0).toLocaleString("ar-EG");
const formatArabicClock = (hour: number, minute: number) => {
  const period = hour >= 12 ? "مساءً" : "صباحاً";
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
};

const isRecoverableRpcError = (message?: string | null) => {
  const text = (message || "").toLowerCase();
  return text.includes("schema cache") || text.includes("could not find the function") || text.includes("permission denied for function");
};

// ------------------------------------------------------------
// Root component (kept name for existing SettingsPage import)
// ------------------------------------------------------------
export default function WithdrawalSettings() {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadOverview = async () => {
    setLoadError(null);
    const { data, error } = await supabase.rpc("admin_financial_overview" as any);
    if (error) {
      console.error("[WithdrawalSettings] admin_financial_overview error:", error);
      if (isRecoverableRpcError(error.message)) {
        setLoadError("تم إصلاح دالة البيانات المالية، لكن واجهة الخادم ما زالت تحدّث الفهرس. تعرض الصفحة بيانات احتياطية مؤقتاً.");
        const fallback = await loadOverviewFallback();
        setOverview(fallback);
        return;
      }
      setLoadError(error.message || "خطأ في الاتصال بقاعدة البيانات");
      return;
    }
    const r = data as any;
    if (!r?.success) {
      const msg = r?.error || "استجابة غير متوقعة من الخادم";
      console.warn("[WithdrawalSettings] RPC returned failure:", r);
      setLoadError(msg);
      return;
    }
    setOverview(r);
  };

  const loadOverviewFallback = async () => {
    const nowCairo = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const period = `${nowCairo.getFullYear()}-${String(nowCairo.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(nowCairo.getFullYear(), nowCairo.getMonth(), 1).toISOString();

    const [walletsRes, earningsRes, withdrawalsRes, settingsRes, archivesRes] = await Promise.all([
      supabase.from("teacher_wallets").select("teacher_id,balance,frozen_balance,total_earned"),
      supabase.from("teacher_earning_records").select("teacher_id,student_id,group_id,gross_amount,net_amount,period_label").eq("period_label", period),
      supabase.from("teacher_withdrawal_requests").select("amount,status,processed_at"),
      supabase.from("platform_settings").select("key,value").in("key", ["withdrawal_last_release_at", "withdrawal_manual_state", "withdrawal_open_day", "withdrawal_open_hour", "withdrawal_open_minute"]),
      supabase.from("teacher_monthly_archives").select("id,archived_at").gte("archived_at", monthStart),
    ]);

    const wallets = walletsRes.data || [];
    const earnings = earningsRes.data || [];
    const withdrawals = withdrawalsRes.data || [];
    const settings = new Map((settingsRes.data || []).map((s: any) => [s.key, s.value]));
    const teacherTotals = new Map<string, number>();
    earnings.forEach((e: any) => teacherTotals.set(e.teacher_id, (teacherTotals.get(e.teacher_id) || 0) + Number(e.net_amount || 0)));
    const teacherNetValues = Array.from(teacherTotals.values());
    return {
      success: true,
      period,
      total_available: wallets.reduce((s: number, w: any) => s + Number(w.balance || 0), 0),
      total_frozen: wallets.reduce((s: number, w: any) => s + Number(w.frozen_balance || 0), 0),
      total_teachers: wallets.length,
      teachers_with_frozen: wallets.filter((w: any) => Number(w.frozen_balance || 0) > 0).length,
      teachers_with_available: wallets.filter((w: any) => Number(w.balance || 0) > 0).length,
      total_earned_all_time: wallets.reduce((s: number, w: any) => s + Number(w.total_earned || 0), 0),
      month_gross: earnings.reduce((s: number, e: any) => s + Number(e.gross_amount || 0), 0),
      month_teacher_net: earnings.reduce((s: number, e: any) => s + Number(e.net_amount || 0), 0),
      month_platform_cut: earnings.reduce((s: number, e: any) => s + (Number(e.gross_amount || 0) - Number(e.net_amount || 0)), 0),
      month_paying_students: new Set(earnings.map((e: any) => e.student_id).filter(Boolean)).size,
      month_subscriptions: earnings.length,
      active_groups: new Set(earnings.map((e: any) => e.group_id).filter(Boolean)).size,
      pending_requests: withdrawals.filter((w: any) => w.status === "pending").length,
      pending_amount: withdrawals.filter((w: any) => w.status === "pending").reduce((s: number, w: any) => s + Number(w.amount || 0), 0),
      approved_total: withdrawals.filter((w: any) => w.status === "approved").reduce((s: number, w: any) => s + Number(w.amount || 0), 0),
      approved_count: withdrawals.filter((w: any) => w.status === "approved").length,
      rejected_count: withdrawals.filter((w: any) => w.status === "rejected").length,
      approved_this_month: withdrawals.filter((w: any) => w.status === "approved" && w.processed_at >= monthStart).reduce((s: number, w: any) => s + Number(w.amount || 0), 0),
      archives_this_month: archivesRes.data?.length || 0,
      avg_teacher_earnings_month: teacherNetValues.length ? teacherNetValues.reduce((s, v) => s + v, 0) / teacherNetValues.length : 0,
      top_teacher: {},
      revenue_series: [],
      last_release_at: settings.get("withdrawal_last_release_at"),
      manual_state: settings.get("withdrawal_manual_state") || "auto",
      open_day: settings.get("withdrawal_open_day") || "25",
      open_hour: settings.get("withdrawal_open_hour") || "9",
      open_minute: settings.get("withdrawal_open_minute") || "0",
    };
  };

  useEffect(() => {
    (async () => {
      await loadOverview();
      setLoading(false);
    })();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const cairoTime = now.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const cairoDate = now.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="space-y-4 pb-8 text-slate-950" dir="rtl">
      {/* Page title + gear */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-700 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <Wallet className="h-4 w-4" />
          </div>
          <p className="font-black text-lg text-slate-950 truncate">إعدادات السحب</p>
        </div>
        <Button
          onClick={() => setSettingsOpen(true)}
          className="h-10 gap-1.5 bg-slate-900 hover:bg-slate-800 text-white border-0 shadow-md font-black text-[12px] px-3"
        >
          <SettingsIcon className="h-4 w-4" />
          الإعدادات والسجل
        </Button>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-slate-950 via-blue-800 to-emerald-600 p-5 text-white shadow-2xl">
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium opacity-90 mb-1">
              <Sparkles className="h-3.5 w-3.5" />
              مركز التحكم المالي — Financial Control Center
            </div>
            <p className="text-2xl font-black tracking-tight leading-tight">
              {loading ? "..." : `${fmt((overview?.total_available || 0) + (overview?.total_frozen || 0))} ج`}
            </p>
            <p className="text-[11px] mt-1 opacity-90">
              إجمالي أرصدة المعلمين (متاح + مجمّد) • {overview?.total_teachers || 0} معلم
            </p>
          </div>
          <div className="text-left shrink-0">
            <div className="flex items-center gap-1.5 text-[10px] opacity-80 justify-end mb-0.5">
              <Clock className="h-3 w-3" /> القاهرة
            </div>
            <p className="text-lg font-bold tabular-nums" dir="ltr">{cairoTime}</p>
            <p className="text-[10px] opacity-90">{cairoDate}</p>
          </div>
        </div>
      </div>

      {loadError && (
        <Card className="border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-amber-950 dark:text-amber-100">تنبيه تحميل البيانات المالية</p>
                <p className="text-[11px] text-amber-900 dark:text-amber-200 mt-0.5 break-words">{loadError}</p>
              </div>
              <Button
                size="sm"
                onClick={async () => { setLoading(true); await loadOverview(); setLoading(false); }}
                className="h-8 gap-1 bg-amber-600 hover:bg-amber-700 text-white border-0 shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" /> إعادة
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="w-full grid grid-cols-5 h-12 rounded-xl bg-slate-200 p-1 shadow-inner border border-slate-300">
          <TabsTrigger value="overview" className="text-[11px] gap-1 text-slate-800 font-black data-[state=active]:bg-blue-700 data-[state=active]:text-white data-[state=active]:shadow-lg"><Activity className="h-3.5 w-3.5" />نظرة</TabsTrigger>
          <TabsTrigger value="closing" className="text-[11px] gap-1 text-slate-800 font-black data-[state=active]:bg-emerald-700 data-[state=active]:text-white data-[state=active]:shadow-lg"><CalendarDays className="h-3.5 w-3.5" />الإقفال</TabsTrigger>
          <TabsTrigger value="withdrawals" className="text-[11px] gap-1 text-slate-800 font-black data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-lg"><ArrowUpRight className="h-3.5 w-3.5" />السحب</TabsTrigger>
          <TabsTrigger value="teachers" className="text-[11px] gap-1 text-slate-800 font-black data-[state=active]:bg-violet-700 data-[state=active]:text-white data-[state=active]:shadow-lg"><Users className="h-3.5 w-3.5" />المحافظ</TabsTrigger>
          <TabsTrigger value="audit" className="text-[11px] gap-1 text-slate-800 font-black data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-lg"><FileText className="h-3.5 w-3.5" />السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab overview={overview} loading={loading} onReload={loadOverview} />
        </TabsContent>
        <TabsContent value="closing" className="mt-4">
          <ClosingTab overview={overview} loading={loading} onReload={loadOverview} />
        </TabsContent>
        <TabsContent value="withdrawals" className="mt-4">
          <WithdrawalsTab overview={overview} onReload={loadOverview} />
        </TabsContent>
        <TabsContent value="teachers" className="mt-4">
          <TeachersTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function OverviewTab({ overview, loading, onReload }: any) {
  const kpis = useMemo(() => ([
    { label: "متاح للسحب", value: `${fmt(overview?.total_available)} ج`, icon: Wallet, tint: "from-emerald-500 to-green-500" },
    { label: "مجمّد", value: `${fmt(overview?.total_frozen)} ج`, icon: Snowflake, tint: "from-cyan-500 to-blue-500" },
    { label: "إيراد الشهر (إجمالي)", value: `${fmt(overview?.month_gross)} ج`, icon: TrendingUp, tint: "from-violet-500 to-purple-500" },
    { label: "نصيب المعلمين", value: `${fmt(overview?.month_teacher_net)} ج`, icon: Coins, tint: "from-amber-500 to-orange-500" },
    { label: "عمولة المنصة", value: `${fmt(overview?.month_platform_cut)} ج`, icon: Landmark, tint: "from-fuchsia-500 to-pink-500" },
    { label: "طلاب دفعوا هذا الشهر", value: fmtInt(overview?.month_paying_students), icon: Users, tint: "from-teal-500 to-emerald-600" },
    { label: "اشتراكات الشهر", value: fmtInt(overview?.month_subscriptions), icon: Sparkles, tint: "from-blue-500 to-indigo-500" },
    { label: "مجموعات فعّالة", value: fmtInt(overview?.active_groups), icon: Activity, tint: "from-slate-500 to-gray-600" },
    { label: "طلبات معلقة", value: `${fmtInt(overview?.pending_requests)}`, sub: `${fmt(overview?.pending_amount)} ج`, icon: AlertTriangle, tint: "from-orange-500 to-red-500" },
    { label: "مسحوبات مكتملة", value: `${fmt(overview?.approved_total)} ج`, sub: `${fmtInt(overview?.approved_count)} عملية`, icon: CheckCircle2, tint: "from-teal-500 to-emerald-600" },
    { label: "متوسط أرباح معلم/شهر", value: `${fmt(overview?.avg_teacher_earnings_month)} ج`, icon: Users, tint: "from-indigo-500 to-blue-600" },
    { label: "أرشيفات هذا الشهر", value: fmtInt(overview?.archives_this_month), icon: History, tint: "from-slate-500 to-gray-600" },
  ]), [overview]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {kpis.map((k, i) => (
          <KpiCard key={i} {...k} loading={loading} />
        ))}
      </div>

      {/* Top teacher */}
      {overview?.top_teacher?.name && (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 p-4 text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] opacity-90">صاحب أعلى دخل هذا الشهر</p>
              <p className="font-bold truncate">{overview.top_teacher.name}</p>
            </div>
            <p className="text-lg font-black shrink-0">{fmt(overview.top_teacher.earnings)} ج</p>
          </div>
        </Card>
      )}

      {/* Revenue chart */}
        <Card className="border border-slate-200 shadow-md bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-black text-sm text-slate-950">إيرادات آخر 6 أشهر</p>
              <p className="text-[10px] text-slate-600 font-semibold">إجمالي vs نصيب المعلمين</p>
            </div>
            <Button variant="outline" size="sm" onClick={onReload} className="h-8 gap-1 text-[11px] border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </Button>
          </div>
          <div className="h-48 -mx-2">
            {loading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview?.revenue_series || []}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent-foreground))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--accent-foreground))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Area type="monotone" dataKey="gross" stroke="hsl(var(--primary))" fill="url(#g1)" name="إجمالي" />
                  <Area type="monotone" dataKey="teacher_net" stroke="hsl(var(--accent-foreground))" fill="url(#g2)" name="نصيب المعلم" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, tint, loading }: any) {
  return (
    <Card className="border border-slate-200 bg-white shadow-md overflow-hidden group hover:shadow-lg transition-all">
      <CardContent className="p-3">
        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${tint} text-white flex items-center justify-center mb-2 shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[10px] text-slate-600 font-bold leading-tight">{label}</p>
        {loading ? (
          <Skeleton className="h-4 w-16 mt-1" />
        ) : (
          <>
            <p className="text-sm font-extrabold mt-0.5 truncate text-slate-950">{value}</p>
            {sub && <p className="text-[9px] text-slate-500 font-semibold truncate">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// CLOSING SCHEDULE TAB (day/time + instant + emergency)
// ============================================================
function ClosingTab({ overview, loading, onReload }: any) {
  const [openDay, setOpenDay] = useState(25);
  const [openHour, setOpenHour] = useState(9);
  const [openMinute, setOpenMinute] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [pendingStopped, setPendingStopped] = useState<boolean | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!overview) return;
    setOpenDay(Math.min(28, Math.max(1, parseInt(overview.open_day || "25"))));
    setOpenHour(Math.min(23, Math.max(0, parseInt(overview.open_hour || "9"))));
    setOpenMinute(Math.min(59, Math.max(0, parseInt(overview.open_minute || "0"))));
    setStopped(overview.manual_state === "closed");
  }, [overview]);

  const upsert = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("platform_settings").select("id").eq("key", key).maybeSingle();
    if (existing) {
      await supabase.from("platform_settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("id", (existing as any).id);
    } else {
      await supabase.from("platform_settings").insert({ key, value });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsert("withdrawal_open_day", String(openDay)),
        upsert("withdrawal_open_hour", String(openHour)),
        upsert("withdrawal_open_minute", String(openMinute)),
        upsert("withdrawal_manual_state", stopped ? "closed" : "auto"),
      ]);
      toast.success("تم حفظ إعدادات الإقفال");
      onReload();
    } catch (e) {
      toast.error("خطأ في الحفظ");
    } finally { setSaving(false); }
  };

  const handleInstantRelease = async () => {
    setReleasing(true);
    try {
      const { data, error } = await supabase.rpc("archive_all_teachers_period" as any);
      if (error) throw error;
      const r = data as any;
      if (!r?.success) { toast.error(r?.error || "فشل التنفيذ"); return; }
      toast.success(`تم إقفال ${r.archived_count || 0} معلم — تم نقل ${fmt(r.total_moved)} ج`);
      onReload();
    } catch (e: any) {
      toast.error(e?.message || "خطأ");
    } finally {
      setReleasing(false); setConfirmRelease(false);
    }
  };

  const cairoNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const cairoDay = cairoNow.getDate();
  const nextRelease = useMemo(() => {
    const y = cairoNow.getFullYear(); const m = cairoNow.getMonth();
    let t = new Date(y, m, openDay, openHour, openMinute, 0);
    if (t.getTime() <= cairoNow.getTime()) t = new Date(y, m + 1, openDay, openHour, openMinute, 0);
    return t;
  }, [cairoNow, openDay, openHour, openMinute]);

  const diffMs = Math.max(0, nextRelease.getTime() - cairoNow.getTime());
  const dDays = Math.floor(diffMs / 86400000);
  const dHours = Math.floor((diffMs % 86400000) / 3600000);
  const dMins = Math.floor((diffMs % 3600000) / 60000);
  const dSecs = Math.floor((diffMs % 60000) / 1000);
  const timeLabel = formatArabicClock(openHour, openMinute);

  return (
    <div className="space-y-4">
      {/* Countdown */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-blue-900 p-5 text-white">
          <div className="flex items-center gap-2 text-[10px] opacity-80 mb-2">
            <Clock className="h-3.5 w-3.5" /> الإقفال الشهري القادم
          </div>
          <div className="grid grid-cols-4 gap-2 tabular-nums" dir="ltr">
            {[["يوم", dDays], ["ساعة", dHours], ["دقيقة", dMins], ["ثانية", dSecs]].map(([lbl, v]) => (
              <div key={lbl as string} className="bg-white/10 backdrop-blur rounded-lg p-2 text-center border border-white/10">
                <p className="text-2xl font-black">{String(v).padStart(2, "0")}</p>
                <p className="text-[9px] opacity-70">{lbl}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-3 opacity-90 text-center" dir="ltr">
            {nextRelease.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })} • {timeLabel}
          </p>
        </div>
      </Card>

      {/* Info banner */}
      <Card className="border-2 border-blue-200 bg-blue-50 shadow-sm">
        <CardContent className="p-3 text-[11px] leading-relaxed text-blue-950 flex gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-blue-700" />
          <div>
            في الموعد المحدد يتم تلقائياً: <strong>نقل الرصيد المجمّد → المتاح للسحب</strong> +
            <strong> أرشفة السجل الشهري كامل </strong>
            (المجموعات، الطلاب، الاشتراكات، العمولة) لكل معلم.
          </div>
        </CardContent>
      </Card>

      {/* Instant Release */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div
          className="p-4 text-white"
          style={{ background: "linear-gradient(90deg, #10b981 0%, #0d9488 100%)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4" />
            <p className="font-bold text-sm">تنفيذ الإقفال الشهري فوراً</p>
          </div>
          <p className="text-[11px] opacity-95 leading-relaxed">
            نفّذ الإقفال الآن لجميع المعلمين ذوي الرصيد المجمّد. يُنشئ أرشيفاً محفوظاً للأبد.
          </p>
        </div>
        <CardContent className="p-3 bg-emerald-50">
          <Button
            onClick={() => setConfirmRelease(true)}
            disabled={releasing}
            className="w-full h-11 gap-2 text-white border-0 shadow-md"
            style={{ background: "#059669" }}
          >
            {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            نفّذ الإقفال الآن
          </Button>
          {overview?.last_release_at && (
            <p className="text-[10px] text-slate-500 text-center mt-2">
              آخر تنفيذ: {new Date(overview.last_release_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Native-style Date & Time picker (single trigger) */}
        <Card className="border border-blue-200 shadow-md bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm text-slate-950">موعد الإقفال الشهري</p>
              <p className="text-[11px] text-slate-600 font-semibold">يُنفَّذ في نفس اليوم والوقت من كل شهر (توقيت القاهرة)</p>
            </div>
          </div>

          <DateTimePickerTrigger
            day={openDay}
            hour={openHour}
            minute={openMinute}
            onSave={(d, h, m) => { setOpenDay(d); setOpenHour(h); setOpenMinute(m); }}
          />

          <div className="rounded-lg p-3 text-xs border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 text-blue-900 dark:text-blue-100">
            الإقفال سيتم يوم <strong>{openDay}</strong> من كل شهر الساعة <strong>{timeLabel}</strong>.
          </div>
        </CardContent>
      </Card>


      {/* Emergency Stop */}
      <Card className={`border-0 shadow-md overflow-hidden ${stopped ? "ring-2 ring-red-500" : ""}`}>
        <div className={`p-4 text-white ${stopped ? "bg-gradient-to-r from-red-600 to-rose-600" : "bg-gradient-to-r from-slate-700 to-slate-800"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                {stopped ? <Lock className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm">إيقاف السحب — طوارئ</p>
                <p className="text-[10px] opacity-90 truncate">
                  {stopped ? "🔴 السحب متوقف — لا يمكن تقديم طلبات" : "السحب مفتوح — الطلبات مسموحة"}
                </p>
              </div>
            </div>
            <Switch
              checked={stopped}
              onCheckedChange={(v) => { setPendingStopped(v); setConfirmStop(true); }}
              className="data-[state=checked]:bg-red-500"
            />
          </div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving}
        className="w-full h-12 gap-2 text-white border-0 shadow-md"
        style={{ background: "linear-gradient(90deg, #10b981 0%, #059669 100%)" }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ إعدادات الإقفال
      </Button>

      {/* Dialogs */}
      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
          <AlertDialogContent dir="rtl" className="bg-white text-slate-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-600" /> تأكيد الإقفال الفوري
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              سيتم أرشفة السجل الشهري الحالي كامل ونقل الرصيد المجمّد إلى المتاح للسحب لجميع المعلمين. لا يمكن التراجع.
              <br /><br />
              <strong>الإجمالي المجمّد: {fmt(overview?.total_frozen)} ج</strong><br />
              <strong>المعلمون المتأثرون: {overview?.teachers_with_frozen || 0}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleInstantRelease} className="bg-emerald-700 text-white hover:bg-emerald-800">
              نعم، نفّذ الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
          <AlertDialogContent dir="rtl" className="bg-white text-slate-950">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingStopped ? <Lock className="h-5 w-5 text-red-600" /> : <Unlock className="h-5 w-5 text-emerald-600" />}
              {pendingStopped ? "إيقاف السحب" : "فتح السحب"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              {pendingStopped
                ? "لن يستطيع المعلمون تقديم طلبات سحب جديدة. لا يؤثر على الأرصدة أو الطلبات الحالية."
                : "سيتمكن المعلمون من تقديم طلبات السحب مجدداً."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStopped(null)} className="border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStopped !== null) setStopped(pendingStopped);
                setPendingStopped(null); setConfirmStop(false);
              }}
              className={pendingStopped ? "bg-red-700 text-white hover:bg-red-800" : "bg-emerald-700 text-white hover:bg-emerald-800"}
            >تأكيد ثم احفظ من الأسفل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Native-style Date & Time Picker (single trigger + 2-step modal)
// ============================================================
const AR_MONTH_NOW = () => new Date().toLocaleDateString("ar-EG", { month: "long", year: "numeric", timeZone: "Africa/Cairo" });
function DateTimePickerTrigger({
  day, hour, minute, onSave,
}: { day: number; hour: number; minute: number; onSave: (d: number, h: number, m: number) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"date" | "time">("date");
  const [d, setD] = useState(day);
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  const [period, setPeriod] = useState<"AM" | "PM">(hour >= 12 ? "PM" : "AM");

  useEffect(() => { if (open) { setD(day); setH(hour); setM(minute); setPeriod(hour >= 12 ? "PM" : "AM"); setStep("date"); } }, [open, day, hour, minute]);

  const label = `يوم ${day} • ${formatArabicClock(hour, minute)}`;
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const mins = Array.from({ length: 60 }, (_, i) => i);
  const displayHour = h % 12 || 12;
  const to24Hour = (hour12: number, meridiem: "AM" | "PM") => {
    if (meridiem === "AM") return hour12 === 12 ? 0 : hour12;
    return hour12 === 12 ? 12 : hour12 + 12;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-12 rounded-xl border-2 border-blue-300 hover:border-blue-600 bg-blue-50 transition-colors flex items-center justify-between px-4 group shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-500 text-white flex items-center justify-center">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="text-right">
            <p className="text-[10px] text-blue-800 font-bold leading-none">تاريخ ووقت الإقفال</p>
            <p className="text-sm font-black text-slate-950" dir="rtl">{label}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-blue-700 rotate-180 group-hover:text-blue-900 transition-colors" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md p-0 overflow-hidden bg-white text-slate-950">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-[11px] opacity-90">
                {step === "date" ? <CalendarDays className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                {step === "date" ? "الخطوة 1 من 2 — التاريخ" : "الخطوة 2 من 2 — الوقت"}
              </div>
              <div className="flex gap-1">
                <div className={`h-1.5 w-6 rounded-full ${step === "date" ? "bg-white" : "bg-white/40"}`} />
                <div className={`h-1.5 w-6 rounded-full ${step === "time" ? "bg-white" : "bg-white/40"}`} />
              </div>
            </div>
            <p className="text-lg font-bold">
              {step === "date" ? `اليوم ${d}` : formatArabicClock(h, m)}
            </p>
            <p className="text-[10px] opacity-80">{AR_MONTH_NOW()}</p>
          </div>

          <div className="p-4">
            {step === "date" ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => {
                  const active = n === d;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setD(n)}
                      className={`h-10 rounded-lg text-sm font-bold border transition-all ${
                        active
                          ? "bg-blue-600 text-white border-blue-700 shadow scale-105"
                          : "bg-white text-slate-900 border-slate-300 hover:bg-blue-50 hover:border-blue-500"
                      }`}
                    >{n}</button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-[11px] mb-1.5 block text-slate-700 font-bold">الفترة</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 border border-slate-200 p-1">
                    {(["AM", "PM"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setPeriod(p); setH(to24Hour(displayHour, p)); }}
                        className={`h-10 rounded-lg text-sm font-black transition-all ${
                          period === p ? "bg-emerald-700 text-white shadow-md" : "bg-white text-slate-800 hover:bg-emerald-50"
                        }`}
                      >{p === "AM" ? "صباحاً" : "مساءً"}</button>
                    ))}
                  </div>
                </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] mb-1.5 block text-slate-700 font-bold">الساعة</Label>
                  <ScrollArea className="h-48 rounded-lg border border-slate-300 p-1 bg-slate-50">
                    <div className="space-y-1">
                      {hours.map((v) => (
                        <button key={v} type="button" onClick={() => setH(to24Hour(v, period))}
                          className={`w-full h-9 rounded-md text-sm font-bold tabular-nums transition-colors ${
                            v === displayHour ? "bg-blue-700 text-white shadow-sm" : "text-slate-900 bg-white hover:bg-blue-50"
                          }`}>{String(v).padStart(2, "0")}</button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <div>
                  <Label className="text-[11px] mb-1.5 block text-slate-700 font-bold">الدقيقة</Label>
                  <ScrollArea className="h-48 rounded-lg border border-slate-300 p-1 bg-slate-50">
                    <div className="space-y-1">
                      {mins.map((v) => (
                        <button key={v} type="button" onClick={() => setM(v)}
                          className={`w-full h-9 rounded-md text-sm font-bold tabular-nums transition-colors ${
                            v === m ? "bg-blue-700 text-white shadow-sm" : "text-slate-900 bg-white hover:bg-blue-50"
                          }`}>{String(v).padStart(2, "0")}</button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              </div>
            )}
          </div>

          <div className="p-4 pt-0 flex gap-2">
            {step === "time" && (
              <Button variant="outline" onClick={() => setStep("date")} className="flex-1 h-11 border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200">
                رجوع
              </Button>
            )}
            {step === "date" ? (
              <Button
                onClick={() => setStep("time")}
                className="flex-1 h-11 bg-blue-700 hover:bg-blue-800 text-white border-0 shadow-md"
              >التالي</Button>
            ) : (
              <Button
                onClick={() => { onSave(d, h, m); setOpen(false); }}
                className="flex-1 h-11 bg-emerald-700 hover:bg-emerald-800 text-white border-0 gap-2 shadow-md"
              ><Save className="h-4 w-4" /> حفظ</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// WITHDRAWALS TAB
// ============================================================
function WithdrawalsTab({ overview, onReload }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("teacher_withdrawal_requests")
      .select("id, teacher_id, amount, status, payment_method, phone_number, created_at, processed_at, admin_message, profiles:teacher_id(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (!error) setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="معلقة" value={`${fmtInt(overview?.pending_requests)}`} sub={`${fmt(overview?.pending_amount)} ج`} icon={AlertTriangle} tint="from-orange-500 to-red-500" />
        <KpiCard label="مقبولة" value={`${fmtInt(overview?.approved_count)}`} sub={`${fmt(overview?.approved_total)} ج`} icon={CheckCircle2} tint="from-emerald-500 to-teal-600" />
        <KpiCard label="مرفوضة" value={`${fmtInt(overview?.rejected_count)}`} icon={XCircle} tint="from-slate-500 to-gray-600" />
      </div>

      <div className="flex gap-1 p-1 bg-slate-200 rounded-xl border border-slate-300 shadow-inner">
        {[["pending", "معلقة"], ["approved", "مقبولة"], ["rejected", "مرفوضة"], ["all", "الكل"]].map(([k, l]) => (
          <button key={k as string} onClick={() => setStatusFilter(k as any)}
            className={`flex-1 h-9 rounded-lg text-xs font-black transition-all ${
              statusFilter === k ? "bg-blue-700 text-white shadow-md" : "bg-white text-slate-800 hover:bg-blue-50"
            }`}>{l}</button>
        ))}
      </div>


      <ScrollArea className="max-h-[520px]">
        <div className="space-y-2">
          {loading ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
            : rows.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">لا توجد طلبات</div>
            ) : rows.map((r) => (
              <Card key={r.id} className="border border-slate-200 bg-white shadow-md">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950 truncate">{r.profiles?.full_name || "معلم"}</p>
                      <p className="text-[10px] text-slate-600 font-semibold truncate">{r.profiles?.email}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <p className="text-slate-600 font-semibold">المبلغ</p>
                      <p className="font-black text-slate-950">{fmt(r.amount)} ج</p>
                    </div>
                    <div>
                      <p className="text-slate-600 font-semibold">الطريقة</p>
                      <p className="font-black text-slate-950 truncate">{r.payment_method}</p>
                    </div>
                    <div>
                      <p className="text-slate-600 font-semibold">التاريخ</p>
                      <p className="font-black text-slate-950 truncate" dir="ltr">
                        {new Date(r.created_at).toLocaleDateString("ar-EG")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: any = {
    pending: { label: "معلق", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
    approved: { label: "مقبول", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    rejected: { label: "مرفوض", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  };
  const m = map[status] || { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

// ============================================================
// TEACHERS TAB (wallets, drill-in to statement, manual actions)
// ============================================================
function TeachersTab() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [action, setAction] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_list_teacher_wallets" as any, {
      _search: search || null, _limit: 100, _offset: 0,
    });
    if (!error && (data as any)?.success) {
      setRows((data as any).rows || []);
      setLoading(false);
      return;
    }

    if (error && !isRecoverableRpcError(error.message)) {
      setError(error.message || "تعذر تحميل محافظ المعلمين");
      setRows([]);
      setLoading(false);
      return;
    }

    if ((data as any)?.success === false && !isRecoverableRpcError((data as any)?.error)) {
      setError((data as any)?.error || "تعذر تحميل محافظ المعلمين");
      setRows([]);
      setLoading(false);
      return;
    }

    const fallback = await loadTeacherWalletsFallback(search);
    setRows(fallback.rows);
    if (error) setError("تم تحميل المحافظ بمسار احتياطي مؤقت لأن فهرس الدوال ما زال يتحدّث.");
    setLoading(false);
  };

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-700" />
        <Input
          placeholder="ابحث بالاسم، البريد، الهاتف، كود المعلم، أو المعرّف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10 h-12 rounded-xl border-2 border-blue-200 bg-white text-slate-950 placeholder:text-slate-500 focus-visible:ring-blue-600"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] font-semibold text-amber-950 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <ScrollArea className="max-h-[560px]">
        <div className="space-y-2">
          {loading ? Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-slate-100" />)
            : rows.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-600 bg-white rounded-xl border border-slate-200">لا يوجد معلمون مطابقون للبحث</div>
            ) : rows.map((r) => (
              <Card key={r.teacher_id} className="border border-slate-200 shadow-sm overflow-hidden bg-white">
                <CardContent className="p-0">
                  <div className="h-1.5 bg-gradient-to-l from-blue-700 via-emerald-500 to-amber-400" />
                  <div className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-700 to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold truncate text-slate-950">{r.name}</p>
                      <p className="text-[10px] text-slate-600 truncate">{r.email || "بدون بريد"}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {r.phone || "بدون هاتف"}{r.teacher_code ? ` • كود ${r.teacher_code}` : ""}
                      </p>
                    </div>
                    {r.pending_requests > 0 && (
                      <Badge className="bg-orange-600 text-white border-0 text-[9px] shadow-sm">
                        {r.pending_requests} معلق
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] mb-2">
                    <MiniStat label="متاح" value={`${fmt(r.balance)} ج`} tone="emerald" />
                    <MiniStat label="مجمّد" value={`${fmt(r.frozen_balance)} ج`} tone="cyan" />
                    <MiniStat label="إجمالي" value={`${fmt(r.total_earned)} ج`} tone="violet" />
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="flex-1 h-9 text-[11px] gap-1 bg-blue-700 text-white hover:bg-blue-800 border-0 shadow-md font-black"
                      onClick={() => setSelected(r)}>
                      <FileText className="h-3 w-3" /> السجل الشهري
                    </Button>
                    <Button size="sm" className="flex-1 h-9 text-[11px] gap-1 bg-emerald-700 text-white hover:bg-emerald-800 border-0 shadow-md font-black"
                      onClick={() => setAction(r)}>
                      <Coins className="h-3 w-3" /> إجراء يدوي
                    </Button>
                  </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </ScrollArea>

      {selected && (
        <TeacherStatementDialog teacher={selected} onClose={() => setSelected(null)} />
      )}
      {action && (
        <ManualActionDialog teacher={action} onClose={() => setAction(null)} onDone={load} />
      )}
    </div>
  );
}

async function loadTeacherWalletsFallback(search: string) {
  const q = search.trim().toLowerCase();
  const [rolesRes, profilesRes, walletsRes, requestsRes] = await Promise.all([
    supabase.from("user_roles").select("user_id,role").eq("role", "teacher"),
    supabase.from("profiles").select("id,full_name,email,phone,teacher_code,is_test_account"),
    supabase.from("teacher_wallets").select("teacher_id,balance,frozen_balance,total_earned,current_period,updated_at"),
    supabase.from("teacher_withdrawal_requests").select("teacher_id,status").eq("status", "pending"),
  ]);

  const profiles = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const wallets = new Map((walletsRes.data || []).map((w: any) => [w.teacher_id, w]));
  const pending = new Map<string, number>();
  (requestsRes.data || []).forEach((r: any) => pending.set(r.teacher_id, (pending.get(r.teacher_id) || 0) + 1));

  const rows = (rolesRes.data || [])
    .map((role: any) => {
      const p: any = profiles.get(role.user_id) || {};
      const w: any = wallets.get(role.user_id) || {};
      return {
        teacher_id: role.user_id,
        name: p.full_name || "معلم",
        email: p.email || "",
        phone: p.phone || "",
        teacher_code: p.teacher_code || "",
        is_test_account: Boolean(p.is_test_account),
        balance: Number(w.balance || 0),
        frozen_balance: Number(w.frozen_balance || 0),
        total_earned: Number(w.total_earned || 0),
        current_period: w.current_period || "",
        updated_at: w.updated_at || null,
        pending_requests: pending.get(role.user_id) || 0,
      };
    })
    .filter((r: any) => !r.is_test_account)
    .filter((r: any) => !q || `${r.name} ${r.email} ${r.phone} ${r.teacher_code} ${r.teacher_id}`.toLowerCase().includes(q))
    .sort((a: any, b: any) => Number(b.total_earned || 0) - Number(a.total_earned || 0));

  return { rows };
}

function MiniStat({ label, value, tone }: any) {
  const toneMap: any = {
    emerald: "bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
    cyan: "bg-cyan-50 border border-cyan-200 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300",
    violet: "bg-violet-50 border border-violet-200 text-violet-800 dark:bg-violet-950/30 dark:text-violet-300",
  };
  return (
    <div className={`rounded-lg p-2 ${toneMap[tone]}`}>
      <p className="text-[9px] font-bold opacity-90">{label}</p>
      <p className="font-extrabold truncate">{value}</p>
    </div>
  );
}

function TeacherStatementDialog({ teacher, onClose }: any) {
  const [archives, setArchives] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("teacher_monthly_archives")
        .select("period_label, total_earned, total_subscribers, total_groups, archived_at")
        .eq("teacher_id", teacher.teacher_id)
        .order("period_label", { ascending: false });
      setArchives(data || []);
      setLoading(false);
    })();
  }, [teacher]);

  useEffect(() => {
    if (!selectedPeriod) return;
    (async () => {
      const { data } = await supabase.rpc("admin_teacher_monthly_statement" as any, {
        _teacher_id: teacher.teacher_id, _period_label: selectedPeriod,
      });
      if ((data as any)?.success) setDetail(data);
    })();
  }, [selectedPeriod, teacher]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col bg-white text-slate-950" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> سجل محفظة {teacher.name}
          </DialogTitle>
          <DialogDescription>اختر شهراً لعرض التفاصيل الكاملة (مجموعات، طلاب، عمولة).</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : archives.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">لا توجد أرشيفات بعد</p>
          ) : (
            <div className="space-y-2">
              {archives.map((a) => (
                <button
                  key={a.period_label}
                  onClick={() => setSelectedPeriod(a.period_label)}
                  className={`w-full text-right border rounded-xl p-3 transition-all ${
                    selectedPeriod === a.period_label ? "bg-blue-50 border-blue-600 shadow-sm" : "bg-white border-slate-200 hover:bg-blue-50 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-black text-sm text-slate-950" dir="ltr">{a.period_label}</p>
                    <ChevronRight className="h-4 w-4 text-blue-700 rotate-180" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div><span className="text-slate-600 font-semibold">إيراد: </span><strong>{fmt(a.total_earned)} ج</strong></div>
                    <div><span className="text-slate-600 font-semibold">طلاب: </span><strong>{a.total_subscribers}</strong></div>
                    <div><span className="text-slate-600 font-semibold">مجموعات: </span><strong>{a.total_groups}</strong></div>
                  </div>
                </button>
              ))}

              {detail?.archive && Object.keys(detail.archive).length > 0 && (
                <Card className="border border-slate-200 bg-slate-50 mt-2">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-[11px] font-bold">تفاصيل {detail.archive.period_label}</p>
                    <div className="space-y-1.5">
                      {(detail.archive.breakdown || []).map((g: any, i: number) => (
                          <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 text-[10px]">
                          <div className="flex justify-between mb-0.5">
                            <p className="font-bold truncate">{g.group_title || "مجموعة"}</p>
                            <p className="text-emerald-700 font-black">{fmt(g.net)} ج</p>
                          </div>
                          <div className="text-muted-foreground flex gap-3">
                            <span>{g.subject_name}</span>
                            <span>• {g.students} طالب</span>
                            <span>• سعر {fmt(g.price)} ج</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {detail.transactions?.length > 0 && (
                      <>
                        <p className="text-[11px] font-bold mt-2">حركات المحفظة في الشهر</p>
                        {detail.transactions.map((t: any) => (
                          <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-2 text-[10px] flex justify-between">
                            <div>
                              <p className="font-bold">{t.transaction_type}</p>
                              <p className="text-muted-foreground truncate">{t.description}</p>
                            </div>
                            <p className={t.amount > 0 ? "text-emerald-700 font-black" : "text-red-700 font-black"}>
                              {t.amount > 0 ? "+" : ""}{fmt(t.amount)}
                            </p>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function ManualActionDialog({ teacher, onClose, onDone }: any) {
  const [action, setAction] = useState("bonus");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) { toast.error("مبلغ غير صالح"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("admin_manual_wallet_action" as any, {
        _teacher_id: teacher.teacher_id, _action: action, _amount: a, _reason: reason || null,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) { toast.error(r?.error || "فشل التنفيذ"); return; }
      toast.success("تم التنفيذ وتسجيله في السجل");
      onDone?.(); onClose();
    } catch (e: any) {
      toast.error(e?.message || "خطأ");
    } finally { setSubmitting(false); }
  };

  const actions = [
    { k: "bonus", l: "مكافأة", icon: Gift, tint: "bg-emerald-500" },
    { k: "credit", l: "إضافة رصيد", icon: PlusCircle, tint: "bg-blue-500" },
    { k: "penalty", l: "غرامة", icon: MinusCircle, tint: "bg-red-500" },
    { k: "debit", l: "خصم", icon: MinusCircle, tint: "bg-orange-500" },
    { k: "freeze", l: "تجميد", icon: Snowflake, tint: "bg-cyan-500" },
    { k: "unfreeze", l: "إفراج", icon: Unlock, tint: "bg-teal-500" },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white text-slate-950" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-4 w-4" /> إجراء يدوي — {teacher.name}
          </DialogTitle>
          <DialogDescription>
            كل إجراء يُسجّل في سجل التدقيق ويُشعَر المعلم تلقائياً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {actions.map((a) => (
              <button key={a.k} onClick={() => setAction(a.k)}
                className={`p-2.5 rounded-xl border transition-all text-center ${
                  action === a.k ? "border-blue-600 bg-blue-50 shadow-sm" : "bg-white border-slate-200 hover:bg-blue-50"
                }`}>
                <div className={`${a.tint} h-7 w-7 rounded-md text-white flex items-center justify-center mx-auto mb-1`}>
                  <a.icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-[10px] font-black text-slate-900">{a.l}</p>
              </button>
            ))}
          </div>

          <div>
            <Label className="text-[11px]">المبلغ (ج)</Label>
            <Input type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label className="text-[11px]">السبب / الملاحظة</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="اختياري لكن يُنصح به" className="h-11" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200">إلغاء</Button>
          <Button onClick={submit} disabled={submitting} className="bg-blue-700 text-white hover:bg-blue-800">
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            تنفيذ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// AUDIT LOG TAB
// ============================================================
function AuditTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_audit_logs" as any, {
      _action: filter || null, _teacher_id: null, _limit: 200, _offset: 0,
    });
    if (!error && (data as any)?.success) setRows((data as any).rows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="فلترة بنوع الإجراء (مثال: wallet_bonus, monthly_closing_run)"
          value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 text-[11px] border-2 border-blue-200 bg-white text-slate-950 placeholder:text-slate-500" />
        <Button variant="outline" size="icon" onClick={load} className="h-10 w-10 border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="max-h-[600px]">
        <div className="space-y-2">
          {loading ? Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
            : rows.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                لا توجد سجلات
              </div>
            ) : rows.map((r) => (
              <Card key={r.id} className="border border-slate-200 bg-white shadow-md">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-blue-700" />
                        {r.action}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        بواسطة: {r.actor_name}
                        {r.teacher_name && ` • على: ${r.teacher_name}`}
                      </p>
                    </div>
                    {r.amount != null && (
                      <p className="text-[11px] font-bold shrink-0">{fmt(r.amount)} ج</p>
                    )}
                  </div>
                  {r.reason && <p className="text-[10px] text-muted-foreground">{r.reason}</p>}
                  <p className="text-[9px] text-muted-foreground mt-1" dir="ltr">
                    {new Date(r.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}
                  </p>
                </CardContent>
              </Card>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}
