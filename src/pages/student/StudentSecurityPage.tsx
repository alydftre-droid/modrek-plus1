import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { queueExternalSync } from "@/lib/externalSync";
import { getPostSignOutPath, isImpersonating } from "@/lib/devImpersonation";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Mail, Loader2, Eye, EyeOff, LogOut, Shield } from "lucide-react";
import { toast } from "sonner";
import OtpVerificationDialog from "@/components/auth/OtpVerificationDialog";

export default function StudentSecurityPage() {
  const {
    user,
    signOut,
    sendReauthOtp,
    updatePasswordWithOtp,
    sendEmailChangeOtp,
    verifyEmailChangeOtp,
  } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwdOtpOpen, setPwdOtpOpen] = useState(false);

  const [showEmailChange, setShowEmailChange] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailOtpOpen, setEmailOtpOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const normalizeEmail = (v: string) => v.trim().replace(/\s+/g, "").toLowerCase();

  const startPasswordChange = async () => {
    if (newPassword.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    setSaving(true);
    const { error } = await sendReauthOtp();
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success("تم إرسال رمز التحقق إلى بريدك");
    setPwdOtpOpen(true);
  };

  const startEmailChange = async () => {
    const normalized = normalizeEmail(newEmail);
    if (!normalized || !normalized.includes("@")) { toast.error("أدخل بريد إلكتروني صالح"); return; }
    if (normalized === user?.email?.toLowerCase()) { toast.error("هذا هو بريدك الحالي بالفعل"); return; }
    setEmailSaving(true);
    const { error } = await sendEmailChangeOtp(normalized);
    setEmailSaving(false);
    if (error) { toast.error(error); return; }
    setPendingEmail(normalized);
    toast.success("تم إرسال رمز التحقق إلى البريد الجديد");
    setEmailOtpOpen(true);
  };

  const handleLogoutAll = async () => {
    if (isImpersonating()) {
      const nextPath = getPostSignOutPath("/auth");
      await signOut();
      toast.success("تم الرجوع إلى حساب المطور");
      navigate(nextPath, { replace: true });
      return;
    }
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) toast.error("فشل تسجيل الخروج");
    else { toast.success("تم تسجيل الخروج من جميع الأجهزة"); navigate("/auth"); }
  };

  return (
    <StudentSidebarLayout title="إدارة الحساب">
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-5">

        {/* Change Password via OTP */}
        <Card className="border border-border">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="text-base font-bold">تغيير كلمة المرور</h3>
            </div>
            <p className="text-xs text-muted-foreground">سنرسل رمز تحقق إلى بريدك لتأكيد العملية</p>

            <div className="space-y-3">
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

              <Button onClick={startPasswordChange} disabled={saving || !newPassword || !confirmPassword} className="w-full bg-primary text-primary-foreground border-0 mt-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Mail className="h-4 w-4 ml-2" />}
                إرسال رمز التحقق
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Change Email via OTP */}
        <Card className="border border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold">البريد الإلكتروني</h3>
              </div>
              {!showEmailChange && (
                <button onClick={() => setShowEmailChange(true)} className="text-xs text-primary font-semibold hover:underline">تغيير</button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">البريد الحالي: <span className="font-semibold text-foreground" dir="ltr">{user?.email}</span></p>
            {showEmailChange && (
              <div className="space-y-3 pt-2">
                <Input type="text" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="البريد الإلكتروني الجديد" dir="ltr" className="text-left" />
                <p className="text-[11px] text-muted-foreground">سيتم إرسال رمز تحقق للبريد الجديد ولا يتم اعتماد التغيير إلا بعد إدخال الرمز بشكل صحيح.</p>
                <div className="flex gap-2">
                  <Button onClick={startEmailChange} disabled={emailSaving} className="flex-1 bg-primary text-primary-foreground border-0">
                    {emailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال رمز التحقق"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowEmailChange(false); setNewEmail(""); }} className="border-border">إلغاء</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logout all devices */}
        <Card className="border border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              <h3 className="text-base font-bold">إدارة الجلسات</h3>
            </div>
            <p className="text-xs text-muted-foreground">سجّل الخروج من جميع الأجهزة الأخرى لحماية حسابك.</p>
            <Button variant="destructive" onClick={handleLogoutAll} className="w-full gap-2">
              <LogOut className="h-4 w-4" />
              {isImpersonating() ? "الرجوع إلى حساب المطور" : "تسجيل الخروج من جميع الأجهزة"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* OTP dialog for password change */}
      <OtpVerificationDialog
        open={pwdOtpOpen}
        email={user?.email || ""}
        title="تأكيد تغيير كلمة المرور"
        description={<>أدخل الرمز المرسل إلى<br /><span className="font-semibold" dir="ltr">{user?.email}</span></> as any}
        skipSessionWait
        onSendOtp={sendReauthOtp}
        onVerify={async (code) => {
          const res = await updatePasswordWithOtp(newPassword, code);
          if (!res.error) {
            toast.success("تم تغيير كلمة المرور بنجاح ✓");
            setNewPassword(""); setConfirmPassword("");
          }
          return res;
        }}
        onVerified={() => setPwdOtpOpen(false)}
        onClose={() => setPwdOtpOpen(false)}
      />

      {/* OTP dialog for email change */}
      <OtpVerificationDialog
        open={emailOtpOpen}
        email={pendingEmail}
        title="تأكيد البريد الإلكتروني الجديد"
        skipSessionWait
        onSendOtp={() => sendEmailChangeOtp(pendingEmail)}
        onVerify={async (code) => {
          const res = await verifyEmailChangeOtp(pendingEmail, code);
          if (!res.error) {
            toast.success("تم تغيير البريد الإلكتروني بنجاح ✓");
            setShowEmailChange(false); setNewEmail(""); setPendingEmail("");
          }
          return res;
        }}
        onVerified={() => setEmailOtpOpen(false)}
        onClose={() => setEmailOtpOpen(false)}
      />
    </StudentSidebarLayout>
  );
}
