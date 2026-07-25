import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, MailCheck, RefreshCw, PencilLine, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface OtpVerificationDialogProps {
  open: boolean;
  email: string;
  onVerified: () => void;
  onClose: () => void;
  onChangeEmail?: () => void;
  type?: "email" | "recovery";
  title?: string;
  description?: React.ReactNode;
  /** OTP code length. Default 6. Use 4 if your Supabase template sends 4-digit codes. */
  length?: number;
  /** Override the default send-OTP behavior (used for reauth / email-change flows). */
  onSendOtp?: () => Promise<{ error: string | null }>;
  /** Override the default verify behavior. When present, session-wait is skipped. */
  onVerify?: (code: string) => Promise<{ error: string | null }>;
  /** Skip waiting for an auth session after verification (for email-change or reauth). */
  skipSessionWait?: boolean;
}

const RESEND_COOLDOWN = 60;
const MAX_ATTEMPTS = 5;

export default function OtpVerificationDialog({
  open,
  email,
  onVerified,
  onClose,
  onChangeEmail,
  type = "email",
  title = "تأكيد البريد الإلكتروني",
  description,
  length = 6,
  onSendOtp,
  onVerify,
  skipSessionWait = false,
}: OtpVerificationDialogProps) {
  const { verifyEmailOtp, sendEmailOtp } = useAuth();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const slots = useMemo(() => Array.from({ length }, (_, i) => i), [length]);

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

  useEffect(() => {
    if (open && cooldown === 0) setCooldown(RESEND_COOLDOWN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Wait until Supabase has actually stored the session before continuing.
  // After verifyOtp the SDK triggers onAuthStateChange asynchronously — if we
  // navigate too fast, the next page sees user=null and bounces back.
  const waitForSession = async (timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  const handleVerify = async () => {
    if (code.length !== length) {
      toast({ title: `أدخل الرمز كاملاً (${length} أرقام)`, variant: "destructive" });
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
    const { error } = onVerify
      ? await onVerify(code)
      : await verifyEmailOtp(email, code, type);
    if (error) {
      setVerifying(false);
      setAttempts((a) => a + 1);
      toast({ title: "فشل التحقق", description: error, variant: "destructive" });
      setCode("");
      return;
    }
    // Ensure the session is persisted before the parent navigates away (skip for reauth/email-change).
    const ok = skipSessionWait || onVerify ? true : await waitForSession();
    setVerifying(false);
    if (!ok) {
      toast({
        title: "تعذر إنشاء الجلسة",
        description: "حاول مرة أخرى أو اطلب رمزاً جديداً.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "تم التحقق بنجاح ✓" });
    onVerified();
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    const { error } = onSendOtp ? await onSendOtp() : await sendEmailOtp(email, false);
    setResending(false);
    if (error) {
      const friendly = /magic link|smtp|sending|email/i.test(error)
        ? "تعذر إرسال البريد. تحقق من إعدادات SMTP في الخادم أو حاول لاحقاً."
        : error;
      toast({ title: "فشل إعادة الإرسال", description: friendly, variant: "destructive" });
      return;
    }
    setCooldown(RESEND_COOLDOWN);
    setAttempts(0);
    setCode("");
    toast({ title: "تم إرسال رمز جديد إلى بريدك" });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="auth2026-otp-content max-w-md p-0 overflow-hidden"
        dir="rtl"
      >
        {/* Gradient header */}
        <div className="auth2026-otp-header relative px-6 pt-8 pb-6 text-center overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none"
               style={{ background: "radial-gradient(circle at 20% 20%, white 0%, transparent 50%), radial-gradient(circle at 80% 80%, white 0%, transparent 50%)" }} />
          <div className="relative">
            <div className="auth2026-otp-icon mx-auto h-16 w-16 rounded-2xl backdrop-blur-sm flex items-center justify-center mb-3 ring-1 ring-white/30">
              <MailCheck className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold mb-1">{title}</h2>
            <p className="text-sm text-white/90 leading-relaxed">
              {description ?? (
                <>
                  أرسلنا رمزاً مكوّناً من {length} أرقام إلى
                  <br />
                  <span className="font-semibold" dir="ltr">{email}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          <div className="flex justify-center" dir="ltr">
            <InputOTP maxLength={length} value={code} onChange={setCode} autoFocus>
              <InputOTPGroup className="gap-2">
                {slots.map((i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="auth2026-otp-slot h-14 w-12 text-2xl font-bold border-2 shadow-sm transition-all data-[active=true]:scale-105"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            الرمز صالح لمدة 5 دقائق
          </p>

          <Button
            onClick={handleVerify}
            disabled={verifying || code.length !== length}
            className="auth2026-primary-button w-full h-12 text-base font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-400 disabled:opacity-100"
            size="lg"
          >
            {verifying ? <Loader2 className="h-5 w-5 animate-spin" /> : "تأكيد الرمز"}
          </Button>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              className="auth2026-link text-sm hover:underline disabled:text-muted-foreground disabled:no-underline inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
              {cooldown > 0 ? `إعادة الإرسال (${cooldown}ث)` : "إعادة إرسال"}
            </button>

            {onChangeEmail && (
              <button
                type="button"
                onClick={onChangeEmail}
                className="auth2026-back-link text-sm font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <PencilLine className="h-3.5 w-3.5" />
                تغيير البريد
              </button>
            )}
          </div>

          {attempts > 0 && attempts < MAX_ATTEMPTS && (
            <p className="text-xs text-center text-destructive/80 font-medium">
              المحاولات المتبقية: {MAX_ATTEMPTS - attempts}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
