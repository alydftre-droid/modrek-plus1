import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Lock, Phone, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function TeacherSettingsPage() {
  const { user } = useAuth();
  const [teacherName, setTeacherName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, email, phone").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTeacherName(data.full_name);
          setEmail(data.email);
          setPhone(data.phone || "");
        }
      });
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({ email, phone, updated_at: new Date().toISOString() }).eq("id", user.id);
      await supabase.auth.updateUser({ email });
      toast.success("تم تحديث البيانات بنجاح");
    } catch (e) {
      toast.error("خطأ في تحديث البيانات");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      toast.success("تم تغيير كلمة المرور بنجاح");
    } catch (e) {
      toast.error("خطأ في تغيير كلمة المرور");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <TeacherSidebarLayout title="الإعدادات" teacherName={teacherName}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5" />
              معلومات الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-2 mb-1.5"><Mail className="h-3.5 w-3.5" />البريد الإلكتروني</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-1.5"><Phone className="h-3.5 w-3.5" />رقم الهاتف</Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-5 w-5" />
              تغيير كلمة المرور
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
            />
            <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline" className="w-full gap-2">
              {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              تغيير كلمة المرور
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5" />
              الدعم والتواصل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">تواصل مع إدارة المنصة للمساعدة</p>
            <Button
              onClick={() => window.open("https://wa.me/201223909712?text=مرحباً، أنا معلم على منصة أزهاريون وأحتاج مساعدة", "_blank")}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              تواصل عبر واتساب
            </Button>
          </CardContent>
        </Card>
      </div>
    </TeacherSidebarLayout>
  );
}
