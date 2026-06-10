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
    // shouldCreateUser=false → does not create new account if email doesn't exist
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
    <div className="safe-area-top safe-area-x min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-3 mb-8">
          <img src={mudrikLogo} alt="مدرك Plus" className="h-12 w-12 rounded-xl" />
          <span className="text-2xl font-bold text-gradient-mudrik">مدرك Plus</span>
        </Link>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>نسيت كلمة المرور</CardTitle>
            <CardDescription>أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق</CardDescription>
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
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>إرسال رمز التحقق <ChevronRight className="h-4 w-4 mr-1" /></>
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link to="/auth" className="text-primary hover:underline">العودة لتسجيل الدخول</Link>
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
