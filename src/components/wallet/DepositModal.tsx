import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Upload, X, Loader2, CheckCircle, Clock, AlertTriangle, Play, ChevronRight, Wallet } from "lucide-react";
import PaymentLogo, { PAYMENT_METHODS, PaymentMethodKey, getMethodMeta } from "@/components/wallet/PaymentLogo";
import { loadPaymentMethodsConfig, PaymentMethodsConfig } from "@/lib/paymentMethods";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 20000;

const DepositModal = ({ open, onOpenChange, onSuccess }: DepositModalProps) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<PaymentMethodsConfig | null>(null);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [selectedKey, setSelectedKey] = useState<PaymentMethodKey | null>(null);
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setSelectedKey(null);
    setSubmitted(false);
    setAmount("");
    setPhoneNumber("");
    setSelectedFile(null);
    loadPaymentMethodsConfig().then(setConfig);
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "deposit_tutorial_video")
      .maybeSingle()
      .then(({ data }: any) => setTutorialVideoUrl(data?.value || null));
  }, [open]);

  const availableMethods = useMemo(() => {
    if (!config) return [];
    if (!config.all_enabled) return [];
    return config.methods.filter((m) => m.enabled && m.number?.trim());
  }, [config]);

  const selectedMethod = selectedKey ? config?.methods.find((m) => m.key === selectedKey) : null;
  const selectedMeta = selectedKey ? getMethodMeta(selectedKey) : null;

  const copyNumber = () => {
    if (!selectedMethod?.number) return;
    navigator.clipboard.writeText(selectedMethod.number);
    setCopied(true);
    toast.success("تم نسخ الرقم");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("الحجم الأقصى للملف 20 ميجابايت");
      return;
    }
    setSelectedFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return toast.error("يجب تسجيل الدخول لتقديم طلب الإيداع");
    if (!selectedKey || !selectedMethod) return toast.error("اختر طريقة الدفع أولاً");

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum)) return toast.error("يرجى إدخال المبلغ");
    if (amountNum < MIN_AMOUNT) return toast.error(`الحد الأدنى للإيداع ${MIN_AMOUNT} جنيه`);
    if (amountNum > MAX_AMOUNT) return toast.error(`الحد الأقصى للإيداع ${MAX_AMOUNT.toLocaleString("ar-EG")} جنيه`);
    if (!phoneNumber || phoneNumber.length !== 11) return toast.error("يرجى إدخال رقم هاتف صحيح (11 رقم)");
    if (!selectedFile) return toast.error("يرجى رفع صورة التحويل");

    setSubmitting(true);
    try {
      const fileExt = (selectedFile.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp", "pdf"].includes(fileExt) ? fileExt : "jpg";
      const { uploadFile: uploadToBunny } = await import("@/lib/storage");
      const stored = await uploadToBunny({
        scope: { kind: "user", id: user.id },
        category: "receipts",
        file: selectedFile,
        fileName: `${Date.now()}.${safeExt}`,
      });

      const { error: dbError } = await supabase.from("deposit_requests").insert({
        student_id: user.id,
        amount: amountNum,
        phone_number: phoneNumber,
        receipt_url: stored.url,
        payment_method: selectedKey,
        status: "pending",
      });
      if (dbError) {
        console.error("[deposit-modal] insert error:", dbError);
        throw new Error(dbError.message || "تعذر حفظ طلب الإيداع");
      }

      setSubmitted(true);
      toast.success("تم تقديم طلب الإيداع بنجاح");
      onSuccess?.();
      setTimeout(() => onOpenChange(false), 3000);
    } catch (error: any) {
      console.error("Deposit error:", error);
      toast.error(error?.message || "خطأ في تقديم الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">تم تقديم طلب الإيداع</h3>
            <p className="text-muted-foreground">سيتم مراجعة طلبك وإضافة الرصيد خلال دقائق</p>
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 text-amber-700 justify-center">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">الطلب قيد المراجعة</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="text-center text-xl flex items-center justify-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {step === "pick" ? "اختر طريقة الدفع" : "تعبئة الرصيد"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: METHOD PICKER */}
        {step === "pick" && (
          <div className="p-5 pt-2 space-y-3">
            {!config ? (
              <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : availableMethods.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
                <p className="font-bold">طرق الدفع متوقفة مؤقتًا</p>
                <p className="text-sm text-muted-foreground">يرجى المحاولة لاحقًا أو التواصل مع الدعم</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-center text-muted-foreground">
                  اضغط على المحفظة التي ستحول منها لإكمال عملية الدفع
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {availableMethods.map((m) => {
                    const meta = getMethodMeta(m.key);
                    return (
                      <button
                        key={m.key}
                        onClick={() => { setSelectedKey(m.key); setStep("form"); }}
                        className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-border bg-card hover:border-primary hover:shadow-md transition-all active:scale-95"
                      >
                        <PaymentLogo methodKey={m.key} size="lg" rounded="2xl" />
                        <span className="text-sm font-bold">{meta.label}</span>
                        <ChevronRight className="absolute top-2 left-2 h-4 w-4 text-muted-foreground rtl:rotate-180 group-hover:text-primary" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 2: FORM */}
        {step === "form" && selectedMethod && selectedMeta && (
          <div className="px-5 pb-5 space-y-4">
            {/* Selected method header */}
            <button
              onClick={() => setStep("pick")}
              className="w-full flex items-center gap-3 p-3 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <PaymentLogo methodKey={selectedMethod.key} size="md" />
              <div className="flex-1 text-right">
                <p className="font-bold text-sm">{selectedMeta.label}</p>
                <p className="text-[11px] text-muted-foreground">اضغط للتغيير</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            </button>

            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-center">
              <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                قم بتحويل المبلغ إلى الرقم التالي ثم أرفق صورة التحويل
              </p>
            </div>

            {/* Tutorial video */}
            {tutorialVideoUrl && (
              <>
                <Button
                  variant="outline"
                  className="w-full gap-2 text-primary border-primary/30"
                  onClick={() => setShowVideo(!showVideo)}
                >
                  <Play className="h-4 w-4" />
                  شاهد فيديو شرح الإيداع
                </Button>
                {showVideo && (
                  <div className="rounded-lg overflow-hidden border aspect-video">
                    <iframe src={tutorialVideoUrl} className="w-full h-full" allowFullScreen allow="autoplay; encrypted-media" />
                  </div>
                )}
              </>
            )}

            {/* Receive number */}
            <div>
              <Label className="text-sm font-bold">رقم الاستلام ({selectedMeta.label})</Label>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-muted rounded-lg p-3 text-center">
                  <span className="text-2xl font-bold tracking-wider" dir="ltr">{selectedMethod.number}</span>
                </div>
                <Button variant="outline" size="icon" onClick={copyNumber} className="shrink-0">
                  {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <Label className="text-sm font-bold">المبلغ المحول</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="text-lg font-bold text-center mt-1"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
              />
              <p className="text-xs text-muted-foreground mt-1">
                الحد الأدنى: {MIN_AMOUNT} جنيه / الحد الأقصى: {MAX_AMOUNT.toLocaleString("ar-EG")} جنيه
              </p>
              {amount && parseFloat(amount) < MIN_AMOUNT && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> المبلغ أقل من الحد الأدنى
                </p>
              )}
            </div>

            {/* Phone number */}
            <div>
              <Label className="text-sm font-bold">رقم الهاتف الذي أرسلت منه</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="01XXXXXXXXX"
                className="text-center mt-1"
                maxLength={11}
              />
              <p className="text-xs text-muted-foreground mt-1 text-left" dir="ltr">{phoneNumber.length}/11</p>
            </div>

            {/* Upload */}
            <div>
              <Label className="text-sm font-bold">صورة التحويل الناجح</Label>
              {selectedFile ? (
                <div className="mt-1 p-3 rounded-lg border bg-green-50 border-green-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-sm text-green-800 truncate">{selectedFile.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={removeFile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 transition-colors text-center"
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">تحميل الملف</p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG</p>
                  <p className="text-xs text-muted-foreground">الحجم الأقصى: 20 ميجابايت</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Submit */}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-12 border border-primary bg-primary text-lg font-bold text-primary-foreground shadow-mudrik hover:bg-primary/90 disabled:bg-primary/70 disabled:text-primary-foreground disabled:opacity-100"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : null}
              تقديم طلب الإيداع
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DepositModal;
