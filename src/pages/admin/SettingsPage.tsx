import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Settings,
  Save,
  Mail,
  Globe,
  Loader2,
  Video,
  Trash2,
  Play,
} from "lucide-react";

const SettingsPage = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState("");
  const [settings, setSettings] = useState({
    platformName: "أزهاريون",
    supportEmail: "alyedaft@gmail.com",
    supportPhone: "01223909712",
    whatsappNumber: "01223909712",
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["platform_name", "support_email", "support_phone", "support_whatsapp", "deposit_tutorial_video"]);

    if (data) {
      const map: Record<string, string> = {};
      data.forEach((d) => { if (d.value) map[d.key] = d.value; });
      setSettings({
        platformName: map["platform_name"] || "أزهاريون",
        supportEmail: map["support_email"] || "alyedaft@gmail.com",
        supportPhone: map["support_phone"] || "01223909712",
        whatsappNumber: map["support_whatsapp"] || "01223909712",
      });
      setTutorialVideoUrl(map["deposit_tutorial_video"] || "");
    }
    setLoading(false);
  };

  const upsertSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("platform_settings")
      .select("id")
      .eq("key", key)
      .maybeSingle();

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
        upsertSetting("platform_name", settings.platformName),
        upsertSetting("support_email", settings.supportEmail),
        upsertSetting("support_phone", settings.supportPhone),
        upsertSetting("support_whatsapp", settings.whatsappNumber),
      ]);
      toast.success("تم حفظ الإعدادات");
    } catch {
      toast.error("خطأ في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTutorialVideo = async () => {
    setSaving(true);
    try {
      await upsertSetting("deposit_tutorial_video", tutorialVideoUrl);
      toast.success("تم حفظ رابط فيديو شرح الإيداع");
    } catch {
      toast.error("خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTutorialVideo = async () => {
    setSaving(true);
    try {
      await upsertSetting("deposit_tutorial_video", "");
      setTutorialVideoUrl("");
      toast.success("تم حذف فيديو شرح الإيداع");
    } catch {
      toast.error("خطأ في الحذف");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" />
        إعدادات المنصة
      </h2>

      <div className="grid gap-6">
        {/* معلومات المنصة */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              معلومات المنصة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>اسم المنصة</Label>
              <Input
                value={settings.platformName}
                onChange={(e) => setSettings({ ...settings, platformName: e.target.value })}
                placeholder="اسم المنصة"
              />
            </div>
          </CardContent>
        </Card>

        {/* بيانات التواصل */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              بيانات التواصل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>البريد الإلكتروني للدعم</Label>
              <Input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                placeholder="support@example.com"
              />
            </div>
            <div>
              <Label>رقم الهاتف</Label>
              <Input
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div>
              <Label>رقم واتساب</Label>
              <Input
                value={settings.whatsappNumber}
                onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                placeholder="01xxxxxxxxx"
              />
            </div>
          </CardContent>
        </Card>

        {/* فيديو شرح الإيداع */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              فيديو شرح طريقة الإيداع
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>رابط الفيديو (YouTube أو رابط مباشر)</Label>
              <Input
                value={tutorialVideoUrl}
                onChange={(e) => setTutorialVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/embed/..."
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">
                يظهر هذا الفيديو للطلاب داخل صفحة الإيداع كشرح لطريقة التحويل
              </p>
            </div>

            {tutorialVideoUrl && (
              <div className="rounded-lg overflow-hidden border aspect-video">
                <iframe
                  src={tutorialVideoUrl}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; encrypted-media"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSaveTutorialVideo} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ الفيديو
              </Button>
              {tutorialVideoUrl && (
                <Button variant="destructive" onClick={handleDeleteTutorialVideo} disabled={saving} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  حذف الفيديو
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* معلومات المطور */}
        <Card>
          <CardHeader>
            <CardTitle>معلومات المطور</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p><strong>المطور:</strong> علي محمد علي</p>
              <p><strong>البريد:</strong> alyedaft@gmail.com</p>
              <p><strong>واتساب:</strong> 01223909712</p>
              <p><strong>المدينة:</strong> بني سويف</p>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <Save className="h-4 w-4 ml-2" />
          )}
          حفظ الإعدادات
        </Button>
      </div>
    </div>
  );
};

export default SettingsPage;
