import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Loader2, Mail, KeyRound, ShieldCheck, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";

const AdminSecuritySettings = () => {
  const { user } = useAuth();
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailConfirmPwd, setEmailConfirmPwd] = useState("");

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const rules = {
    length: newPwd.length >= 10,
    upper: /[A-Z]/.test(newPwd),
    lower: /[a-z]/.test(newPwd),
    digit: /\d/.test(newPwd),
    symbol: /[^A-Za-z0-9]/.test(newPwd),
    match: newPwd.length > 0 && newPwd === confirmPwd,
  };
  const strongPwd = rules.length && rules.upper && rules.lower && rules.digit && rules.symbol;

  const handleChangeEmail = async () => {
    if (!user?.email) return;
    if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) return toast.error("بريد إلكتروني غير صالح");
    if (!emailConfirmPwd) return toast.error("ادخل كلمة المرور الحالية للتأكيد");
    setSavingEmail(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: emailConfirmPwd });
      if (signErr) { toast.error("كلمة المرور الحالية غير صحيحة"); return; }
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("تم إرسال رابط التأكيد إلى البريد الجديد");
      setNewEmail(""); setEmailConfirmPwd("");
    } catch (e: any) {
      toast.error(e?.message || "تعذر تغيير البريد");
    } finally { setSavingEmail(false); }
  };

  const handleChangePwd = async () => {
    if (!user?.email) return;
    if (!strongPwd) return toast.error("كلمة المرور لا تستوفي الشروط");
    if (!rules.match) return toast.error("تأكيد كلمة المرور غير متطابق");
    if (!currentPwd) return toast.error("ادخل كلمة المرور الحالية");
    setSavingPwd(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPwd });
      if (signErr) { toast.error("كلمة المرور الحالية غير صحيحة"); return; }
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("تم تغيير كلمة المرور بنجاح");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: any) {
      toast.error(e?.message || "تعذر تغيير كلمة المرور");
    } finally { setSavingPwd(false); }
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
          <div>
            <Label>كلمة المرور الحالية (للتأكيد)</Label>
            <Input type="password" dir="ltr" value={emailConfirmPwd} onChange={e => setEmailConfirmPwd(e.target.value)} />
          </div>
          <Button onClick={handleChangeEmail} disabled={savingEmail} className="w-full gap-2">
            {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            تحديث البريد
          </Button>
          <p className="text-[11px] text-muted-foreground">سيتم إرسال رابط تأكيد للبريدين القديم والجديد قبل اعتماد التغيير.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-5 w-5" /> تغيير كلمة المرور</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>كلمة المرور الحالية</Label>
            <Input type={showPwd ? "text" : "password"} dir="ltr" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
          </div>
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
          <Button onClick={handleChangePwd} disabled={savingPwd || !strongPwd || !rules.match} className="w-full gap-2">
            {savingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            تحديث كلمة المرور
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSecuritySettings;
