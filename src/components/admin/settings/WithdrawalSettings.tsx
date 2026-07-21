import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2, Save, CalendarDays, Clock, Lock, Unlock, Zap, ShieldAlert,
  Wallet, Snowflake, Users, ArrowUpRight, CheckCircle2, XCircle, History,
  AlertTriangle, PlayCircle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const KEYS = [
  "withdrawal_open_day",
  "withdrawal_open_hour",
  "withdrawal_open_minute",
  "withdrawal_manual_state",
  "withdrawal_last_release_at",
] as const;

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 30, 40, 45, 50];

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WithdrawalSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  const [openDay, setOpenDay] = useState(25);
  const [openHour, setOpenHour] = useState(9);
  const [openMinute, setOpenMinute] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [lastReleaseAt, setLastReleaseAt] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [now, setNow] = useState(new Date());
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [pendingStopped, setPendingStopped] = useState<boolean | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", KEYS as any);
    const map = new Map((data || []).map((r: any) => [r.key, r.value]));
    setOpenDay(Math.min(28, Math.max(1, parseInt(map.get("withdrawal_open_day") || "25"))));
    setOpenHour(Math.min(23, Math.max(0, parseInt(map.get("withdrawal_open_hour") || "9"))));
    setOpenMinute(Math.min(59, Math.max(0, parseInt(map.get("withdrawal_open_minute") || "0"))));
    setStopped(map.get("withdrawal_manual_state") === "closed");
    setLastReleaseAt(map.get("withdrawal_last_release_at") || null);
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_withdrawal_dashboard" as any);
      if (error) throw error;
      if ((data as any)?.success) setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadSettings(), loadStats()]);
      setLoading(false);
    })();
  }, []);

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
      toast.success("✅ تم حفظ الإعدادات بنجاح");
      await loadSettings();
    } catch (e) {
      console.error(e);
      toast.error("خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleInstantRelease = async () => {
    setReleasing(true);
    try {
      const { data, error } = await supabase.rpc("archive_all_teachers_period" as any);
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error || "فشل تنفيذ العملية");
        return;
      }
      toast.success(`تم نقل الرصيد المجمّد لـ ${result.archived_count || 0} معلم`);
      await Promise.all([loadSettings(), loadStats()]);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "خطأ");
    } finally {
      setReleasing(false);
      setConfirmRelease(false);
    }
  };

  // Cairo time helpers
  const cairoNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
  const cairoTime = now.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
  const cairoDate = now.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo", weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const cairoDay = cairoNow.getDate();

  // Next release datetime
  const nextRelease = useMemo(() => {
    const y = cairoNow.getFullYear();
    const m = cairoNow.getMonth();
    let target = new Date(y, m, openDay, openHour, openMinute, 0);
    if (target.getTime() <= cairoNow.getTime()) {
      target = new Date(y, m + 1, openDay, openHour, openMinute, 0);
    }
    return target;
  }, [cairoNow, openDay, openHour, openMinute]);

  const diffMs = Math.max(0, nextRelease.getTime() - cairoNow.getTime());
  const dDays = Math.floor(diffMs / 86400000);
  const dHours = Math.floor((diffMs % 86400000) / 3600000);
  const dMins = Math.floor((diffMs % 3600000) / 60000);
  const dSecs = Math.floor((diffMs % 60000) / 1000);

  const timeLabel = `${String(openHour).padStart(2, "0")}:${String(openMinute).padStart(2, "0")}`;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Hero: Cairo clock + countdown */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 p-5 text-white relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs opacity-90 mb-1">
                <Clock className="h-3.5 w-3.5" /> توقيت القاهرة الآن
              </div>
              <p className="text-4xl font-extrabold tracking-wide" dir="ltr">{cairoTime}</p>
              <p className="text-xs mt-1 opacity-90">{cairoDate}</p>
            </div>
            <div className="text-left">
              <p className="text-[10px] opacity-80 mb-1">النقل القادم</p>
              <p className="text-lg font-bold" dir="ltr">
                {String(dDays).padStart(2, "0")}ي {String(dHours).padStart(2, "0")}:{String(dMins).padStart(2, "0")}:{String(dSecs).padStart(2, "0")}
              </p>
              <p className="text-[10px] mt-1 opacity-90" dir="ltr">
                {nextRelease.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} • {timeLabel}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          icon={<Snowflake className="h-4 w-4" />}
          label="مجمّد (جميع المعلمين)"
          value={statsLoading ? "..." : `${fmtMoney(stats?.total_frozen || 0)} ج`}
          tint="from-cyan-500 to-blue-500"
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="متاح للسحب"
          value={statsLoading ? "..." : `${fmtMoney(stats?.total_available || 0)} ج`}
          tint="from-emerald-500 to-green-500"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="معلمين برصيد مجمّد"
          value={statsLoading ? "..." : `${stats?.teachers_with_frozen || 0} / ${stats?.total_teachers || 0}`}
          tint="from-violet-500 to-purple-500"
        />
        <StatCard
          icon={<ArrowUpRight className="h-4 w-4" />}
          label="طلبات سحب معلقة"
          value={statsLoading ? "..." : `${stats?.pending_requests || 0}`}
          sub={statsLoading ? "" : `${fmtMoney(stats?.pending_amount || 0)} ج`}
          tint="from-amber-500 to-orange-500"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="مسحوبات مكتملة"
          value={statsLoading ? "..." : `${fmtMoney(stats?.approved_total || 0)} ج`}
          sub={statsLoading ? "" : `${stats?.approved_count || 0} عملية`}
          tint="from-teal-500 to-emerald-600"
        />
        <StatCard
          icon={<History className="h-4 w-4" />}
          label="أرشيفات هذا الشهر"
          value={statsLoading ? "..." : `${stats?.archives_this_month || 0}`}
          tint="from-slate-500 to-gray-600"
        />
      </div>

      {/* Info banner about what this does */}
      <Card className="border-0 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="p-3 text-[11px] leading-relaxed text-blue-900 dark:text-blue-100 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>تنبيه:</strong> هذا الموعد يحدد اليوم والوقت الذي يتم فيه
            <strong> نقل الرصيد المجمّد → الرصيد المتاح للسحب </strong>
            تلقائياً لكل معلم، مع أرشفة سجل الشهر كامل (المجموعات، الطلاب، الاشتراكات، النسبة).
            هذا لا يتحكم بفتح/إغلاق السحب — استخدم زر الطوارئ في الأسفل لذلك.
          </div>
        </CardContent>
      </Card>

      {/* Instant Release */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4" />
            <p className="font-bold text-sm">تنفيذ نقل الرصيد فوراً</p>
          </div>
          <p className="text-[11px] opacity-90 leading-relaxed">
            نفّذ عملية نقل الرصيد المجمّد إلى الرصيد المتاح للسحب لجميع المعلمين الآن،
            وأرشف سجل الشهر الحالي بالكامل. تُستخدم في الحالات الاستثنائية.
          </p>
        </div>
        <CardContent className="p-3">
          <Button
            onClick={() => setConfirmRelease(true)}
            disabled={releasing}
            className="w-full h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
          >
            {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            نقل الرصيد وأرشفة الشهر الآن
          </Button>
          {lastReleaseAt && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              آخر نقل: {new Date(lastReleaseAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Day picker */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-sm">يوم النقل من كل شهر</p>
              <p className="text-[11px] text-muted-foreground">اختر اليوم الذي يتم فيه نقل الرصيد وأرشفة الشهر</p>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((d) => {
              const active = d === openDay;
              const isToday = d === cairoDay;
              return (
                <button
                  key={d}
                  onClick={() => setOpenDay(d)}
                  className={`h-10 rounded-lg border text-sm font-bold transition-all relative ${
                    active
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-md scale-105"
                      : "bg-card hover:bg-accent border-border"
                  }`}
                >
                  {d}
                  {isToday && !active && (
                    <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Time picker */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
              <Clock className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <p className="font-bold text-sm">وقت النقل (بتوقيت القاهرة)</p>
              <p className="text-[11px] text-muted-foreground">الساعة والدقيقة التي يبدأ عندها النقل</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] mb-1.5 block text-muted-foreground">الساعة</Label>
              <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto p-1 border rounded-lg">
                {HOURS.map((h) => {
                  const active = h === openHour;
                  return (
                    <button
                      key={h}
                      onClick={() => setOpenHour(h)}
                      className={`h-9 rounded-md text-xs font-bold transition-all ${
                        active
                          ? "bg-indigo-500 text-white shadow"
                          : "bg-muted/50 hover:bg-accent"
                      }`}
                    >
                      {String(h).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-[11px] mb-1.5 block text-muted-foreground">الدقيقة</Label>
              <div className="grid grid-cols-3 gap-1 p-1 border rounded-lg">
                {MINUTES.map((m) => {
                  const active = m === openMinute;
                  return (
                    <button
                      key={m}
                      onClick={() => setOpenMinute(m)}
                      className={`h-9 rounded-md text-xs font-bold transition-all ${
                        active
                          ? "bg-indigo-500 text-white shadow"
                          : "bg-muted/50 hover:bg-accent"
                      }`}
                    >
                      {String(m).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-lg p-3 text-xs">
            سيتم النقل يوم <strong>{openDay}</strong> من كل شهر الساعة{" "}
            <strong dir="ltr">{timeLabel}</strong> بتوقيت القاهرة.
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
                  {stopped ? "🔴 السحب متوقف — المعلمون لا يستطيعون تقديم طلبات" : "السحب مفتوح — المعلمون يستطيعون تقديم طلبات"}
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

      {/* Save */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={loadStats}
          disabled={statsLoading}
          className="h-12 gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${statsLoading ? "animate-spin" : ""}`} />
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-12 gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0 shadow-md"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ الإعدادات
        </Button>
      </div>

      {/* Confirm Instant Release */}
      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-emerald-600" /> تأكيد نقل الرصيد فوراً
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              سيتم نقل الرصيد المجمّد إلى الرصيد المتاح لجميع المعلمين الذين لديهم رصيد مجمّد،
              وأرشفة سجل الشهر الحالي بالكامل. لا يمكن التراجع عن هذه العملية.
              <br /><br />
              <strong>الإجمالي المجمّد حالياً: {fmtMoney(stats?.total_frozen || 0)} ج</strong>
              <br />
              <strong>عدد المعلمين المتأثرين: {stats?.teachers_with_frozen || 0}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleInstantRelease} className="bg-emerald-600 hover:bg-emerald-700">
              نعم، نفّذ الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Stop Toggle */}
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingStopped ? <Lock className="h-5 w-5 text-red-600" /> : <Unlock className="h-5 w-5 text-emerald-600" />}
              {pendingStopped ? "إيقاف السحب" : "فتح السحب"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              {pendingStopped
                ? "سيتم إيقاف تقديم طلبات السحب لجميع المعلمين مؤقتاً. لا يؤثر ذلك على الرصيد أو السجلات."
                : "سيتم إعادة فتح باب تقديم طلبات السحب لجميع المعلمين."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStopped(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStopped !== null) setStopped(pendingStopped);
                setPendingStopped(null);
                setConfirmStop(false);
              }}
              className={pendingStopped ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ icon, label, value, sub, tint }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tint: string;
}) {
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-3">
        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${tint} text-white flex items-center justify-center mb-2`}>
          {icon}
        </div>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-extrabold mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[9px] text-muted-foreground truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}
