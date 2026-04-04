import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Lock, KeyRound, Mail, Loader2, Eye, EyeOff, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type View = "menu" | "change-password" | "forgot-password" | "change-email";

export default function TeacherSecurityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("menu");
  const [teacherName, setTeacherName] = useState("");
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null);

  // Change password
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oldVerified, setOldVerified] = useState(false);

  // Forgot password
  const [resetSent, setResetSent] = useState(false);

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, avatar_url, email").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTeacherName(data.full_name);
          setTeacherAvatar(data.avatar_url);
        }
      });
  }, [user?.id]);

  const verifyOldPassword = async () => {
    if (!oldPassword || !user?.email) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
      if (error) {
        toast.error("كلمة المرور القديمة غير صحيحة");
        setOldVerified(false);
      } else {
        setOldVerified(true);
        toast.success("تم التحقق، أدخل كلمة المرور الجديدة");
      }
    } catch {
      toast.error("حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("تم تغيير كلمة المرور بنجاح ✓");
      setView("menu");
      setOldPassword(""); setNewPassword(""); setConfirmPassword(""); setOldVerified(false);
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
        redirectTo: `${window.location.origin}/auth`,
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
    if (!newEmail || !newEmail.includes("@")) { toast.error("أدخل بريد إلكتروني صالح"); return; }
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("تم إرسال رابط التأكيد للبريد الجديد، تحقق من بريدك");
      setView("menu");
    } catch {
      toast.error("خطأ في تغيير البريد");
    } finally {
      setEmailSaving(false);
    }
  };

  const renderMenu = () => (
    <div className="space-y-3">
      {[
        { id: "change-password" as View, label: "تغيير كلمة المرور", desc: "أدخل كلمة المرور القديمة ثم الجديدة", icon: Lock, color: "from-blue-500 to-indigo-600" },
        { id: "forgot-password" as View, label: "نسيت كلمة المرور", desc: "إرسال رابط إعادة تعيين لبريدك الإلكتروني", icon: KeyRound, color: "from-amber-500 to-orange-600" },
        { id: "change-email" as View, label: "تغيير البريد الإلكتروني", desc: "تحديث بريدك الإلكتروني المسجل", icon: Mail, color: "from-violet-500 to-purple-600" },
      ].map((item) => (
        <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-all duration-200 border border-border hover:border-primary/30 group" onClick={() => setView(item.id)}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0 shadow-md`}>
              <item.icon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">{item.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderChangePassword = () => (
    <Card className="border border-border">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Lock className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-base font-bold">تغيير كلمة المرور</h3>
        </div>

        {!oldVerified ? (
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
            <Button onClick={verifyOldPassword} disabled={!oldPassword || saving} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Check className="h-4 w-4 ml-2" />}
              تحقق من كلمة المرور
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              <ShieldCheck className="h-4 w-4" /> تم التحقق بنجاح
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input type={showNew ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="6 أحرف على الأقل" className="pl-10" />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">تأكيد كلمة المرور الجديدة</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة المرور" />
            </div>
            <Button onClick={handleChangePassword} disabled={saving} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Lock className="h-4 w-4 ml-2" />}
              تغيير كلمة المرور
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderForgotPassword = () => (
    <Card className="border border-border">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <KeyRound className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-base font-bold">نسيت كلمة المرور</h3>
        </div>
        {!resetSent ? (
          <>
            <p className="text-sm text-muted-foreground">سيتم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني المسجل: <span className="font-semibold text-foreground">{user?.email}</span></p>
            <Button onClick={handleForgotPassword} disabled={saving} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Mail className="h-4 w-4 ml-2" />}
              إرسال رابط إعادة التعيين
            </Button>
          </>
        ) : (
          <div className="text-center py-6 space-y-3">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <h4 className="font-bold text-foreground">تم الإرسال بنجاح!</h4>
            <p className="text-sm text-muted-foreground">تحقق من بريدك الإلكتروني واتبع الرابط لإعادة تعيين كلمة المرور</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderChangeEmail = () => (
    <Card className="border border-border">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Mail className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-base font-bold">تغيير البريد الإلكتروني</h3>
        </div>
        <p className="text-xs text-muted-foreground">البريد الحالي: <span className="font-semibold text-foreground">{user?.email}</span></p>
        <div>
          <Label className="text-sm text-muted-foreground mb-1.5 block">البريد الإلكتروني الجديد</Label>
          <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="example@email.com" dir="ltr" />
        </div>
        <Button onClick={handleChangeEmail} disabled={emailSaving} className="w-full bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
          {emailSaving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Mail className="h-4 w-4 ml-2" />}
          تحديث البريد الإلكتروني
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <TeacherSidebarLayout title="كلمة المرور والأمان" teacherName={teacherName} teacherAvatar={teacherAvatar}>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <button onClick={() => view === "menu" ? navigate("/teacher/settings") : setView("menu")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-4 w-4" />
          {view === "menu" ? "الرجوع للإعدادات" : "الرجوع"}
        </button>

        <div className="text-center py-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-2 shadow-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-lg font-bold">كلمة المرور وبيانات الحساب</h2>
        </div>

        {view === "menu" && renderMenu()}
        {view === "change-password" && renderChangePassword()}
        {view === "forgot-password" && renderForgotPassword()}
        {view === "change-email" && renderChangeEmail()}
      </div>
    </TeacherSidebarLayout>
  );
}
