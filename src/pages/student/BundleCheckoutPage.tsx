import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Loader2, ShoppingCart, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { hexToRgba } from "@/lib/bundledPackages";
import { buildStudentCategoryPath, getCategoryDef, getStudentDashboardButtons, type StudentDashboardButton } from "@/lib/studentCategories";

interface BundleSelection {
  categoryKey: string;
  groupId: string;
  groupTitle: string;
  subjectName: string;
  teacherName: string;
  price: number;
  monthLabel?: string | null;
}

export default function BundleCheckoutPage() {
  const { bundleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pkg, setPkg] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, BundleSelection | null>>({});

  const storageKey = useMemo(() => `bundle-selection:${bundleId}`, [bundleId]);

  useEffect(() => {
    if (!bundleId || !user) return;
    (async () => {
      const [{ data: pkgData }, { data: prof }] = await Promise.all([
        supabase.from("bundled_packages" as any).select("*").eq("id", bundleId).maybeSingle() as any,
        supabase.from("profiles").select("education_type, stage, grade, section").eq("id", user.id).maybeSingle(),
      ]);
      setPkg(pkgData);
      setProfile(prof);
      setLoading(false);
    })();
  }, [bundleId, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadSelections = () => {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        setSelected(raw ? JSON.parse(raw) : {});
      } catch {
        setSelected({});
      }
    };
    loadSelections();
    window.addEventListener("focus", loadSelections);
    return () => window.removeEventListener("focus", loadSelections);
  }, [storageKey]);

  const categoryButtons = useMemo(() => {
    if (!pkg || !profile) return [] as StudentDashboardButton[];
    const allButtons = getStudentDashboardButtons({
      educationType: profile.education_type,
      stage: profile.stage,
      grade: profile.grade,
      section: profile.section,
    });
    return allButtons.filter((button) => (pkg.category_keys || []).includes(button.key));
  }, [pkg, profile]);

  const totals = useMemo(() => {
    const original = Object.values(selected).reduce((sum, entry) => sum + Number(entry?.price || 0), 0);
    const final = pkg?.discount_type === "amount"
      ? Math.max(original - Number(pkg?.discount_amount || 0), 0)
      : Math.round(original * (1 - Number(pkg?.discount_percentage || 0) / 100) * 100) / 100;
    return { original, final, saved: Math.max(original - final, 0) };
  }, [selected, pkg]);

  const allSelected = useMemo(() => {
    const keys = (pkg?.category_keys || []) as string[];
    return keys.length > 0 && keys.every((key) => selected[key]?.groupId);
  }, [pkg, selected]);

  const openRealSubjectFlow = (button: StudentDashboardButton) => {
    if (!profile || !bundleId) return;
    const path = buildStudentCategoryPath(button, {
      stage: profile.stage,
      grade: profile.grade,
      section: profile.section,
      directToStudentSubject: !button.hasSubjects,
      extraParams: {
        bundleId,
        bundleCategory: button.key,
        returnTo: `/student/bundles/${bundleId}`,
      },
    });
    navigate(path);
  };

  const clearSelection = (categoryKey: string) => {
    const next = { ...selected, [categoryKey]: null };
    setSelected(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey, JSON.stringify(next));
    }
  };

  const confirm = async () => {
    if (!bundleId || !pkg) return;
    setSubmitting(true);
    const selections = (pkg.category_keys || []).map((key: string) => ({
      category_key: key,
      group_id: selected[key]!.groupId,
    }));
    const { data, error } = await supabase.rpc("purchase_bundle_by_categories" as any, {
      _package_id: bundleId,
      _selections: selections,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) return toast.error(error.message);
    const result = data as any;
    if (!result?.success) return toast.error(result?.error || "فشل الاشتراك");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(storageKey);
    }
    toast.success("تم الاشتراك في الباقة بنجاح");
    navigate("/my-courses");
  };

  if (loading) {
    return (
      <StudentSidebarLayout title="اشتراك الباقة">
        <div className="p-4 space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </StudentSidebarLayout>
    );
  }

  if (!pkg || !profile) {
    return <StudentSidebarLayout title="اشتراك الباقة"><div className="p-8 text-center">الباقة غير موجودة</div></StudentSidebarLayout>;
  }

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
              <div className="text-sm text-muted-foreground">اختر نفس أزرار المواد الحقيقية ثم حدّد المجموعة من صفحة المادة الأصلية</div>
            </div>
          </div>
          <Badge className="mt-3 border-0" style={{ backgroundColor: pkg.color, color: "#fff" }}>
            {pkg.discount_type === "amount" ? `خصم ${pkg.discount_amount} ج` : `خصم ${pkg.discount_percentage}%`}
          </Badge>
        </Card>

        <div className="grid grid-cols-2 gap-x-3 gap-y-[14px]">
          {categoryButtons.map((button) => {
            const selectedGroup = selected[button.key];
            return (
              <div key={button.key} className="space-y-2">
                <button
                  onClick={() => openRealSubjectFlow(button)}
                  className={`${button.toneClass} shadow-dashboard-soft group relative h-[130px] w-full overflow-hidden rounded-[20px] p-4 text-white transition-all duration-300 hover:-translate-y-1 active:scale-[0.97]`}
                >
                  <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-white/10 -translate-x-8 -translate-y-7" />
                  <div className="absolute bottom-0 right-0 h-20 w-20 rounded-full bg-white/10 translate-x-6 translate-y-6" />
                  <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
                    <span className="text-[44px] leading-none drop-shadow-sm">{button.emoji}</span>
                    <span className="text-base font-semibold drop-shadow-sm">{button.name}</span>
                    <span className="text-xs text-white/75">{selectedGroup ? "تم اختيار مجموعة" : (button.subtitle || "افتح المادة وحدد المجموعة")}</span>
                  </div>
                </button>

                <Card className="p-3 border-border/70 bg-card/95 min-h-[94px]">
                  {selectedGroup ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-sm font-bold text-primary">
                          <Check className="h-4 w-4" /> تم الاختيار
                        </div>
                        <button type="button" onClick={() => clearSelection(button.key)} className="text-xs text-muted-foreground hover:text-foreground">
                          مسح
                        </button>
                      </div>
                      <div className="text-sm font-semibold text-foreground line-clamp-1">{selectedGroup.subjectName}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {selectedGroup.teacherName} · {selectedGroup.groupTitle}{selectedGroup.monthLabel ? ` · ${selectedGroup.monthLabel}` : ""}
                      </div>
                      <div className="text-sm font-bold text-foreground">{selectedGroup.price} ج</div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-foreground">لم يتم اختيار مجموعة</div>
                        <div className="text-xs text-muted-foreground">افتح زر المادة الحقيقي ثم اختر المجموعة المناسبة</div>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تأكيد الاشتراك في الباقة</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            {(pkg.category_keys || []).map((key: string) => {
              const entry = selected[key];
              const def = getCategoryDef(key);
              if (!entry || !def) return null;
              return (
                <div key={key} className="rounded-xl border border-border/70 p-3">
                  <div className="font-bold text-foreground">{def.name}</div>
                  <div className="text-muted-foreground mt-1">{entry.subjectName} · {entry.teacherName}</div>
                  <div className="text-muted-foreground">{entry.groupTitle}</div>
                  <div className="font-bold mt-1">{entry.price} ج</div>
                </div>
              );
            })}
            <div className="flex justify-between border-t pt-3 mt-3">
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
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الاشتراك"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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