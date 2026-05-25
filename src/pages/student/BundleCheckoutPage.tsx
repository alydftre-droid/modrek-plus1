import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Check, ShoppingCart, Sparkles, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { hexToRgba } from "@/lib/bundledPackages";
import { getCategoryDef, fetchSubjectsForCategory } from "@/lib/studentCategories";

interface GroupOpt { id: string; title: string; price: number; subject_id: string; subject_name: string; teacher_id: string | null; teacherName?: string; month_label?: string | null; }
interface Selected { group: GroupOpt; }

export default function BundleCheckoutPage() {
  const { bundleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pkg, setPkg] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [optionsByCat, setOptionsByCat] = useState<Record<string, GroupOpt[]>>({});
  const [selected, setSelected] = useState<Record<string, Selected | null>>({});
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!bundleId || !user) return;
    (async () => {
      const [{ data: pkgData }, { data: prof }] = await Promise.all([
        supabase.from("bundled_packages" as any).select("*").eq("id", bundleId).maybeSingle() as any,
        supabase.from("profiles").select("education_type, stage, grade, section").eq("id", user.id).maybeSingle(),
      ]);
      setPkg(pkgData); setProfile(prof);

      if (pkgData && prof) {
        const ctx = { stage: prof.stage, grade: prof.grade, section: prof.section };
        const opts: Record<string, GroupOpt[]> = {};
        for (const key of (pkgData.category_keys || [])) {
          const subjects = await fetchSubjectsForCategory(supabase, key, ctx);
          const subjectIds = subjects.map((s: any) => s.id);
          if (subjectIds.length === 0) { opts[key] = []; continue; }
          const { data: groups } = await supabase.from("content_groups" as any)
            .select("id, title, price, subject_id, teacher_id, created_by, month_label, is_active")
            .in("subject_id", subjectIds).eq("is_active", true);
          const teacherIds = Array.from(new Set((groups || []).map((g: any) => g.teacher_id || g.created_by).filter(Boolean)));
          const { data: teachers } = teacherIds.length
            ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
            : { data: [] as any };
          const tmap = new Map((teachers || []).map((t: any) => [t.id, t.full_name]));
          const smap = new Map(subjects.map((s: any) => [s.id, s.name]));
          opts[key] = (groups || []).map((g: any) => ({
            id: g.id, title: g.title, price: Number(g.price || 0),
            subject_id: g.subject_id, subject_name: smap.get(g.subject_id) as string,
            teacher_id: g.teacher_id || g.created_by,
            teacherName: tmap.get(g.teacher_id || g.created_by) as string,
            month_label: g.month_label,
          }));
        }
        setOptionsByCat(opts);
      }
      setLoading(false);
    })();
  }, [bundleId, user?.id]);

  const totals = useMemo(() => {
    let original = 0;
    Object.values(selected).forEach((s) => { if (s) original += s.group.price; });
    let final: number;
    if (pkg?.discount_type === "amount") {
      final = Math.max(original - Number(pkg.discount_amount || 0), 0);
    } else {
      final = Math.round(original * (1 - (pkg?.discount_percentage || 0) / 100) * 100) / 100;
    }
    return { original, final, saved: Math.max(original - final, 0) };
  }, [selected, pkg]);

  const allSelected = pkg?.category_keys?.length > 0 && pkg.category_keys.every((k: string) => selected[k]);

  const confirm = async () => {
    setSubmitting(true);
    const selections = (pkg.category_keys || []).map((k: string) => ({
      category_key: k, group_id: selected[k]!.group.id,
    }));
    const { data, error } = await supabase.rpc("purchase_bundle_by_categories" as any, {
      _package_id: bundleId, _selections: selections,
    });
    setSubmitting(false); setConfirmOpen(false);
    if (error) return toast.error(error.message);
    const r = data as any;
    if (!r?.success) return toast.error(r?.error || "فشل الاشتراك");
    toast.success("🎉 تم الاشتراك في الباقة بنجاح");
    navigate("/my-courses");
  };

  if (loading) return <StudentSidebarLayout title="اشتراك الباقة">
    <div className="p-4 space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
  </StudentSidebarLayout>;

  if (!pkg) return <StudentSidebarLayout title="اشتراك الباقة"><div className="p-8 text-center">الباقة غير موجودة</div></StudentSidebarLayout>;

  const cats = (pkg.category_keys || []) as string[];

  return (
    <StudentSidebarLayout title={pkg.name || "اشتراك الباقة"}>
      <div className="p-4 pb-32 max-w-3xl mx-auto space-y-4">
        <Card className="p-4 border-border/70" style={{ boxShadow: `0 12px 28px ${hexToRgba(pkg.color, 0.14)}` }}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl p-3" style={{ backgroundColor: hexToRgba(pkg.color, 0.14), color: pkg.color }}>
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="font-bold text-foreground">{pkg.name || "باقة مميزة"}</div>
              <div className="text-sm text-muted-foreground">اختر مجموعة واحدة لكل فئة</div>
            </div>
          </div>
          <Badge className="mt-3 border-0" style={{ backgroundColor: pkg.color, color: "#fff" }}>خصم {pkg.discount_percentage}%</Badge>
        </Card>

        {cats.map((key) => {
          const def = getCategoryDef(key);
          if (!def) return null;
          const sel = selected[key];
          const opts = optionsByCat[key] || [];
          const empty = opts.length === 0;
          return (
            <Card key={key} className="p-4 border-border/70 bg-card/95 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-xl p-2.5 text-white" style={{ background: def.gradient }}>
                    <def.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-foreground">{def.name}</div>
                    {sel ? (
                      <div className="text-xs text-muted-foreground truncate">
                        {sel.group.subject_name} · {sel.group.teacherName || "معلم"} · {sel.group.price} ج
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{empty ? "لا توجد مجموعات متاحة" : "لم يتم الاختيار بعد"}</div>
                    )}
                  </div>
                </div>
                <Button size="sm" variant={sel ? "outline" : "default"} disabled={empty} onClick={() => setOpenCat(key)}>
                  {sel ? "تغيير" : "اختر"} <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Selection sheet */}
      <Sheet open={!!openCat} onOpenChange={(o) => !o && setOpenCat(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto" dir="rtl">
          <SheetHeader><SheetTitle>{openCat && getCategoryDef(openCat)?.name}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {openCat && (optionsByCat[openCat] || []).length === 0 && (
              <p className="text-center text-muted-foreground py-6">لا توجد مجموعات متاحة في هذه الفئة حالياً</p>
            )}
            {openCat && (optionsByCat[openCat] || []).map((g) => {
              const isSel = selected[openCat!]?.group.id === g.id;
              return (
                <button key={g.id} onClick={() => { setSelected((p) => ({ ...p, [openCat!]: { group: g } })); setOpenCat(null); }}
                  className={`w-full text-right p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                    isSel ? "border-primary/60 bg-primary/5" : "border-border/70 bg-background hover:border-primary/30"
                  }`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground truncate">{g.subject_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{g.title} · {g.teacherName || "معلم"}{g.month_label ? ` · ${g.month_label}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-bold">{g.price} ج</div>
                    {isSel && <Check className="h-5 w-5 text-primary" />}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تأكيد الاشتراك</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>سيتم اشتراكك في:</p>
            <ul className="space-y-1 list-disc list-inside text-foreground">
              {cats.map((k) => {
                const s = selected[k]; const d = getCategoryDef(k);
                if (!s || !d) return null;
                return <li key={k}><b>{d.name}</b>: {s.group.subject_name} مع {s.group.teacherName || "المعلم"}</li>;
              })}
            </ul>
            <div className="mt-3 flex justify-between border-t pt-3">
              <span>السعر الأصلي</span>
              <span className="line-through text-destructive">{totals.original} ج</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>بعد الخصم</span>
              <span style={{ color: pkg.color }}>{totals.final} ج</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>إلغاء</Button>
            <Button onClick={confirm} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/70 p-4 z-40">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex justify-between items-baseline">
            <div>
              <div className="text-xs text-destructive line-through">{totals.original} جنيه</div>
              <div className="text-2xl font-bold" style={{ color: pkg.color }}>{totals.final} جنيه</div>
            </div>
            {totals.saved > 0 && (
              <Badge className="text-base py-1 px-3 border-0" style={{ backgroundColor: hexToRgba(pkg.color, 0.14), color: pkg.color }}>
                توفير {totals.saved} ج
              </Badge>
            )}
          </div>
          <Button className="w-full" size="lg" disabled={!allSelected || submitting} onClick={() => setConfirmOpen(true)}>
            <ShoppingCart className="h-4 w-4 ml-2" /> اشترك الآن
          </Button>
        </div>
      </div>
    </StudentSidebarLayout>
  );
}
