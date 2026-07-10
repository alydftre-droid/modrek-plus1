import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Loader2, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import OtpVerificationDialog from "@/components/auth/OtpVerificationDialog";
import mudrikLogo from "@/assets/mudrik-logo.png";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { sendEmailOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      toast({ title: "أدخل بريداً إلكترونياً صالحاً", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await sendEmailOtp(normalized, false);
    setLoading(false);
    if (error) {
      toast({ title: "تعذر الإرسال", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "تم إرسال رمز التحقق إلى بريدك" });
    setShowOtp(true);
  };

  return (
    <div className="safe-area-top safe-area-x min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/40 p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-teal-200/40 blur-3xl" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <Link to="/" className="flex items-center justify-center gap-3 mb-8 group">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-14 w-14 rounded-2xl shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-100 bg-white p-1 transition-transform duration-300 group-hover:scale-105" />
          <span className="text-3xl font-extrabold text-emerald-700">مدرك <span className="text-teal-600">Plus</span></span>
        </Link>

        <Card className="shadow-xl shadow-emerald-900/5 border-emerald-100/70 bg-white/95 backdrop-blur rounded-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-extrabold text-emerald-800">نسيت كلمة المرور</CardTitle>
            <CardDescription className="text-slate-500">أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
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
              <Button
                type="submit"
                className="w-full bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 border-0"
                size="lg"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>إرسال رمز التحقق <ChevronRight className="h-4 w-4 mr-1" /></>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link to="/auth" className="text-emerald-700 hover:text-emerald-800 hover:underline font-medium">
                العودة لتسجيل الدخول
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <OtpVerificationDialog
        open={showOtp}
        email={email.trim().toLowerCase()}
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
