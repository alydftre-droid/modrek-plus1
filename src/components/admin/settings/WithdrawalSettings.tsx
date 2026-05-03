import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CalendarClock, Lock, Unlock, Zap, Percent, Archive } from "lucide-react";
import { toast } from "sonner";

const KEYS = [
  "teacher_commission_rate",
  "withdrawal_open_day",
  "withdrawal_manual_state",
  "withdrawal_notice_message",
] as const;

export default function WithdrawalSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [rate, setRate] = useState("70");
  const [openDay, setOpenDay] = useState("25");
  const [manualState, setManualState] = useState<"auto" | "open" | "closed">("auto");
  const [notice, setNotice] = useState("");

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("platform_settings").select("key, value").in("key", KEYS as any);
    const map = new Map((data || []).map((r: any) => [r.key, r.value]));
    const r = parseFloat(map.get("teacher_commission_rate") || "0.55");
    setRate(String(Math.round(r * 100)));
    setOpenDay(map.get("withdrawal_open_day") || "25");
    setManualState((map.get("withdrawal_manual_state") as any) || "auto");
    setNotice(map.get("withdrawal_notice_message") || "");
    setLoading(false);
  };

  const upsert = async (key: string, value: string) => {
    const { data: existing } = await supabase.from("platform_settings").select("id").eq("key", key).maybeSingle();
    if (existing) {
      await supabase.from("platform_settings").update({ value, updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
    } else {
      await supabase.from("platform_settings").insert({ key, value });
    }
  };

  const handleSave = async () => {
    const ratePct = parseFloat(rate);
    if (isNaN(ratePct) || ratePct < 0 || ratePct > 100) { toast.error("النسبة يجب أن تكون بين 0 و 100"); return; }
    const day = parseInt(openDay);
    if (isNaN(day) || day < 1 || day > 28) { toast.error("اليوم يجب أن يكون بين 1 و 28"); return; }
    setSaving(true);
    try {
      await Promise.all([
        upsert("teacher_commission_rate", String((ratePct / 100).toFixed(4))),
        upsert("withdrawal_open_day", String(day)),
        upsert("withdrawal_manual_state", manualState),
        upsert("withdrawal_notice_message", notice),
      ]);
      toast.success("تم حفظ الإعدادات");
    } catch (e) { console.error(e); toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleArchiveAll = async () => {
    if (!confirm("سيتم نقل أرباح الشهر الحالي لجميع المعلمين إلى الرصيد المتاح للسحب وأرشفتها. متابعة؟")) return;
    setArchiving(true);
    try {
      const { data, error } = await supabase.rpc("archive_all_teachers_period" as any);
      if (error) throw error;
      const result = data as any;
      if (result?.success) toast.success(`تم أرشفة ${result.archived_count} معلم وفتح السحب`);
      else toast.error(result?.error || "خطأ");
    } catch (e: any) { console.error(e); toast.error(e?.message || "خطأ"); }
    finally { setArchiving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <CalendarClock className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="font-bold text-base">نظام السحب والأرباح</p>
            <p className="text-xs text-muted-foreground">تحكم كامل بنسبة العمولة، موعد السحب، والأرشفة الشهرية</p>
          </div>
        </CardContent>
      </Card>

      {/* Commission rate */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Percent className="h-4 w-4 text-emerald-600" /> نسبة عمولة المعلم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">النسبة (%)</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={100} value={rate} onChange={(e) => setRate(e.target.value)} className="text-lg font-bold text-center" />
            <span className="text-sm font-bold">%</span>
          </div>
          <p className="text-[11px] text-muted-foreground">من سعر كل اشتراك ناجح. الباقي للمنصة. التغيير يطبَّق على الاشتراكات الجديدة فقط.</p>
        </CardContent>
      </Card>

      {/* Withdrawal window */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4 text-blue-600" /> موعد فتح السحب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">يوم فتح السحب من كل شهر (1-28)</Label>
            <Input type="number" min={1} max={28} value={openDay} onChange={(e) => setOpenDay(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs mb-2 block">الحالة الحالية</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "auto", label: "تلقائي", icon: Zap, color: "bg-blue-500" },
                { v: "open", label: "فتح فوري", icon: Unlock, color: "bg-emerald-500" },
                { v: "closed", label: "إيقاف مؤقت", icon: Lock, color: "bg-red-500" },
              ].map((o) => {
                const Icon = o.icon as any;
                const active = manualState === o.v;
                return (
                  <button key={o.v}
                    onClick={() => setManualState(o.v as any)}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${active ? `${o.color} text-white border-transparent shadow-md` : "bg-background border-border hover:border-primary/40"}`}>
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-bold">{o.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {manualState === "auto" && `السحب يفتح تلقائياً يوم ${openDay} من كل شهر`}
              {manualState === "open" && "السحب مفتوح للجميع الآن"}
              {manualState === "closed" && "السحب موقوف مؤقتاً"}
            </p>
          </div>
          <div>
            <Label className="text-xs">رسالة المعلمين</Label>
            <Textarea rows={2} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="مثلاً: السحب يفتح يوم 25 من كل شهر" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* Archive action */}
      <Card className="border-0 shadow-sm border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Archive className="h-4 w-4 text-amber-600" /> أرشفة الشهر الحالي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            ينقل أرباح الشهر الحالي لجميع المعلمين من "مجمد" إلى "متاح للسحب" ويحفظ سجل أرشيف لكل معلم. يُستخدم عادة بشكل تلقائي يوم فتح السحب.
          </p>
          <Button onClick={handleArchiveAll} disabled={archiving} className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-2">
            {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            تنفيذ الأرشفة الآن لكل المعلمين
          </Button>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 gap-2 bg-gradient-to-r from-primary to-primary/80">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ الإعدادات
      </Button>
    </div>
  );
}
