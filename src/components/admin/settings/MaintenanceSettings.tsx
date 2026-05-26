import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Loader2, AlertTriangle, Clock } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const KEYS = ["maintenance_mode", "maintenance_message", "maintenance_start_at", "maintenance_end_at"];

const MaintenanceSettings = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("platform_settings").select("key, value").in("key", KEYS);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(d => { if (d.value) map[d.key] = d.value; });
      setMaintenanceMode(map["maintenance_mode"] === "true");
      setMaintenanceMessage(map["maintenance_message"] || "المنصة تحت الصيانة حالياً، يرجى المحاولة لاحقاً");
      setStartAt(map["maintenance_start_at"] || "");
      setEndAt(map["maintenance_end_at"] || "");
    }
    setLoading(false);
  };

  const upsertSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase.from("platform_settings").select("id").eq("key", key).maybeSingle();
    if (existing) {
      await supabase.from("platform_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    } else {
      await supabase.from("platform_settings").insert({ key, value });
    }
  };

  const persist = async (mode: boolean) => {
    setSaving(true);
    try {
      await Promise.all([
        upsertSetting("maintenance_mode", String(mode)),
        upsertSetting("maintenance_message", maintenanceMessage),
        upsertSetting("maintenance_start_at", startAt),
        upsertSetting("maintenance_end_at", endAt),
      ]);
      setMaintenanceMode(mode);
      toast.success(mode ? "تم تفعيل وضع الصيانة" : "تم حفظ إعدادات الصيانة");
    } catch { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleToggle = (checked: boolean) => {
    if (checked) setConfirmOpen(true);
    else persist(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5">
      <Card className={maintenanceMode ? "border-2 border-destructive" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className={`h-5 w-5 ${maintenanceMode ? "text-destructive" : "text-orange-500"}`} />
            وضع الصيانة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-bold">إيقاف المنصة مؤقتاً</p>
              <p className="text-xs text-muted-foreground">يمنع الطلاب والمعلمين من الدخول</p>
            </div>
            <Switch checked={maintenanceMode} onCheckedChange={handleToggle} />
          </div>

          {maintenanceMode && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
              ⚠️ وضع الصيانة مفعّل الآن — المنصة متوقفة للطلاب والمعلمين
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> وقت الإيقاف</Label>
              <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> وقت التشغيل</Label>
              <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">تعرض الأوقات للطلاب والمعلمين في رسالة الصيانة.</p>

          <div>
            <Label>الرسالة التي تظهر للمستخدمين</Label>
            <Textarea
              value={maintenanceMessage}
              onChange={e => setMaintenanceMessage(e.target.value)}
              className="min-h-24 mt-1"
              placeholder="المنصة تحت الصيانة حالياً..."
            />
          </div>

          <Button onClick={() => persist(maintenanceMode)} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ إعدادات الصيانة
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> تأكيد إيقاف المنصة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              عند التفعيل ستكون <strong>المنصة متوقفة لجميع الطلاب والمعلمين</strong> ولن يتمكنوا من الوصول لأي محتوى حتى يتم إيقاف وضع الصيانة. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => persist(true)} className="bg-destructive hover:bg-destructive/90">
              نعم، أوقف المنصة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MaintenanceSettings;
