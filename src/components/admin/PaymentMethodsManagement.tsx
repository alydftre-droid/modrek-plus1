import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, CreditCard, Power, Phone } from "lucide-react";
import PaymentLogo, { PAYMENT_METHODS, getMethodMeta } from "@/components/wallet/PaymentLogo";
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePaymentMethodsConfig(config);
      toast.success("تم حفظ طرق الدفع بنجاح");
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

  return (
    <div className="space-y-4 max-w-3xl mx-auto" dir="rtl">
      {/* Header */}
      <Card className="overflow-hidden border-0 shadow-md">
        <div className="bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 text-primary-foreground">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-5 w-5" />
            <h2 className="text-xl font-extrabold">طرق الدفع</h2>
          </div>
          <p className="text-sm opacity-90">
            تحكم في طرق الدفع المتاحة للطلاب — قم بإضافة الرقم وتفعيل أو إيقاف كل طريقة على حدة
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
            onCheckedChange={(v) => setConfig((prev) => ({ ...prev, all_enabled: v }))}
          />
        </CardContent>
      </Card>

      {/* Each method */}
      <div className="space-y-3">
        {config.methods.map((m) => {
          const meta = getMethodMeta(m.key);
          return (
            <Card key={m.key} className="border-0 shadow-sm overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PaymentLogo methodKey={m.key} size="md" />
                    <div className="min-w-0">
                      <p className="font-bold text-base">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {m.enabled && m.number
                          ? "متاحة للطلاب"
                          : m.enabled && !m.number
                          ? "أضف رقم الاستلام لتفعيلها"
                          : "موقوفة"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={m.enabled}
                    onCheckedChange={(v) => updateMethod(m.key, { enabled: v })}
                  />
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-1 mb-1">
                    <Phone className="h-3 w-3" /> رقم الاستلام
                  </Label>
                  <Input
                    value={m.number}
                    onChange={(e) =>
                      updateMethod(m.key, { number: e.target.value.replace(/\s/g, "") })
                    }
                    placeholder={meta.key === "instapay" ? "اسم المستخدم أو الرقم" : "01XXXXXXXXX"}
                    dir="ltr"
                    className="font-bold text-center text-lg"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-12 gap-2 sticky bottom-2 shadow-lg"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        حفظ كل التغييرات
      </Button>
    </div>
  );
};

export default PaymentMethodsManagement;
