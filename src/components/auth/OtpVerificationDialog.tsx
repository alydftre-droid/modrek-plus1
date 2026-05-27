import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Mail, RefreshCw, PencilLine } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";


interface OtpVerificationDialogProps {
  open: boolean;
  email: string;
  onVerified: () => void;
  onClose: () => void;
  type?: "email" | "recovery";
  title?: string;
  description?: string;
}

const RESEND_COOLDOWN = 60; // seconds
const MAX_ATTEMPTS = 5;

export default function OtpVerificationDialog({
  open,
  email,
  onVerified,
  onClose,
  type = "email",
  title = "تأكيد البريد الإلكتروني",
  description,
}: OtpVerificationDialogProps) {
  const { verifyEmailOtp, sendEmailOtp } = useAuth();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!open) {
      setCode("");
      setAttempts(0);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Auto-start cooldown when dialog opens (since we just sent the OTP)
  useEffect(() => {
    if (open && cooldown === 0) setCooldown(RESEND_COOLDOWN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast({ title: "أدخل الرمز كاملاً (6 أرقام)", variant: "destructive" });
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      toast({
        title: "تم تجاوز المحاولات المسموحة",
        description: "اطلب رمزاً جديداً وحاول مرة أخرى.",
        variant: "destructive",
      });
      return;
    }
    setVerifying(true);
    const { error } = await verifyEmailOtp(email, code, type);
    setVerifying(false);
    if (error) {
      setAttempts((a) => a + 1);
      toast({ title: "فشل التحقق", description: error, variant: "destructive" });
      setCode("");
      return;
    }
    toast({ title: "تم التحقق بنجاح ✓" });
    onVerified();
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    // For new email signups the user already exists (created by signUp), so shouldCreateUser=false
    // For password recovery the user exists too — same.
    const { error } = await sendEmailOtp(email, false);
    setResending(false);
    if (error) {
      toast({ title: "فشل إعادة الإرسال", description: error, variant: "destructive" });
      return;
    }
    setCooldown(RESEND_COOLDOWN);
    setAttempts(0);
    toast({ title: "تم إرسال رمز جديد إلى بريدك" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description ?? (
              <>
                أرسلنا رمز تحقق مكوّن من 6 أرقام إلى
                <br />
                <span className="font-semibold text-foreground" dir="ltr">{email}</span>
                <br />
                <span className="text-xs">صالح لمدة 5 دقائق</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-center" dir="ltr">
            <InputOTP maxLength={6} value={code} onChange={setCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            onClick={handleVerify}
            disabled={verifying || code.length !== 6}
            className="w-full"
            size="lg"
          >
            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : "تأكيد"}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${resending ? "animate-spin" : ""}`} />
              {cooldown > 0 ? `إعادة الإرسال خلال ${cooldown} ث` : "إعادة إرسال الرمز"}
            </button>
          </div>

          {attempts > 0 && attempts < MAX_ATTEMPTS && (
            <p className="text-xs text-center text-muted-foreground">
              المحاولات المتبقية: {MAX_ATTEMPTS - attempts}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
