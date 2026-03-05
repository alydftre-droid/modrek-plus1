import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Loader2, CreditCard, Save, Phone } from "lucide-react";

interface PaymentNumber {
  id: string;
  label: string;
  number: string;
}

const PaymentSettingsEditor = () => {
  const [numbers, setNumbers] = useState<PaymentNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["payment_receive_number", "payment_methods_config", "subscription_default_price"]);

      const settingsMap: Record<string, string> = {};
      (data || []).forEach(d => { if (d.value) settingsMap[d.key] = d.value; });

      // Parse payment methods config (JSON array)
      try {
        const config = JSON.parse(settingsMap.payment_methods_config || "[]");
        setNumbers(config);
      } catch {
        // Fallback: use single number
        if (settingsMap.payment_receive_number) {
          setNumbers([{ id: "1", label: "فودافون كاش", number: settingsMap.payment_receive_number }]);
        }
      }

      setDefaultPrice(settingsMap.subscription_default_price || "50");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Save payment methods config
      const configJson = JSON.stringify(numbers);
      
      // Upsert payment_methods_config
      await supabase.from("platform_settings").upsert(
        { key: "payment_methods_config", value: configJson, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

      // Update main receive number (first number)
      if (numbers.length > 0) {
        await supabase.from("platform_settings").upsert(
          { key: "payment_receive_number", value: numbers[0].number, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }

      // Save default price
      await supabase.from("platform_settings").upsert(
        { key: "subscription_default_price", value: defaultPrice, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

      toast.success("تم حفظ إعدادات الدفع بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("خطأ في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const addNumber = () => {
    if (!newLabel.trim() || !newNumber.trim()) {
      toast.error("يرجى إدخال الاسم والرقم");
      return;
    }
    setNumbers(prev => [...prev, { id: Date.now().toString(), label: newLabel.trim(), number: newNumber.trim() }]);
    setNewLabel("");
    setNewNumber("");
    setShowAdd(false);
  };

  const removeNumber = (id: string) => {
    setNumbers(prev => prev.filter(n => n.id !== id));
  };

  const updateNumber = (id: string, field: "label" | "number", value: string) => {
    setNumbers(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            إعدادات الدفع وأرقام التحويل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Default Price */}
          <div>
            <Label className="font-bold">سعر الكورس الافتراضي (جنيه)</Label>
            <Input
              type="number"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              className="max-w-xs mt-1"
              min={0}
            />
          </div>

          {/* Payment Numbers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="font-bold">أرقام الدفع</Label>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                إضافة رقم
              </Button>
            </div>

            {numbers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">لا توجد أرقام دفع. أضف رقمًا جديدًا.</p>
            ) : (
              <div className="space-y-3">
                {numbers.map((num) => (
                  <div key={num.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <Phone className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        value={num.label}
                        onChange={(e) => updateNumber(num.id, "label", e.target.value)}
                        placeholder="اسم المحفظة"
                        className="text-sm"
                      />
                      <Input
                        value={num.number}
                        onChange={(e) => updateNumber(num.id, "number", e.target.value)}
                        placeholder="رقم التحويل"
                        className="text-sm"
                        dir="ltr"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeNumber(num.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <Button onClick={saveAll} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>

      {/* Add Number Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة رقم دفع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>اسم المحفظة</Label><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="مثل: فودافون كاش" /></div>
            <div><Label>رقم التحويل</Label><Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="01XXXXXXXXX" dir="ltr" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={addNumber}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaymentSettingsEditor;
