import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Smartphone, Save, Loader2 } from "lucide-react";

type Row = {
  id?: string;
  platform: "android" | "ios";
  latest_version: string;
  latest_build_number: number;
  min_supported_version: string | null;
  store_url: string;
  release_notes: string | null;
  force_update: boolean;
  is_active: boolean;
};

const empty = (platform: "android" | "ios"): Row => ({
  platform,
  latest_version: "1.0.0",
  latest_build_number: 1,
  min_supported_version: null,
  store_url:
    platform === "android"
      ? "https://play.google.com/store/apps/details?id=com.modrek.plus"
      : "https://apps.apple.com/app/idXXXXXXXXX",
  release_notes: "",
  force_update: false,
  is_active: true,
});

export default function AppVersionsPage() {
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [row, setRow] = useState<Row>(empty("android"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async (p: "android" | "ios") => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_versions")
      .select("*")
      .eq("platform", p)
      .eq("is_active", true)
      .maybeSingle();
    if (error) toast.error(error.message);
    setRow((data as Row) ?? empty(p));
    setLoading(false);
  };

  useEffect(() => {
    load(platform);
  }, [platform]);

  const save = async () => {
    setSaving(true);
    try {
      if (row.id) {
        const { error } = await supabase
          .from("app_versions")
          .update({
            latest_version: row.latest_version,
            latest_build_number: row.latest_build_number,
            min_supported_version: row.min_supported_version || null,
            store_url: row.store_url,
            release_notes: row.release_notes,
            force_update: row.force_update,
            is_active: true,
          })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        // Deactivate any existing active row, then insert
        await supabase
          .from("app_versions")
          .update({ is_active: false })
          .eq("platform", platform)
          .eq("is_active", true);
        const { error } = await supabase.from("app_versions").insert({
          platform: row.platform,
          latest_version: row.latest_version,
          latest_build_number: row.latest_build_number,
          min_supported_version: row.min_supported_version || null,
          store_url: row.store_url,
          release_notes: row.release_notes,
          force_update: row.force_update,
          is_active: true,
        });
        if (error) throw error;
      }
      toast.success("تم حفظ بيانات الإصدار بنجاح");
      await load(platform);
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          إصدارات التطبيق
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة آخر إصدار من التطبيق. عند رفع APK جديد، حدّث رقم الإصدار هنا وسيتلقى المستخدمون تنبيهاً تلقائياً عند فتح التطبيق.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المنصة</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="android">Android</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">بيانات الإصدار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الإصدار (مثال: 1.2.0)</Label>
                <Input
                  value={row.latest_version}
                  onChange={(e) => setRow({ ...row, latest_version: e.target.value })}
                  placeholder="1.0.0"
                />
              </div>
              <div className="space-y-2">
                <Label>رقم البناء (Build Number)</Label>
                <Input
                  type="number"
                  value={row.latest_build_number}
                  onChange={(e) =>
                    setRow({ ...row, latest_build_number: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>الحد الأدنى المدعوم (اختياري — أقل من ذلك = تحديث إجباري)</Label>
              <Input
                value={row.min_supported_version || ""}
                onChange={(e) => setRow({ ...row, min_supported_version: e.target.value })}
                placeholder="0.9.0"
              />
            </div>

            <div className="space-y-2">
              <Label>رابط المتجر (Google Play / App Store)</Label>
              <Input
                value={row.store_url}
                onChange={(e) => setRow({ ...row, store_url: e.target.value })}
                placeholder="https://play.google.com/store/apps/details?id=com.modrek.plus"
              />
              <p className="text-[10px] text-muted-foreground">
                ضع رابط Google Play بعد نشر التطبيق على المتجر.
              </p>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات الإصدار (ما الجديد؟)</Label>
              <Textarea
                rows={5}
                value={row.release_notes || ""}
                onChange={(e) => setRow({ ...row, release_notes: e.target.value })}
                placeholder="• إصلاح مشكلة ردود الدعم&#10;• تحسينات في الأداء&#10;• ميزات جديدة..."
              />
            </div>

            <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg">
              <div>
                <Label className="text-sm">تحديث إجباري</Label>
                <p className="text-[10px] text-muted-foreground">
                  لن يستطيع المستخدم استخدام التطبيق بدون التحديث
                </p>
              </div>
              <Switch
                checked={row.force_update}
                onCheckedChange={(v) => setRow({ ...row, force_update: v })}
              />
            </div>

            <Button
              onClick={save}
              disabled={saving}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Save className="h-4 w-4 ml-2" />
              )}
              حفظ الإصدار
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
