import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Loader2, Mail, KeyRound, ShieldCheck, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import OtpVerificationDialog from "@/components/auth/OtpVerificationDialog";

const AdminSecuritySettings = () => {
  const {
    user,
    sendReauthOtp,
    updatePasswordWithOtp,
    sendEmailChangeOtp,
    verifyEmailChangeOtp,
  } = useAuth();
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailOtpOpen, setEmailOtpOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdOtpOpen, setPwdOtpOpen] = useState(false);

  const rules = {
    length: newPwd.length >= 10,
    upper: /[A-Z]/.test(newPwd),
    lower: /[a-z]/.test(newPwd),
    digit: /\d/.test(newPwd),
    symbol: /[^A-Za-z0-9]/.test(newPwd),
    match: newPwd.length > 0 && newPwd === confirmPwd,
  };
  const strongPwd = rules.length && rules.upper && rules.lower && rules.digit && rules.symbol;

  const handleStartEmail = async () => {
    if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) return toast.error("بريد إلكتروني غير صالح");
    if (newEmail.toLowerCase() === user?.email?.toLowerCase()) return toast.error("هذا هو بريدك الحالي بالفعل");
    setSavingEmail(true);
    const { error } = await sendEmailChangeOtp(newEmail);
    setSavingEmail(false);
    if (error) { toast.error(error); return; }
    setPendingEmail(newEmail.trim().toLowerCase());
    toast.success("تم إرسال رمز تحقق إلى البريد الجديد");
    setEmailOtpOpen(true);
  };

  const handleStartPwd = async () => {
    if (!strongPwd) return toast.error("كلمة المرور لا تستوفي الشروط");
    if (!rules.match) return toast.error("تأكيد كلمة المرور غير متطابق");
    setSavingPwd(true);
    const { error } = await sendReauthOtp();
    setSavingPwd(false);
    if (error) { toast.error(error); return; }
    toast.success("تم إرسال رمز التحقق إلى بريدك");
    setPwdOtpOpen(true);
  };

  const Rule = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      <span>{text}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" /> أمان حساب المطور</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
            <p><strong>البريد الحالي:</strong> {user?.email}</p>
            <p className="text-muted-foreground">يستخدم هذا الحساب لتسجيل دخول لوحة المطور. حافظ على سرّيته.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-5 w-5" /> تغيير البريد الإلكتروني</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>البريد الإلكتروني الجديد</Label>
            <Input type="email" dir="ltr" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@example.com" />
          </div>
          <Button onClick={handleStartEmail} disabled={savingEmail} className="w-full gap-2">
            {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            إرسال رمز التحقق
          </Button>
          <p className="text-[11px] text-muted-foreground">سيتم إرسال رمز تحقق للبريد الجديد ولا يتم اعتماد التغيير إلا بعد إدخال الرمز بشكل صحيح.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-5 w-5" /> تغيير كلمة المرور</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>كلمة المرور الجديدة</Label>
            <div className="relative">
              <Input type={showPwd ? "text" : "password"} dir="ltr" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label>تأكيد كلمة المرور الجديدة</Label>
            <Input type={showPwd ? "text" : "password"} dir="ltr" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border p-2.5">
            <Rule ok={rules.length} text="10 أحرف على الأقل" />
            <Rule ok={rules.upper} text="حرف كبير (A-Z)" />
            <Rule ok={rules.lower} text="حرف صغير (a-z)" />
            <Rule ok={rules.digit} text="رقم (0-9)" />
            <Rule ok={rules.symbol} text="رمز خاص (!@#…)" />
            <Rule ok={rules.match} text="التأكيد مطابق" />
          </div>
          <Button onClick={handleStartPwd} disabled={savingPwd || !strongPwd || !rules.match} className="w-full gap-2">
            {savingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            إرسال رمز التحقق
          </Button>
          <p className="text-[11px] text-muted-foreground">سنرسل رمز تحقق إلى بريدك لتأكيد العملية.</p>
        </CardContent>
      </Card>

      <OtpVerificationDialog
        open={pwdOtpOpen}
        email={user?.email || ""}
        title="تأكيد تغيير كلمة المرور"
        skipSessionWait
        onSendOtp={sendReauthOtp}
        onVerify={async (code) => {
          const res = await updatePasswordWithOtp(newPwd, code);
          if (!res.error) {
            toast.success("تم تغيير كلمة المرور بنجاح ✓");
            setNewPwd(""); setConfirmPwd("");
          }
          return res;
        }}
        onVerified={() => setPwdOtpOpen(false)}
        onClose={() => setPwdOtpOpen(false)}
      />

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
            setNewEmail(""); setPendingEmail("");
          }
          return res;
        }}
        onVerified={() => setEmailOtpOpen(false)}
        onClose={() => setEmailOtpOpen(false)}
      />
    </div>
  );
};

export default AdminSecuritySettings;
