import { useState, useEffect, useRef } from "react";
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
import { Copy, Upload, X, Loader2, CheckCircle, Clock, AlertTriangle, Play } from "lucide-react";
import paymentMethodsImg from "@/assets/payment-methods.png";

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const DEFAULT_RECEIVE_NUMBER = "01030796769";
const MIN_AMOUNT = 50;
const MAX_AMOUNT = 20000;

const DepositModal = ({ open, onOpenChange, onSuccess }: DepositModalProps) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [receiveNumber, setReceiveNumber] = useState(DEFAULT_RECEIVE_NUMBER);
  const [tutorialVideoUrl, setTutorialVideoUrl] = useState<string | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setAmount("");
      setPhoneNumber("");
      setSelectedFile(null);

      // Fetch payment number and tutorial video from settings
      supabase.from("platform_settings").select("key, value")
        .in("key", ["payment_receive_number", "deposit_tutorial_video"])
        .then(({ data }) => {
          if (data) {
            data.forEach(item => {
              if (item.key === "payment_receive_number" && item.value) setReceiveNumber(item.value);
              if (item.key === "deposit_tutorial_video" && item.value) setTutorialVideoUrl(item.value);
            });
          }
        });
    }
  }, [open]);

  const copyNumber = () => {
    navigator.clipboard.writeText(receiveNumber);
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
    if (!user) return;

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum)) {
      toast.error("يرجى إدخال المبلغ");
      return;
    }
    if (amountNum < MIN_AMOUNT) {
      toast.error(`الحد الأدنى للإيداع ${MIN_AMOUNT} جنيه`);
      return;
    }
    if (amountNum > MAX_AMOUNT) {
      toast.error(`الحد الأقصى للإيداع ${MAX_AMOUNT.toLocaleString("ar-EG")} جنيه`);
      return;
    }
    if (!phoneNumber || phoneNumber.length !== 11) {
      toast.error("يرجى إدخال رقم هاتف صحيح (11 رقم)");
      return;
    }
    if (!selectedFile) {
      toast.error("يرجى رفع صورة التحويل");
      return;
    }

    setSubmitting(true);
    try {
      // Upload receipt
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(fileName, selectedFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);

      // Create deposit request
      const { error: dbError } = await supabase.from("deposit_requests").insert({
        student_id: user.id,
        amount: amountNum,
        phone_number: phoneNumber,
        receipt_url: urlData.publicUrl,
        payment_method: "wallet",
        status: "pending",
      });

      if (dbError) throw dbError;

      setSubmitted(true);
      toast.success("تم تقديم طلب الإيداع بنجاح");
      onSuccess?.();

      setTimeout(() => {
        onOpenChange(false);
      }, 3000);
    } catch (error: any) {
      console.error("Deposit error:", error);
      toast.error(error.message || "خطأ في تقديم الطلب");
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
              <div className="flex items-center gap-2 text-amber-700">
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">تعبئة الرصيد</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Payment Methods Logos */}
          <div className="rounded-lg overflow-hidden border">
            <img src={paymentMethodsImg} alt="طرق الدفع المتاحة" className="w-full h-auto object-contain" />
          </div>

          {/* Instructions Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-sm text-blue-800 font-medium">
              قبل تقديم الطلب، يرجى تحويل الأموال باستخدام بيانات الدفع المحددة أدناه.
            </p>
          </div>

          {/* Tutorial Video Button */}
          {tutorialVideoUrl && (
            <Button
              variant="outline"
              className="w-full gap-2 text-primary border-primary/30"
              onClick={() => setShowVideo(!showVideo)}
            >
              <Play className="h-4 w-4" />
              شاهد فيديو شرح الإيداع
            </Button>
          )}
          {showVideo && tutorialVideoUrl && (
            <div className="rounded-lg overflow-hidden border aspect-video">
              <iframe
                src={tutorialVideoUrl}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
              />
            </div>
          )}

          {/* Receive Number */}
          <div>
            <Label className="text-sm font-bold">رقم الاستلام</Label>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-muted rounded-lg p-3 text-center">
                <span className="text-2xl font-bold tracking-wider">{receiveNumber}</span>
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
                <AlertTriangle className="h-3 w-3" />
                المبلغ أقل من الحد الأدنى
              </p>
            )}
          </div>

          {/* Phone Number */}
          <div>
            <Label className="text-sm font-bold">رقم الهاتف الذي أرسلت منه</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 11);
                setPhoneNumber(val);
              }}
              placeholder="01XXXXXXXXX"
              className="text-center mt-1"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground mt-1 text-left" dir="ltr">
              {phoneNumber.length}/11
            </p>
          </div>

          {/* File Upload */}
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

          {/* Submit Button */}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-12 text-lg font-bold bg-green-600 hover:bg-green-700"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin ml-2" />
            ) : null}
            تأكيد الدفع
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DepositModal;
