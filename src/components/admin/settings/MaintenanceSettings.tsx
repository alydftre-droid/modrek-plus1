import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Loader2, AlertTriangle } from "lucide-react";

const MaintenanceSettings = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("platform_settings").select("key, value")
      .in("key", ["maintenance_mode", "maintenance_message"]);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(d => { if (d.value) map[d.key] = d.value; });
      setMaintenanceMode(map["maintenance_mode"] === "true");
      setMaintenanceMessage(map["maintenance_message"] || "المنصة تحت الصيانة حالياً، يرجى المحاولة لاحقاً");
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        upsertSetting("maintenance_mode", String(maintenanceMode)),
        upsertSetting("maintenance_message", maintenanceMessage),
      ]);
      toast.success("تم حفظ إعدادات الصيانة");
    } catch { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card className={maintenanceMode ? "border-2 border-destructive" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${maintenanceMode ? "text-destructive" : ""}`} />
            وضع الصيانة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-bold">تفعيل وضع الصيانة</p>
              <p className="text-xs text-muted-foreground">عند التفعيل، لن يتمكن الطلاب والمعلمون من الوصول للمنصة</p>
            </div>
            <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
          </div>

          {maintenanceMode && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
              ⚠️ وضع الصيانة مفعّل الآن - المنصة متوقفة للطلاب والمعلمين
            </div>
          )}

          <div>
            <Label>رسالة الصيانة (تظهر للمستخدمين)</Label>
            <Textarea
              value={maintenanceMessage}
              onChange={e => setMaintenanceMessage(e.target.value)}
              className="min-h-24 mt-1"
              placeholder="المنصة تحت الصيانة حالياً..."
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ إعدادات الصيانة
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenanceSettings;
