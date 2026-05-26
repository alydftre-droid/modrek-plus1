import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Loader2, Mail, Phone, MessageCircle, Send } from "lucide-react";

const PlatformSupportSettings = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    supportEmail: "",
    supportPhone: "",
    whatsappNumber: "",
    telegramUsername: "",
    subscriptionWhatsapp: "",
    paymentReceiveNumber: "",
  });

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("platform_settings").select("key, value")
      .in("key", ["support_email", "support_phone", "support_whatsapp", "support_telegram", "subscription_whatsapp", "payment_receive_number"]);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(d => { if (d.value) map[d.key] = d.value; });
      setSettings({
        supportEmail: map["support_email"] || "",
        supportPhone: map["support_phone"] || "",
        whatsappNumber: map["support_whatsapp"] || "",
        telegramUsername: map["support_telegram"] || "",
        subscriptionWhatsapp: map["subscription_whatsapp"] || "",
        paymentReceiveNumber: map["payment_receive_number"] || "",
      });
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
        upsertSetting("support_email", settings.supportEmail),
        upsertSetting("support_phone", settings.supportPhone),
        upsertSetting("support_whatsapp", settings.whatsappNumber),
        upsertSetting("support_telegram", settings.telegramUsername),
        upsertSetting("subscription_whatsapp", settings.subscriptionWhatsapp),
        upsertSetting("payment_receive_number", settings.paymentReceiveNumber),
      ]);
      toast.success("تم حفظ بيانات الدعم");
    } catch { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />البريد الإلكتروني</CardTitle></CardHeader>
        <CardContent>
          <Label>البريد الإلكتروني للدعم</Label>
          <Input type="email" value={settings.supportEmail} onChange={e => setSettings({ ...settings, supportEmail: e.target.value })} placeholder="support@example.com" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" />أرقام الهاتف</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>هاتف الدعم</Label><Input value={settings.supportPhone} onChange={e => setSettings({ ...settings, supportPhone: e.target.value })} placeholder="01xxxxxxxxx" /></div>
          <div><Label>رقم واتساب الدعم</Label><Input value={settings.whatsappNumber} onChange={e => setSettings({ ...settings, whatsappNumber: e.target.value })} placeholder="01xxxxxxxxx" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-sky-500" />تيليجرام الدعم</CardTitle></CardHeader>
        <CardContent>
          <Label>اسم المستخدم أو رابط تيليجرام</Label>
          <Input dir="ltr" value={settings.telegramUsername} onChange={e => setSettings({ ...settings, telegramUsername: e.target.value })} placeholder="@username أو https://t.me/username" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5" />أرقام الاشتراك والدفع</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>رقم واتساب الاشتراك</Label><Input value={settings.subscriptionWhatsapp} onChange={e => setSettings({ ...settings, subscriptionWhatsapp: e.target.value })} placeholder="01xxxxxxxxx" /></div>
          <div><Label>رقم استقبال التحويلات</Label><Input value={settings.paymentReceiveNumber} onChange={e => setSettings({ ...settings, paymentReceiveNumber: e.target.value })} placeholder="01xxxxxxxxx" /></div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ بيانات الدعم
      </Button>
    </div>
  );
};

export default PlatformSupportSettings;
