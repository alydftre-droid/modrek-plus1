import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Save, CalendarDays, Clock, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

const KEYS = ["withdrawal_open_day", "withdrawal_manual_state"] as const;

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export default function WithdrawalSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openDay, setOpenDay] = useState(25);
  const [stopped, setStopped] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", KEYS as any);
      const map = new Map((data || []).map((r: any) => [r.key, r.value]));
      const d = parseInt(map.get("withdrawal_open_day") || "25");
      setOpenDay(isNaN(d) ? 25 : Math.min(28, Math.max(1, d)));
      setStopped(map.get("withdrawal_manual_state") === "closed");
      setLoading(false);
    })();
  }, []);

  const upsert = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("platform_settings")
      .select("id")
      .eq("key", key)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("platform_settings")
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
        upsert("withdrawal_manual_state", stopped ? "closed" : "auto"),
      ]);
      toast.success("تم حفظ الإعدادات");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  // Cairo time
  const cairoTime = now.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const cairoDate = now.toLocaleString("ar-EG", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const cairoDay = parseInt(
    new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" })).getDate().toString(),
  );
  const daysLeft = openDay >= cairoDay ? openDay - cairoDay : 30 - cairoDay + openDay;

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4" dir="rtl">
      {/* Cairo Live Clock */}
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 p-5 text-white">
          <div className="flex items-center gap-2 mb-1 text-xs opacity-90">
            <Clock className="h-3.5 w-3.5" /> توقيت القاهرة الآن
          </div>
          <p className="text-3xl font-extrabold tracking-wide" dir="ltr">
            {cairoTime}
          </p>
          <p className="text-sm mt-1 opacity-90">{cairoDate}</p>
        </div>
      </Card>

      {/* Open Day Picker */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-sm">موعد فتح السحب</p>
              <p className="text-[11px] text-muted-foreground">
                اختر اليوم الذي يُفتح فيه السحب وتُحدَّث المحافظ تلقائياً كل شهر
              </p>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">يوم فتح السحب من كل شهر</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS.map((d) => {
                const active = d === openDay;
                return (
                  <button
                    key={d}
                    onClick={() => setOpenDay(d)}
                    className={`h-10 rounded-lg border text-sm font-bold transition-all ${
                      active
                        ? "bg-emerald-500 text-white border-emerald-600 shadow-md scale-105"
                        : "bg-card hover:bg-accent border-border"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 text-xs space-y-1">
            <p>
              يفتح السحب يوم <strong>{openDay}</strong> من كل شهر بتوقيت القاهرة.
            </p>
            <p className="text-muted-foreground">
              متبقي <strong>{daysLeft}</strong> يوم على الفتح القادم. يتم نقل أرباح الشهر الحالي
              تلقائياً إلى الرصيد المتاح للسحب وأرشفتها في سجلات المعلمين.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stop withdrawals toggle */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                stopped
                  ? "bg-red-100 dark:bg-red-950/40 text-red-600"
                  : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600"
              }`}
            >
              {stopped ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm">إيقاف السحب مؤقتاً</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {stopped ? "السحب موقوف لجميع المعلمين" : "السحب يعمل حسب التاريخ المحدد"}
              </p>
            </div>
          </div>
          <Switch checked={stopped} onCheckedChange={setStopped} />
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-12 gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ الإعدادات
      </Button>
    </div>
  );
}
