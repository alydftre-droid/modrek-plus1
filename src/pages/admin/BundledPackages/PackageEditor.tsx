import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Sparkles, Save, Send, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  displayBundleGrade, displayBundleSection, displayBundleStage, hexToRgba,
  normalizeBundleGrade, normalizeBundleSection, normalizeBundleStage,
} from "@/lib/bundledPackages";
import { getCategoryDef, fetchCategoryMinPrice } from "@/lib/studentCategories";

const COLOR_PRESETS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444", "#06b6d4", "#14b8a6"];

export default function PackageEditor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { packageId } = useParams();
  const isEdit = !!packageId;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#10b981");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxSubscriptions, setMaxSubscriptions] = useState<string>("");
  const [discount, setDiscount] = useState(20);
  const [discountType, setDiscountType] = useState<"percentage" | "amount">("percentage");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [scheduleAt, setScheduleAt] = useState("");

  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [ctxStage, setCtxStage] = useState("");
  const [ctxGrade, setCtxGrade] = useState("");
  const [ctxSection, setCtxSection] = useState("");
  const [ctxEdu, setCtxEdu] = useState("");
  const [categoryPrices, setCategoryPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const urlCtx = useMemo(() => ({
    eduType: params.get("eduType") || "",
    stage: params.get("stage") || "",
    grade: params.get("grade") || "",
    section: params.get("section") || "",
    categories: (params.get("categories") || "").split(",").filter(Boolean),
  }), [params]);

  useEffect(() => {
    (async () => {
      let keys = urlCtx.categories;
      let edu = urlCtx.eduType, stg = urlCtx.stage, grd = urlCtx.grade, sec = urlCtx.section;

      if (isEdit && packageId) {
        const { data: pkg } = await supabase.from("bundled_packages" as any).select("*").eq("id", packageId).maybeSingle() as any;
        if (pkg) {
          setName(pkg.name || ""); setDescription(pkg.description || "");
          setColor(pkg.color || "#10b981");
          setExpiresAt(pkg.expires_at ? pkg.expires_at.slice(0, 16) : "");
          setMaxSubscriptions(pkg.max_subscriptions?.toString() || "");
          setDiscount(Number(pkg.discount_percentage) || 0);
          setDiscountType((pkg.discount_type as any) || "percentage");
          setDiscountAmount(pkg.discount_amount != null ? String(pkg.discount_amount) : "");
          keys = pkg.category_keys || [];
          edu = pkg.education_type; stg = pkg.stage; grd = pkg.grade; sec = pkg.section || "";
        }
      }
      setCategoryKeys(keys); setCtxEdu(edu); setCtxStage(stg); setCtxGrade(grd); setCtxSection(sec);

      const prices: Record<string, number> = {};
      await Promise.all(keys.map(async (k) => {
        prices[k] = await fetchCategoryMinPrice(supabase, k, { stage: stg, grade: grd, section: sec });
      }));
      setCategoryPrices(prices);
      setLoading(false);
    })();
  }, [packageId]);

  const totalOriginal = categoryKeys.reduce((s, k) => s + (categoryPrices[k] || 0), 0);
  const discAmountNum = Number(discountAmount) || 0;
  const finalPrice = discountType === "amount"
    ? Math.max(totalOriginal - discAmountNum, 0)
    : Math.round(totalOriginal * (1 - discount / 100) * 100) / 100;
  const savedAmount = Math.max(totalOriginal - finalPrice, 0);

  const save = async (publish: boolean, schedule = false) => {
    if (!user) return;
    if (categoryKeys.length < 2) { toast.error("اختر فئتين على الأقل"); return; }
    if (discountType === "amount" && (!discAmountNum || discAmountNum <= 0)) {
      toast.error("أدخل مبلغ خصم صحيح"); return;
    }
    if (discountType === "percentage" && (discount <= 0 || discount > 100)) {
      toast.error("أدخل نسبة خصم صحيحة"); return;
    }
    setSaving(true);
    const status = schedule ? "scheduled" : publish ? "active" : "draft";
    const payload: any = {
      created_by: user.id,
      name: name || null, description: description || null,
      color,
      education_type: ctxEdu,
      stage: normalizeBundleStage(ctxStage),
      grade: normalizeBundleGrade(ctxGrade),
      section: ctxSection ? normalizeBundleSection(ctxSection) : null,
      discount_type: discountType,
      discount_percentage: discountType === "percentage" ? discount : 0,
      discount_amount: discountType === "amount" ? discAmountNum : null,
      manual_final_price: null,
      category_keys: categoryKeys,
      status,
      publish_at: schedule && scheduleAt ? new Date(scheduleAt).toISOString() : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      max_subscriptions: maxSubscriptions ? Number(maxSubscriptions) : null,
    };
    try {
      if (isEdit) {
        const { error } = await supabase.from("bundled_packages" as any).update(payload).eq("id", packageId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bundled_packages" as any).insert(payload);
        if (error) throw error;
      }
      toast.success(isEdit ? "تم تحديث الباقة" : "تم إنشاء الباقة بنجاح");
      navigate("/admin/bundled-packages/manage");
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 pb-32" dir="rtl">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border/70">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <h1 className="text-lg font-bold">{isEdit ? "تعديل الباقة" : "إنشاء باقة جديدة"}</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <Card className="p-5 border-border/70 bg-card/95 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{ctxEdu}</div>
            <div className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{displayBundleStage(ctxStage)}</div>
            <div className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{displayBundleGrade(ctxGrade)}</div>
            {ctxSection && <div className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold">{displayBundleSection(ctxSection)}</div>}
          </div>
        </Card>

        <Card className="p-5 space-y-4 border-border/70 bg-card/95 shadow-md">
          <h2 className="font-bold">بيانات الباقة</h2>
          <div className="space-y-3">
            <div><Label>اسم الباقة (اختياري)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: باقة العربية والشرعية" /></div>
            <div><Label>الوصف (اختياري)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div>
              <Label>لون الباقة</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {COLOR_PRESETS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> تاريخ الانتهاء</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
              <div>
                <Label>الحد الأقصى للاشتراكات</Label>
                <Input type="number" min="1" value={maxSubscriptions} onChange={(e) => setMaxSubscriptions(e.target.value)} placeholder="مثلاً 100" />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 space-y-3 border-border/70 bg-card/95 shadow-md">
          <h2 className="font-bold">الفئات المختارة ({categoryKeys.length})</h2>
          <div className="flex flex-wrap gap-2">
            {categoryKeys.map((k) => {
              const def = getCategoryDef(k);
              if (!def) return null;
              return (
                <Badge key={k} variant="secondary" className="text-sm py-1.5 px-3">
                  {def.emoji} {def.name}
                  <span className="opacity-60 mx-1">·</span>
                  من {categoryPrices[k] || 0} ج
                </Badge>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">السعر معروض كمؤشر فقط من أقل مجموعة. السعر النهائي للطالب يُحسب لحظيًا حسب المجموعات التي يختارها.</p>
        </Card>

        <Card className="p-5 space-y-4 border-border/70 bg-card/95 shadow-md">
          <h2 className="font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> الخصم عند الاشتراك في الباقة</h2>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDiscountType("percentage")}
              className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${
                discountType === "percentage" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
              }`}>نسبة مئوية %</button>
            <button type="button" onClick={() => setDiscountType("amount")}
              className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${
                discountType === "amount" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
              }`}>مبلغ ثابت (ج)</button>
          </div>

          {discountType === "percentage" ? (
            <div className="space-y-2">
              <Label>نسبة الخصم %</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value || 0))}
                placeholder="مثلاً 20"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>مبلغ الخصم بالجنيه</Label>
              <Input type="number" min="1" value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)} placeholder="مثلاً 100" />
            </div>
          )}

          <div className="rounded-2xl p-4 border-2 border-dashed space-y-2"
               style={{ borderColor: hexToRgba(color, 0.45), backgroundColor: hexToRgba(color, 0.08) }}>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>تقدير السعر الأصلي (أقل المجموعات)</span>
              <span className="line-through">{totalOriginal} جنيه</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>تقدير السعر بعد الخصم</span>
              <span style={{ color }}>{finalPrice} جنيه</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>توفير الطالب</span>
              <Badge className="border-0" style={{ backgroundColor: hexToRgba(color, 0.18), color }}>{savedAmount} ج</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">السعر النهائي يُحسب لحظيًا للطالب من المجموعات التي يختارها فعلًا.</p>
          </div>
        </Card>

        <Card className="p-5 space-y-3 border-border/70 bg-card/95 shadow-md">
          <h2 className="font-bold">جدولة النشر (اختياري)</h2>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </Card>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/70 p-4 z-40">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-2">
          <Button variant="outline" disabled={saving} onClick={() => save(false)}>
            <Save className="h-4 w-4 ml-1" /> مسودة
          </Button>
          <Button variant="secondary" disabled={saving || !scheduleAt} onClick={() => save(false, true)}>
            <Calendar className="h-4 w-4 ml-1" /> جدولة
          </Button>
          <Button disabled={saving} onClick={() => save(true)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 ml-1" /> نشر</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
