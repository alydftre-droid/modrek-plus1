import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Loader2, MessageCircle, Facebook, Bot, FileText } from "lucide-react";
import { loadSupportSettings, type SupportSettings } from "@/lib/supportContactTemplate";

const VARIABLES = [
  "{{name}}", "{{role}}", "{{code}}", "{{studentCode}}", "{{teacherCode}}",
  "{{grade}}", "{{stage}}", "{{phone}}", "{{email}}",
  "{{appVersion}}", "{{platform}}", "{{device}}", "{{time}}", "{{date}}",
];

async function saveSetting(key: string, value: string) {
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) {
    throw new Error(`${key}: ${error.message}`);
  }
}

export default function SupportChannelsSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<SupportSettings | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setS(await loadSupportSettings()); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading || !s) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const update = <K extends keyof SupportSettings>(k: K, v: SupportSettings[K]) => setS({ ...s, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting("support_whatsapp_student", s.whatsappStudent.trim()),
        saveSetting("support_whatsapp_teacher", s.whatsappTeacher.trim()),
        saveSetting("support_whatsapp_enabled", String(s.whatsappEnabled)),
        saveSetting("support_messenger_student", s.messengerStudent.trim()),
        saveSetting("support_messenger_teacher", s.messengerTeacher.trim()),
        saveSetting("support_messenger_enabled", String(s.messengerEnabled)),
        saveSetting("support_assistant_enabled", String(s.assistantEnabled)),
        saveSetting("support_assistant_display_name", s.assistantDisplayName.trim() || "المساعد الذكي"),
        saveSetting("support_message_template", s.messageTemplate),
      ]);
      setS(await loadSupportSettings());
      toast.success("تم حفظ إعدادات الدعم");
    } catch (error) {
      console.error("support settings save failed", error);
      toast.error("تعذر حفظ إعدادات الدعم — تحقق من الصلاحيات والاتصال");
    }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-emerald-600" /> واتساب
            <Switch className="ms-auto" checked={s.whatsappEnabled} onCheckedChange={(v) => update("whatsappEnabled", v)} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label className="text-xs">رقم واتساب الطلاب</Label>
            <Input dir="ltr" value={s.whatsappStudent} onChange={(e) => update("whatsappStudent", e.target.value)} placeholder="201xxxxxxxxx" />
          </div>
          <div><Label className="text-xs">رقم واتساب المعلمين</Label>
            <Input dir="ltr" value={s.whatsappTeacher} onChange={(e) => update("whatsappTeacher", e.target.value)} placeholder="201xxxxxxxxx" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Facebook className="h-5 w-5 text-sky-600" /> فيسبوك Messenger
            <Switch className="ms-auto" checked={s.messengerEnabled} onCheckedChange={(v) => update("messengerEnabled", v)} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label className="text-xs">رابط Messenger للطلاب</Label>
            <Input dir="ltr" value={s.messengerStudent} onChange={(e) => update("messengerStudent", e.target.value)} placeholder="https://m.me/yourpage" />
          </div>
          <div><Label className="text-xs">رابط Messenger للمعلمين</Label>
            <Input dir="ltr" value={s.messengerTeacher} onChange={(e) => update("messengerTeacher", e.target.value)} placeholder="https://m.me/yourpage" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-blue-600" /> التواصل المباشر مع الدعم (المساعد الذكي)
            <Switch className="ms-auto" checked={s.assistantEnabled} onCheckedChange={(v) => update("assistantEnabled", v)} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs">الاسم الظاهر للمستخدم</Label>
          <Input value={s.assistantDisplayName} onChange={(e) => update("assistantDisplayName", e.target.value)} placeholder="المساعد الذكي" />
          <p className="text-[11px] text-muted-foreground mt-2">
            هذا الخيار يُفعّل/يعطّل بطاقة التواصل المباشر فقط، ولا يغيّر منطق المساعد الذكي أو نظام التحويل لموظف الدعم.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-violet-600" /> قالب الرسالة التلقائية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={10} value={s.messageTemplate} onChange={(e) => update("messageTemplate", e.target.value)}
            className="font-mono text-sm leading-relaxed" dir="rtl" />
          <div>
            <p className="text-xs font-semibold mb-2">المتغيّرات المتاحة (اضغط للنسخ):</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button key={v} type="button" onClick={() => { navigator.clipboard?.writeText(v); toast.success(`نُسخ ${v}`); }}
                  className="text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-mono">
                  {v}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="w-full gap-2 h-11">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ إعدادات الدعم
      </Button>
    </div>
  );
}
