import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, CreditCard, Power, Phone, ChevronRight, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import PaymentLogo, { getMethodMeta } from "@/components/wallet/PaymentLogo";
import {
  loadPaymentMethodsConfig,
  savePaymentMethodsConfig,
  PaymentMethodsConfig,
  DEFAULT_PAYMENT_CONFIG,
} from "@/lib/paymentMethods";

const PaymentMethodsManagement = () => {
  const [config, setConfig] = useState<PaymentMethodsConfig>(DEFAULT_PAYMENT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    loadPaymentMethodsConfig().then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  const updateMethod = (key: string, patch: Partial<PaymentMethodsConfig["methods"][0]>) => {
    setConfig((prev) => ({
      ...prev,
      methods: prev.methods.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    }));
  };

  const persist = async (nextConfig?: PaymentMethodsConfig) => {
    setSaving(true);
    try {
      await savePaymentMethodsConfig(nextConfig || config);
      toast.success("تم حفظ التغييرات");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ============= FULL-PAGE EDITOR =============
  if (editingKey) {
    const method = config.methods.find((m) => m.key === editingKey)!;
    const meta = getMethodMeta(editingKey);

    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setEditingKey(null)}>
              <ArrowRight className="h-5 w-5 rtl:rotate-180" />
            </Button>
            <div className="flex-1">
              <p className="font-extrabold text-base">إعداد {meta.label}</p>
              <p className="text-[11px] text-muted-foreground">حدد رقم الاستلام وحالة التفعيل</p>
            </div>
            <PaymentLogo methodKey={editingKey} size="sm" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">
          {/* Hero preview */}
          <div
            className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${meta.bg}, ${meta.bg}dd)` }}
          >
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
            <div className="relative z-10 flex items-center gap-4">
              <PaymentLogo methodKey={editingKey} size="xl" rounded="3xl" className="ring-2 ring-white/30" />
              <div className="min-w-0">
                <p className="text-xs opacity-80">طريقة دفع</p>
                <p className="text-2xl font-extrabold">{meta.label}</p>
                <p className="text-xs opacity-80 mt-1">{method.enabled ? "مُفعّلة للطلاب" : "موقوفة حاليًا"}</p>
              </div>
            </div>
          </div>

          {/* Enable toggle */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${method.enabled ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                  {method.enabled ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-extrabold">حالة التفعيل</p>
                  <p className="text-[11px] text-muted-foreground">
                    {method.enabled ? "متاحة في صفحة الإيداع للطلاب" : "مخفية عن الطلاب"}
                  </p>
                </div>
              </div>
              <Switch
                checked={method.enabled}
                onCheckedChange={(v) => updateMethod(editingKey, { enabled: v })}
              />
            </CardContent>
          </Card>

          {/* Number input */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-2">
              <Label className="text-sm flex items-center gap-1 font-bold">
                <Phone className="h-4 w-4" /> رقم الاستلام
              </Label>
              <Input
                value={method.number}
                onChange={(e) => updateMethod(editingKey, { number: e.target.value.replace(/\s/g, "") })}
                placeholder={meta.key === "instapay" ? "اسم المستخدم أو الرقم" : "01XXXXXXXXX"}
                dir="ltr"
                className="font-extrabold text-center text-xl h-14"
              />
              <p className="text-[11px] text-muted-foreground text-center">
                يظهر هذا الرقم للطلاب عند اختيار {meta.label} للإيداع
              </p>
            </CardContent>
          </Card>

          <Button
            onClick={() => persist().then(() => setEditingKey(null))}
            disabled={saving}
            className="w-full h-14 gap-2 text-lg font-extrabold shadow-lg"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            حفظ والرجوع
          </Button>
        </div>
      </div>
    );
  }

  // ============= LIST VIEW =============
  return (
    <div className="space-y-4 max-w-3xl mx-auto" dir="rtl">
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 text-primary-foreground">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-5 w-5" />
            <h2 className="text-xl font-extrabold">طرق الدفع</h2>
          </div>
          <p className="text-sm opacity-90">
            تحكم في طرق الدفع المتاحة للطلاب. اضغط على أي محفظة لفتح صفحة التعديل الكاملة.
          </p>
        </div>
      </Card>

      {/* Master switch */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${config.all_enabled ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600" : "bg-red-100 dark:bg-red-950/40 text-red-600"}`}>
              <Power className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-bold">التشغيل العام لطرق الدفع</p>
              <p className="text-[11px] text-muted-foreground">
                {config.all_enabled ? "جميع الطرق المُفعّلة تعمل حاليًا" : "إيقاف شامل لجميع طرق الدفع"}
              </p>
            </div>
          </div>
          <Switch
            checked={config.all_enabled}
            onCheckedChange={(v) => {
              const next = { ...config, all_enabled: v };
              setConfig(next);
              persist(next);
            }}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {config.methods.map((m) => {
          const meta = getMethodMeta(m.key);
          return (
            <button
              key={m.key}
              onClick={() => setEditingKey(m.key)}
              className="w-full text-right flex items-center gap-4 p-4 rounded-2xl bg-card border-2 border-border hover:border-primary/60 hover:shadow-md transition-all active:scale-[0.99]"
            >
              <PaymentLogo methodKey={m.key} size="lg" rounded="2xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-base">{meta.label}</p>
                  {m.enabled ? (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">مُفعّلة</span>
                  ) : (
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">موقوفة</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate" dir="ltr">
                  {m.number || "— لم يُحدد رقم بعد —"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PaymentMethodsManagement;
