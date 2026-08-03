import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StudentLayout from "@/components/student/StudentLayout";
import PaymentLogo, { PaymentMethodKey, getMethodMeta } from "@/components/wallet/PaymentLogo";
import { loadPaymentMethodsConfig, PaymentMethodsConfig } from "@/lib/paymentMethods";
import {
  Copy, Upload, X, Loader2, CheckCircle, Clock, AlertTriangle, Play,
  ChevronRight, ArrowRight, CreditCard,
} from "lucide-react";

const MIN_AMOUNT = 50;
const MAX_AMOUNT = 20000;

const DepositPage = () => {
  const navigate = useNavigate();
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
    loadPaymentMethodsConfig().then(setConfig);
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "deposit_tutorial_video")
      .maybeSingle()
      .then(({ data }: any) => setTutorialVideoUrl(data?.value || null));
  }, []);

  const availableMethods = useMemo(() => {
    if (!config) return [];
    if (!config.all_enabled) return [];
    return config.methods.filter((m) => m.enabled && m.number?.trim());
  }, [config]);

  const selectedMethod = selectedKey ? config?.methods.find((m) => m.key === selectedKey) : null;
  const selectedMeta = selectedKey ? getMethodMeta(selectedKey) : null;

  const handleSelectMethod = (key: PaymentMethodKey) => {
    setSelectedKey(key);
    setStep("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (step === "form") {
      setStep("pick");
      setSelectedKey(null);
    } else {
      navigate("/wallet");
    }
  };

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
    if (file.size > 20 * 1024 * 1024) { toast.error("الحجم الأقصى 20 ميجابايت"); return; }
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
    if (amountNum < MIN_AMOUNT) return toast.error(`الحد الأدنى ${MIN_AMOUNT} جنيه`);
    if (amountNum > MAX_AMOUNT) return toast.error(`الحد الأقصى ${MAX_AMOUNT.toLocaleString("ar-EG")} جنيه`);
    if (!phoneNumber || phoneNumber.length !== 11) return toast.error("أدخل رقم هاتف صحيح (11 رقم)");
    if (!selectedFile) return toast.error("ارفع صورة التحويل");

    setSubmitting(true);
    try {
      const fileExt = (selectedFile.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp", "pdf"].includes(fileExt) ? fileExt : "jpg";
      const fileName = `${user.id}/${Date.now()}.${safeExt}`;
      const contentType = selectedFile.type || (safeExt === "pdf" ? "application/pdf" : `image/${safeExt}`);
      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(fileName, selectedFile, { upsert: true, contentType, cacheControl: "3600" });
      if (uploadError) {
        console.error("[deposit] upload error:", uploadError);
        throw new Error(uploadError.message || "تعذر رفع صورة التحويل");
      }
      const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);

      const { error: dbError } = await supabase.from("deposit_requests").insert({
        student_id: user.id,
        amount: amountNum,
        phone_number: phoneNumber,
        receipt_url: urlData.publicUrl,
        payment_method: selectedKey,
        status: "pending",
      });
      if (dbError) {
        console.error("[deposit] insert error:", dbError);
        throw new Error(dbError.message || "تعذر حفظ طلب الإيداع");
      }

      setSubmitted(true);
      toast.success("تم تقديم الطلب");
      setTimeout(() => navigate("/wallet"), 2500);
    } catch (error: any) {
      console.error("[deposit] failed:", error);
      toast.error(error?.message || "خطأ في تقديم الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <StudentLayout title="تم الإرسال">
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <CheckCircle className="h-12 w-12 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-extrabold mb-2">تم تقديم طلب الإيداع</h2>
          <p className="text-muted-foreground mb-4">سيتم مراجعة طلبك وإضافة الرصيد خلال دقائق</p>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-amber-700">
            <Clock className="h-4 w-4" /><span className="text-sm font-bold">قيد المراجعة</span>
          </div>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title={step === "pick" ? "اختر طريقة الدفع" : selectedMeta?.label || "تعبئة الرصيد"}>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        {/* Top header bar */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
              <ArrowRight className="h-5 w-5 rtl:rotate-180" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-base truncate">
                {step === "pick" ? "طرق الدفع المتاحة" : `الدفع عبر ${selectedMeta?.label}`}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {step === "pick" ? "اختر المحفظة التي ستحول منها" : "أكمل بيانات التحويل ثم اضغط تأكيد"}
              </p>
            </div>
            <CreditCard className="h-5 w-5 text-primary shrink-0" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5 pb-24">
          {/* STEP 1: PICK */}
          {step === "pick" && (
            <>
              {!config ? (
                <div className="flex justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
              ) : availableMethods.length === 0 ? (
                <div className="space-y-6">
                  <div className="text-center py-14 space-y-3">
                    <div className="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="h-10 w-10 text-amber-600" />
                    </div>
                    <p className="font-extrabold text-lg">طرق الدفع متوقفة مؤقتًا</p>
                    <p className="text-sm text-muted-foreground">يرجى المحاولة لاحقًا أو التواصل مع الدعم</p>
                  </div>
                  <DepositSupportCard />
                </div>
              ) : (
                <div className="space-y-3">
                  {availableMethods.map((m) => {
                    const meta = getMethodMeta(m.key);
                    return (
                      <button
                        key={m.key}
                        onClick={() => handleSelectMethod(m.key as PaymentMethodKey)}
                        className="group w-full flex items-center gap-4 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary/60 hover:shadow-md transition-all active:scale-[0.98]"
                      >
                        <PaymentLogo methodKey={m.key} size="lg" rounded="2xl" />
                        <div className="flex-1 text-right min-w-0">
                          <p className="font-extrabold text-base">{meta.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="ltr">{m.number}</p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180 group-hover:text-primary" />
                      </button>
                    );
                  })}
                  <DepositSupportCard />
                </div>
              )}
            </>
          )}

          {/* STEP 2: FORM */}
          {step === "form" && selectedMethod && selectedMeta && (
            <div className="space-y-4">
              {/* Selected card */}
              <div className="rounded-2xl p-4 flex items-center gap-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${selectedMeta.bg}, ${selectedMeta.bg}dd)` }}>
                <PaymentLogo methodKey={selectedMethod.key} size="lg" rounded="2xl" className="ring-2 ring-white/40" />
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-xs opacity-90">سيتم الإيداع عبر</p>
                  <p className="font-extrabold text-lg">{selectedMeta.label}</p>
                </div>
              </div>

              {/* Receive number */}
              <div className="bg-card rounded-2xl border p-4">
                <Label className="text-xs font-bold text-muted-foreground">رقم الاستلام</Label>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-muted rounded-xl p-3 text-center">
                    <span className="text-2xl font-extrabold tracking-wider" dir="ltr">{selectedMethod.number}</span>
                  </div>
                  <Button variant="outline" size="icon" onClick={copyNumber} className="shrink-0 h-12 w-12">
                    {copied ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : <Copy className="h-5 w-5" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  حوّل المبلغ إلى الرقم أعلاه ثم أكمل البيانات بالأسفل
                </p>
              </div>

              {tutorialVideoUrl && (
                <>
                  <Button variant="outline" className="w-full gap-2 text-primary border-primary/30 h-11" onClick={() => setShowVideo(!showVideo)}>
                    <Play className="h-4 w-4" /> شاهد فيديو شرح الإيداع
                  </Button>
                  {showVideo && (
                    <div className="rounded-2xl overflow-hidden border aspect-video">
                      <iframe src={tutorialVideoUrl} className="w-full h-full" allowFullScreen allow="autoplay; encrypted-media" />
                    </div>
                  )}
                </>
              )}

              <div className="bg-card rounded-2xl border p-4 space-y-4">
                <div>
                  <Label className="text-sm font-bold">المبلغ المحول</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00" className="text-xl font-extrabold text-center mt-2 h-12"
                    min={MIN_AMOUNT} max={MAX_AMOUNT} />
                  <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                    من {MIN_AMOUNT} حتى {MAX_AMOUNT.toLocaleString("ar-EG")} جنيه
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-bold">رقم الهاتف الذي أرسلت منه</Label>
                  <Input value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="01XXXXXXXXX" className="text-center mt-2 h-12 text-lg font-bold" maxLength={11} />
                </div>

                <div>
                  <Label className="text-sm font-bold">صورة التحويل</Label>
                  {selectedFile ? (
                    <div className="mt-2 p-3 rounded-xl border bg-emerald-50 border-emerald-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                        <span className="text-sm text-emerald-800 truncate">{selectedFile.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={removeFile}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div onClick={() => fileInputRef.current?.click()}
                      className="mt-2 p-6 rounded-xl border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:border-primary/50 transition-colors text-center">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-bold">اضغط لرفع الصورة</p>
                      <p className="text-xs text-muted-foreground">PDF, JPG, PNG — حتى 20MB</p>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                </div>
              </div>

              <Button type="button" onClick={handleSubmit} disabled={submitting}
                className="w-full h-14 border border-primary bg-primary text-lg font-extrabold text-primary-foreground shadow-mudrik hover:bg-primary/90 disabled:bg-primary/70 disabled:text-primary-foreground disabled:opacity-100">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : null}
                تقديم طلب الإيداع
              </Button>
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
};

export default DepositPage;
