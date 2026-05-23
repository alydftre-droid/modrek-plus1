import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Sparkles, Save, Send, Calendar, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const COLOR_PRESETS = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444", "#06b6d4", "#14b8a6"];

export default function PackageEditor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { packageId } = useParams();
  const isEdit = !!packageId;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [color, setColor] = useState("#10b981");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxSubscriptions, setMaxSubscriptions] = useState<string>("");
  const [discountEnabled, setDiscountEnabled] = useState(true);
  const [discount, setDiscount] = useState(20);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  const [subjects, setSubjects] = useState<{ id: string; name: string; minPrice: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Context from URL when creating new
  const ctx = useMemo(() => ({
    eduType: params.get("eduType") || "",
    stage: params.get("stage") || "",
    grade: params.get("grade") || "",
    section: params.get("section") || "",
    subjectIds: (params.get("subjects") || "").split(",").filter(Boolean),
  }), [params]);

  useEffect(() => {
    (async () => {
      let subjectIds = ctx.subjectIds;
      if (isEdit && packageId) {
        const { data: pkg } = await supabase.from("bundled_packages" as any).select("*").eq("id", packageId).single() as any;
        if (pkg) {
          setName(pkg.name || "");
          setDescription(pkg.description || "");
          setImageUrl(pkg.image_url || "");
          setColor(pkg.color || "#10b981");
          setExpiresAt(pkg.expires_at ? pkg.expires_at.slice(0, 16) : "");
          setMaxSubscriptions(pkg.max_subscriptions?.toString() || "");
          setDiscount(Number(pkg.discount_percentage) || 0);
          setDiscountEnabled((Number(pkg.discount_percentage) || 0) > 0);
          if (pkg.manual_final_price !== null) {
            setUseManualPrice(true);
            setManualPrice(String(pkg.manual_final_price));
          }
        }
        const { data: subs } = await supabase.from("bundled_package_subjects" as any).select("subject_id").eq("package_id", packageId);
        subjectIds = (subs || []).map((s: any) => s.subject_id);
      }

      if (subjectIds.length > 0) {
        const { data: subjectData } = await supabase.from("subjects" as any).select("id, name").in("id", subjectIds);
        const { data: groups } = await supabase.from("content_groups" as any)
          .select("subject_id, price").in("subject_id", subjectIds).eq("is_active", true);
        const minPrices = new Map<string, number>();
        (groups || []).forEach((g: any) => {
          const cur = minPrices.get(g.subject_id);
          const p = Number(g.price || 0);
          if (cur === undefined || p < cur) minPrices.set(g.subject_id, p);
        });
        setSubjects((subjectData || []).map((s: any) => ({
          id: s.id, name: s.name, minPrice: minPrices.get(s.id) || 0,
        })));
      }
      setLoading(false);
    })();
  }, [packageId]);

  const totalOriginal = subjects.reduce((sum, s) => sum + s.minPrice, 0);
  const finalPrice = useManualPrice && manualPrice
    ? Number(manualPrice)
    : Math.round(totalOriginal * (1 - (discountEnabled ? discount : 0) / 100) * 100) / 100;
  const effectiveDiscount = totalOriginal > 0 ? Math.round(((totalOriginal - finalPrice) / totalOriginal) * 1000) / 10 : 0;

  const save = async (publish: boolean, schedule = false) => {
    if (!user) return;
    if (subjects.length === 0) {
      toast.error("اختر مواد للباقة");
      return;
    }
    setSaving(true);
    const status = schedule ? "scheduled" : publish ? "active" : "draft";
    const payload: any = {
      created_by: user.id,
      name: name || null,
      description: description || null,
      image_url: imageUrl || null,
      color,
      education_type: ctx.eduType,
      stage: ctx.stage,
      grade: ctx.grade,
      section: ctx.section || null,
      discount_percentage: discountEnabled && !useManualPrice ? discount : 0,
      manual_final_price: useManualPrice && manualPrice ? Number(manualPrice) : null,
      status,
      publish_at: schedule && scheduleAt ? new Date(scheduleAt).toISOString() : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      max_subscriptions: maxSubscriptions ? Number(maxSubscriptions) : null,
    };

    try {
      let pkgId = packageId;
      if (isEdit) {
        const { error } = await supabase.from("bundled_packages" as any).update(payload).eq("id", packageId!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("bundled_packages" as any).insert(payload).select("id").single() as any;
        if (error) throw error;
        pkgId = data.id;
        const rows = subjects.map((s) => ({ package_id: pkgId, subject_id: s.id }));
        const { error: e2 } = await supabase.from("bundled_package_subjects" as any).insert(rows);
        if (e2) throw e2;
      }
      toast.success(isEdit ? "تم تحديث الباقة" : "تم إنشاء الباقة بنجاح");
      navigate("/admin/bundled-packages/manage");
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-32" dir="rtl">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <h1 className="text-lg font-bold">{isEdit ? "تعديل الباقة" : "إنشاء باقة جديدة"}</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Basic info */}
        <Card className="p-5 space-y-4">
          <h2 className="font-bold">بيانات الباقة</h2>
          <div className="space-y-3">
            <div>
              <Label>اسم الباقة (اختياري)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: باقة المواد العلمية المخفضة" />
            </div>
            <div>
              <Label>الوصف (اختياري)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>رابط الصورة (اختياري)</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>
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
                <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> تاريخ الانتهاء (اختياري)</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
              <div>
                <Label>الحد الأقصى للاشتراكات (اختياري)</Label>
                <Input type="number" min="1" value={maxSubscriptions} onChange={(e) => setMaxSubscriptions(e.target.value)} placeholder="مثلاً 100" />
              </div>
            </div>
          </div>
        </Card>

        {/* Subjects */}
        <Card className="p-5 space-y-3">
          <h2 className="font-bold">المواد المختارة ({subjects.length})</h2>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <Badge key={s.id} variant="secondary" className="text-sm py-1.5 px-3">
                {s.name} <span className="opacity-60 mx-1">·</span> {s.minPrice} جنيه
                {!isEdit && (
                  <button className="mr-2" onClick={() => setSubjects((prev) => prev.filter((x) => x.id !== s.id))}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Pricing - Smart Dynamic */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> التسعير الذكي</h2>
            <div className="flex items-center gap-2">
              <Label className="text-sm">تفعيل خصم</Label>
              <Switch checked={discountEnabled} onCheckedChange={(c) => { setDiscountEnabled(c); if (c) setUseManualPrice(false); }} />
            </div>
          </div>

          {discountEnabled && !useManualPrice && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>نسبة الخصم</span>
                <span className="font-bold text-primary">{discount}%</span>
              </div>
              <Slider value={[discount]} onValueChange={(v) => setDiscount(v[0])} min={0} max={90} step={1} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch checked={useManualPrice} onCheckedChange={(c) => { setUseManualPrice(c); if (c) setDiscountEnabled(false); }} />
            <Label className="text-sm">تحديد سعر نهائي يدوي بدلاً من النسبة</Label>
          </div>
          {useManualPrice && (
            <Input type="number" placeholder="السعر النهائي" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} />
          )}

          <div className="rounded-lg p-4 border-2 border-dashed space-y-2" style={{ borderColor: color }}>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>السعر الأصلي (مجموع أرخص مجموعة لكل مادة)</span>
              <span className="line-through">{totalOriginal} جنيه</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>السعر بعد الخصم</span>
              <span style={{ color }}>{finalPrice} جنيه</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>نسبة التوفير</span>
              <Badge style={{ backgroundColor: color, color: "#fff" }}>{effectiveDiscount}%</Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              💡 الباقة Smart Dynamic — لو سعر أي مجموعة اتغير، الباقة تتحدث تلقائيًا.
            </p>
          </div>
        </Card>

        {/* Schedule */}
        <Card className="p-5 space-y-3">
          <h2 className="font-bold">جدولة النشر (اختياري)</h2>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
        </Card>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-40">
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
