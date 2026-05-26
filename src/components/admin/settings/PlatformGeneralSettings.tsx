import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Loader2, Globe, Play, Video, Trash2 } from "lucide-react";

const PlatformGeneralSettings = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [platformName, setPlatformName] = useState("مدرك Plus");
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState("");
  const [tickerEnabled, setTickerEnabled] = useState(false);
  const [tickerTitle, setTickerTitle] = useState("");
  const [tickerItemsText, setTickerItemsText] = useState("");

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("platform_settings").select("key, value")
      .in("key", ["platform_name", "deposit_tutorial_video", "student_dashboard_ticker_enabled", "student_dashboard_ticker_text", "student_dashboard_ticker_items"]);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(d => { if (d.value) map[d.key] = d.value; });
      setPlatformName(map["platform_name"] || "مدرك Plus");
      setTutorialVideoUrl(map["deposit_tutorial_video"] || "");
      setTickerEnabled(map["student_dashboard_ticker_enabled"] === "true");
      setTickerTitle(map["student_dashboard_ticker_text"] || "");
      try {
        const parsed = JSON.parse(map["student_dashboard_ticker_items"] || "[]");
        setTickerItemsText(Array.isArray(parsed) ? parsed.join("\n") : "");
      } catch { setTickerItemsText(""); }
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

  const handleSaveName = async () => {
    setSaving(true);
    try {
      await upsertSetting("platform_name", platformName);
      toast.success("تم حفظ اسم المنصة");
    } catch { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleSaveTicker = async () => {
    setSaving(true);
    try {
      const items = tickerItemsText.split("\n").map(i => i.trim()).filter(Boolean);
      await Promise.all([
        upsertSetting("student_dashboard_ticker_enabled", String(tickerEnabled)),
        upsertSetting("student_dashboard_ticker_text", tickerTitle.trim()),
        upsertSetting("student_dashboard_ticker_items", JSON.stringify(items)),
      ]);
      toast.success("تم حفظ شريط الحركة");
    } catch { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleSaveTutorial = async () => {
    setSaving(true);
    try {
      await upsertSetting("deposit_tutorial_video", tutorialVideoUrl);
      toast.success("تم حفظ رابط الفيديو");
    } catch { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />اسم المنصة</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>اسم المنصة</Label><Input value={platformName} onChange={e => setPlatformName(e.target.value)} /></div>
          <Button onClick={handleSaveName} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
          </Button>
        </CardContent>
      </Card>

      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary"><Play className="h-5 w-5" />🎯 شريط الحركة لدى الطالب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div><p className="font-bold">تفعيل الشريط المتحرك</p><p className="text-xs text-muted-foreground">يظهر للطلاب فوراً</p></div>
            <Switch checked={tickerEnabled} onCheckedChange={setTickerEnabled} />
          </div>
          <div><Label>العنوان الرئيسي</Label><Input value={tickerTitle} onChange={e => setTickerTitle(e.target.value)} placeholder="🏆 أوائل هذا الأسبوع" /></div>
          <div><Label>رسائل الشريط (كل سطر رسالة)</Label><Textarea value={tickerItemsText} onChange={e => setTickerItemsText(e.target.value)} className="min-h-32" /></div>
          <Button onClick={handleSaveTicker} disabled={saving} className="gap-2 w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ شريط الحركة
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Video className="h-5 w-5" />فيديو شرح الإيداع</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>رابط الفيديو</Label><Input value={tutorialVideoUrl} onChange={e => setTutorialVideoUrl(e.target.value)} placeholder="https://..." dir="ltr" /></div>
          {tutorialVideoUrl && <div className="rounded-lg overflow-hidden border aspect-video"><iframe src={tutorialVideoUrl} className="w-full h-full" allowFullScreen /></div>}
          <div className="flex gap-2">
            <Button onClick={handleSaveTutorial} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ
            </Button>
            {tutorialVideoUrl && <Button variant="destructive" onClick={async () => { await upsertSetting("deposit_tutorial_video", ""); setTutorialVideoUrl(""); toast.success("تم الحذف"); }} className="gap-2"><Trash2 className="h-4 w-4" />حذف</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>معلومات المطور</CardTitle></CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p><strong>المطور:</strong> علي محمد علي</p>
            <p><strong>البريد:</strong> alyedaft@gmail.com</p>
            <p><strong>واتساب:</strong> 01223909712</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlatformInfoSettings;
