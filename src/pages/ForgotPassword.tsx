import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Loader2, ChevronRight, Phone } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import OtpVerificationDialog from "@/components/auth/OtpVerificationDialog";
import mudrikLogo from "@/assets/mudrik-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { resolveLoginEmailByPhone } from "@/lib/resolveLoginEmail";

const phoneRegex = /^[0-9+\-\s]{8,20}$/;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sendEmailOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"email" | "phone">(
    searchParams.get("method") === "phone" ? "phone" : "email",
  );
  const [otpEmail, setOtpEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    let normalized = email.trim().toLowerCase();
    if (method === "email" && (!normalized || !normalized.includes("@"))) {
      toast({ title: "أدخل بريداً إلكترونياً صالحاً", variant: "destructive" });
      return;
    }
    if (method === "phone") {
      if (!phoneRegex.test(phone)) {
        toast({ title: "أدخل رقم هاتف صالحاً", variant: "destructive" });
        return;
      }
      setLoading(true);
      const resolved = await resolveLoginEmailByPhone(phone);
      if (!resolved.ok) {
        setLoading(false);
        toast({ title: "تعذر الإرسال", description: resolved.message, variant: "destructive" });
        return;
      }
      normalized = resolved.email;
    } else {
      setLoading(true);
    }
    const { error } = await sendEmailOtp(normalized, false);
    setLoading(false);
    if (error) {
      toast({ title: "تعذر الإرسال", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "تم إرسال رمز التحقق إلى بريدك" });
    setOtpEmail(normalized);
    setShowOtp(true);
  };

  return (
    <div className="auth2026-page safe-area-top safe-area-x min-h-screen flex items-start md:items-center justify-center px-4 pt-10 pb-8 md:py-10 relative overflow-hidden">
      <div className="auth2026-panel-wrap w-full max-w-md relative z-10">
        <Link to="/" className="auth2026-brand-link group">
          <span className="auth2026-logo-mark">
            <img src={mudrikLogo} alt="مدرك Plus" />
          </span>
          <span className="auth2026-brand-name">
            <span className="auth2026-brand-ar">مدرك</span>{" "}
            <span className="auth2026-brand-plus">Plus</span>
          </span>
        </Link>


        <Card className="auth2026-card">
          <CardHeader className="text-center">
            <CardTitle className="auth2026-title text-2xl font-extrabold">نسيت كلمة المرور</CardTitle>
            <CardDescription className="auth2026-desc">
              {method === "email" ? "أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق" : "أدخل رقم الهاتف وسنرسل الرمز إلى البريد المرتبط به"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-4">
              <div className="auth2026-method-toggle">
                <button type="button" onClick={() => setMethod("email")} className={`auth2026-method-button ${method === "email" ? "is-active" : ""}`}>
                  <Mail className="h-4 w-4" /> البريد الإلكتروني
                </button>
                <button type="button" onClick={() => setMethod("phone")} className={`auth2026-method-button ${method === "phone" ? "is-active" : ""}`}>
                  <Phone className="h-4 w-4" /> رقم الهاتف
                </button>
              </div>

              {method === "email" ? (
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="email"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      dir="ltr"
                      placeholder="example@email.com"
                      className="pr-10 text-left"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="phone">رقم الهاتف</Label>
                  <div className="relative">
                    <Phone className="auth2026-field-icon absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5" />
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder="01xxxxxxxxx"
                      className="pr-10 text-left"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              <Button
                type="submit"
                className="auth2026-primary-button w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>إرسال رمز التحقق <ChevronRight className="h-4 w-4 mr-1" /></>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link to="/auth" className="auth2026-link hover:underline">
                العودة لتسجيل الدخول
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <OtpVerificationDialog
        open={showOtp}
        email={otpEmail || email.trim().toLowerCase()}
        type="recovery"
        length={6}
        title="تحقق من بريدك"
        onVerified={() => navigate("/reset-password", { replace: true })}
        onClose={() => setShowOtp(false)}
        onChangeEmail={() => setShowOtp(false)}
      />
    </div>
  );
}
