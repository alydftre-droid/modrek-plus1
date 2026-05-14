import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildCanonicalAppUrl } from "@/lib/authUrls";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Lock, Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function TeacherSecurityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teacherName, setTeacherName] = useState("");
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Forgot password
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Change email
  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  const normalizeEmail = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) { setTeacherName(data.full_name); setTeacherAvatar(data.avatar_url); }
      });
  }, [user?.id]);

  const handleChangePassword = async () => {
    if (!oldPassword) { toast.error("أدخل كلمة المرور الحالية"); return; }
    if (newPassword.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setSaving(true);
    try {
      // Verify old password first
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user!.email!, password: oldPassword });
      if (signInError) { toast.error("كلمة المرور الحالية غير صحيحة"); setSaving(false); return; }
      
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("تم تغيير كلمة المرور بنجاح ✓");
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch {
      toast.error("خطأ في تغيير كلمة المرور");
    } finally {
      setSaving(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!user?.email) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: buildCanonicalAppUrl("/auth"),
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("تم إرسال رابط إعادة تعيين كلمة المرور لبريدك الإلكتروني");
    } catch {
      toast.error("حدث خطأ في إرسال الرابط");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    const normalizedEmail = normalizeEmail(newEmail);
    if (!normalizedEmail || !normalizedEmail.includes("@")) { toast.error("أدخل بريد إلكتروني صالح"); return; }
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: normalizedEmail });
      if (error) throw error;
      toast.success("تم إرسال رابط التأكيد للبريد الجديد");
      setShowEmailChange(false); setNewEmail("");
    } catch {
      toast.error("خطأ في تغيير البريد");
    } finally {
      setEmailSaving(false);
    }
  };

  return (
    <TeacherSidebarLayout title="كلمة المرور والأمان" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-5">
        <button onClick={() => navigate("/teacher/settings")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" />
          الرجوع للإعدادات
        </button>

        {/* Change Password */}
        <Card className="border border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold">تغيير كلمة المرور</h3>
            </div>
            <p className="text-xs text-muted-foreground">يجب ألا تقل كلمة المرور عن 6 أحرف</p>

            {!forgotMode ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm text-muted-foreground mb-1.5 block">كلمة المرور الحالية</Label>
                  <div className="relative">
                    <Input type={showOld ? "text" : "password"} value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="أدخل كلمة المرور الحالية" className="pl-10" />
                    <button type="button" onClick={() => setShowOld(!showOld)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-1.5 block">كلمة المرور الجديدة</Label>
                  <div className="relative">
                    <Input type={showNew ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="كلمة المرور الجديدة" className="pl-10" />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground mb-1.5 block">تأكيد كلمة المرور الجديدة</Label>
                  <div className="relative">
                    <Input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة المرور" className="pl-10" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button onClick={() => setForgotMode(true)} className="text-xs text-primary font-semibold hover:underline">
                    هل نسيت كلمة المرور؟
                  </button>
                </div>

                <Button onClick={handleChangePassword} disabled={saving || !oldPassword || !newPassword || !confirmPassword} className="w-full bg-primary text-primary-foreground border-0 mt-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Lock className="h-4 w-4 ml-2" />}
                  تغيير كلمة المرور
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {!resetSent ? (
                  <>
                    <p className="text-sm text-muted-foreground">سيتم إرسال رابط إعادة تعيين كلمة المرور إلى: <span className="font-semibold text-foreground">{user?.email}</span></p>
                    <Button onClick={handleForgotPassword} disabled={saving} className="w-full bg-primary text-primary-foreground border-0">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Mail className="h-4 w-4 ml-2" />}
                      إرسال رابط إعادة التعيين
                    </Button>
                    <button onClick={() => setForgotMode(false)} className="text-xs text-muted-foreground hover:text-foreground w-full text-center">
                      الرجوع لتغيير كلمة المرور
                    </button>
                  </>
                ) : (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm font-semibold text-foreground">✓ تم الإرسال بنجاح</p>
                    <p className="text-xs text-muted-foreground">تحقق من بريدك الإلكتروني واتبع الرابط</p>
                    <button onClick={() => { setForgotMode(false); setResetSent(false); }} className="text-xs text-primary hover:underline mt-2">
                      الرجوع
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Email */}
        <Card className="border border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold">البريد الإلكتروني</h3>
              </div>
              {!showEmailChange && (
                <button onClick={() => setShowEmailChange(true)} className="text-xs text-primary font-semibold hover:underline">
                  تغيير
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">البريد الحالي: <span className="font-semibold text-foreground" dir="ltr">{user?.email}</span></p>
            
            {showEmailChange && (
              <div className="space-y-3 pt-2">
                <Input type="text" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد" dir="ltr" className="text-left" />
                <div className="flex gap-2">
                  <Button onClick={handleChangeEmail} disabled={emailSaving} className="flex-1 bg-primary text-primary-foreground border-0">
                    {emailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowEmailChange(false); setNewEmail(""); }} className="border-border">
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TeacherSidebarLayout>
  );
}
