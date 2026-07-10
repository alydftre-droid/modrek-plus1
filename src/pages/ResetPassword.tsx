import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import mudrikLogo from "@/assets/mudrik-logo.png";

const passwordSchema = z.string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(72, "كلمة المرور طويلة جداً");

export default function ResetPassword() {
  const navigate = useNavigate();
  const { setPasswordAfterOtp, signOut } = useAuth();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  // Verify directly with Supabase to avoid race with onAuthStateChange after verifyOtp.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 25; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { if (!cancelled) setChecking(false); return; }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelled) return;
      toast({ title: "انتهت الجلسة", description: "أعد طلب رمز التحقق", variant: "destructive" });
      navigate("/forgot-password", { replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = passwordSchema.safeParse(password);
    if (!result.success) {
      toast({ title: result.error.errors[0].message, variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await setPasswordAfterOtp(password);
    setSaving(false);
    if (error) {
      toast({ title: "تعذر تحديث كلمة المرور", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "تم تغيير كلمة المرور ✓", description: "سجّل الدخول بكلمة المرور الجديدة" });
    await signOut();
    navigate("/auth", { replace: true });
  };

  if (checking) {
    return (
      <div className="auth2026-loading safe-area-top safe-area-x min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="auth2026-page safe-area-top safe-area-x min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="auth2026-panel-wrap w-full max-w-md relative z-10">
        <div className="auth2026-brand-link">
          <span className="auth2026-logo-mark">
            <img src={mudrikLogo} alt="مدرك Plus" />
          </span>
          <span className="auth2026-brand-name">
            <span className="auth2026-brand-ar">مدرك</span>{" "}
            <span className="auth2026-brand-plus">Plus</span>
          </span>
        </div>
        <Card className="auth2026-card">
          <CardHeader className="text-center">
            <CardTitle className="auth2026-title">تعيين كلمة مرور جديدة</CardTitle>
            <CardDescription className="auth2026-desc">اختر كلمة مرور من 8 أحرف أو أرقام على الأقل</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Lock className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                  <Input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8 أحرف أو أرقام على الأقل"
                    className="pr-10 pl-10"
                    required
                  />
                  <button type="button" onClick={() => setShow(!show)}
                    className="auth2026-eye-button absolute left-3 top-1/2 -translate-y-1/2">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Lock className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                  <Input
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="أعد كتابة كلمة المرور"
                    className="pr-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="auth2026-primary-button w-full" size="lg" disabled={saving}>
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "حفظ كلمة المرور"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
