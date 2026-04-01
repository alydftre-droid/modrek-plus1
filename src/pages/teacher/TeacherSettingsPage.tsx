import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Lock, Phone, Mail, MessageCircle, Shield, User } from "lucide-react";
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
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-5">
        {/* Account Info */}
        <Card className="teacher-settings-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base">
              <div className="card-icon card-icon--blue">
                <User className="h-4 w-4" />
              </div>
              معلومات الحساب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-2 mb-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />البريد الإلكتروني
              </Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-accent/30" />
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />رقم الهاتف
              </Label>
              <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className="bg-accent/30" />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </CardContent>
        </Card>

        {/* Password */}
        <Card className="teacher-settings-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base">
              <div className="card-icon card-icon--purple">
                <Shield className="h-4 w-4" />
              </div>
              تغيير كلمة المرور
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1.5 text-muted-foreground">كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                className="bg-accent/30"
              />
            </div>
            <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0">
              {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              <Lock className="h-4 w-4" />
              تغيير كلمة المرور
            </Button>
          </CardContent>
        </Card>

        {/* Support */}
        <Card className="teacher-settings-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base">
              <div className="card-icon card-icon--green">
                <MessageCircle className="h-4 w-4" />
              </div>
              الدعم والتواصل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">تواصل مع إدارة المنصة عبر واتساب للحصول على المساعدة الفورية</p>
            <Button
              onClick={() => window.open("https://wa.me/201223909712?text=مرحباً، أنا معلم على منصة أزهاريون وأحتاج مساعدة", "_blank")}
              className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white border-0"
            >
              <MessageCircle className="h-4 w-4" />
              تواصل عبر واتساب
            </Button>
          </CardContent>
        </Card>

        {/* App Info */}
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">منصة أزهاريون التعليمية — إصدار 2026</p>
        </div>
      </div>
    </TeacherSidebarLayout>
  );
}
