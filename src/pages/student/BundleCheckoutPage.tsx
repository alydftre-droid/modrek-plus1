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
import { trackViewContent, trackInitiateCheckout, trackPurchase } from "@/lib/metaPixel";

interface BundleSelection {
  categoryKey: string;
  groupId: string;
  groupTitle: string;
  subjectName: string;
  teacherName: string;
  price: number;
  monthLabel?: string | null;
}

const BUNDLE_SUBJECT_ROUTE_MAP: Record<string, { category: string; subjectName: string }> = {
  physics: { category: "scientific", subjectName: "الفيزياء" },
  chemistry: { category: "scientific", subjectName: "الكيمياء" },
  biology: { category: "scientific", subjectName: "الأحياء" },
  history: { category: "history_geo", subjectName: "التاريخ" },
  geography: { category: "history_geo", subjectName: "الجغرافيا" },
};

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
    const buttonsMap = new Map(allButtons.map((button) => [button.key, button]));

    return ((pkg.category_keys || []) as string[])
      .map((key) => {
        const directButton = buttonsMap.get(key);
        if (directButton) return directButton;

        const def = getCategoryDef(key);
        if (!def) return null;

        return {
          key: def.key,
          name: def.name,
          icon: def.icon,
          toneClass: def.toneClass,
          emoji: def.emoji,
          subtitle: "افتح المادة وحدد المجموعة",
          hasSubjects: false,
        } satisfies StudentDashboardButton;
      })
      .filter(Boolean) as StudentDashboardButton[];
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

  // ---- Meta Pixel: ViewContent once per bundle page view ----
  useEffect(() => {
    if (loading || !pkg?.id) return;
    trackViewContent(`bundle:${pkg.id}`, {
      content_type: "product_group",
      content_name: pkg.name || "bundle",
      content_ids: [String(pkg.id)],
    });
  }, [loading, pkg?.id, pkg?.name]);

  // ---- Meta Pixel: InitiateCheckout when the bundle confirmation dialog opens ----
  useEffect(() => {
    if (!confirmOpen || !pkg?.id) return;
    trackInitiateCheckout(`bundle:${pkg.id}`, {
      value: Number(totals.final || 0),
      content_type: "product_group",
      content_name: pkg.name || "bundle",
      content_ids: [String(pkg.id)],
    });
  }, [confirmOpen, pkg?.id, pkg?.name, totals.final]);


  const openRealSubjectFlow = (button: StudentDashboardButton) => {
    if (!profile || !bundleId) return;

    const specificRoute = BUNDLE_SUBJECT_ROUTE_MAP[button.key];
    if (specificRoute) {
      const params = new URLSearchParams({
        stage: profile.stage,
        grade: profile.grade,
        category: specificRoute.category,
        subject_name: specificRoute.subjectName,
        bundleId,
        bundleCategory: button.key,
        returnTo: `/student/bundles/${bundleId}`,
      });
      if (profile.section) params.set("section", profile.section);
      navigate(`/student-subject?${params.toString()}`);
      return;
    }

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

  const totalCats = (pkg.category_keys || []).length;
  const doneCats = Object.values(selected).filter((s) => s?.groupId).length;

  // Modern brand gradient (2026): deep indigo → violet → fuchsia
  const BRAND_FROM = "#4F46E5";
  const BRAND_VIA = "#7C3AED";
  const BRAND_TO = "#EC4899";
  const ACCENT = BRAND_VIA;

  return (
    <StudentSidebarLayout title={pkg.name || "اشتراك الباقة"}>
      <div className="p-4 pb-36 max-w-3xl mx-auto space-y-5">
        {/* Hero header — modern glassy gradient */}
        <div
          className="relative overflow-hidden rounded-[28px] p-6"
          style={{
            background: `linear-gradient(135deg, ${BRAND_FROM} 0%, ${BRAND_VIA} 55%, ${BRAND_TO} 100%)`,
            boxShadow: `0 25px 60px -25px ${hexToRgba(BRAND_VIA, 0.7)}`,
          }}
        >
          {/* Mesh orbs */}
          <div className="absolute -top-16 -right-12 h-52 w-52 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-14 h-56 w-56 rounded-full bg-fuchsia-300/30 blur-3xl" />
          <div className="absolute top-1/3 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-indigo-200/20 blur-2xl" />
          {/* Subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />

          <div className="relative text-white">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-md px-3 py-1 text-[11px] font-bold">
                <Sparkles className="h-3 w-3" />
                باقة ذكية
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-white text-foreground px-3 py-1 text-[11px] font-extrabold shadow-lg">
                <span className="text-fuchsia-600">●</span>
                خصم {pkg.discount_type === "amount" ? `${pkg.discount_amount} ج` : `${pkg.discount_percentage}%`}
              </div>
            </div>
            <h2 className="text-[22px] font-extrabold leading-tight tracking-tight drop-shadow-sm">
              أنشئ باقتك التعليمية الذكية
            </h2>
            <p className="text-[12.5px] text-white/90 mt-1.5 leading-relaxed">
              اختر أفضل المجموعات التعليمية بخصومات حصرية مخصّصة لك
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="rounded-2xl bg-card/60 backdrop-blur border border-border/60 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground">تقدّمك في اختيار المواد</span>
            <span className="font-extrabold tabular-nums text-base" style={{ color: ACCENT }}>
              {doneCats}<span className="text-muted-foreground text-xs"> / {totalCats}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${(doneCats / Math.max(totalCats, 1)) * 100}%`,
                background: `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_VIA}, ${BRAND_TO})`,
                boxShadow: `0 0 12px ${hexToRgba(BRAND_VIA, 0.6)}`,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {categoryButtons.map((button) => {
            const selectedGroup = selected[button.key];
            const isDone = !!selectedGroup;
            return (
              <div key={button.key} className="space-y-2.5">
                <button
                  onClick={() => openRealSubjectFlow(button)}
                  className={`${button.toneClass} group relative h-[140px] w-full overflow-hidden rounded-[22px] p-4 text-white transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl active:scale-[0.97] shadow-xl ring-1 ring-white/10`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/15" />
                  <div className="absolute -left-8 -top-7 h-24 w-24 rounded-full bg-white/15 blur-md" />
                  <div className="absolute -right-6 -bottom-6 h-20 w-20 rounded-full bg-white/10 blur-md" />
                  {isDone && (
                    <div className="absolute top-2.5 left-2.5 h-7 w-7 rounded-full bg-white flex items-center justify-center shadow-lg ring-2 ring-white/60">
                      <Check className="h-4 w-4" style={{ color: ACCENT }} strokeWidth={3} />
                    </div>
                  )}
                  <div className="relative flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <span className="text-[44px] leading-none drop-shadow-md">{button.emoji}</span>
                    <span className="text-base font-extrabold drop-shadow-sm tracking-tight">{button.name}</span>
                  </div>
                </button>

                <Card
                  className={`p-3 min-h-[96px] transition-all rounded-2xl ${
                    isDone
                      ? "bg-card border shadow-md"
                      : "bg-muted/30 border border-dashed border-border/70"
                  }`}
                  style={isDone ? { borderColor: hexToRgba(ACCENT, 0.35), boxShadow: `0 6px 20px -10px ${hexToRgba(ACCENT, 0.4)}` } : undefined}
                >
                  {selectedGroup ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: hexToRgba(ACCENT, 0.14), color: ACCENT }}
                        >
                          ✓ تم التحديد
                        </span>
                        <button
                          type="button"
                          onClick={() => clearSelection(button.key)}
                          className="text-[11px] font-semibold text-muted-foreground hover:text-destructive transition"
                        >
                          تغيير
                        </button>
                      </div>
                      <div className="text-[13px] font-bold text-foreground line-clamp-1">{selectedGroup.subjectName}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-1">
                        أ. {selectedGroup.teacherName}
                      </div>
                      <div className="text-sm font-extrabold tabular-nums" style={{ color: ACCENT }}>
                        {selectedGroup.price} ج
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1 py-1.5">
                      <div className="text-[12px] font-bold text-foreground/80">اختر المجموعة المناسبة</div>
                      <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                        <span>للمتابعة والاشتراك</span>
                        <ChevronLeft className="h-3 w-3" />
                      </div>
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
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground">الإجمالي بعد الخصم</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: ACCENT }}>
                {totals.final} <span className="text-sm font-bold">ج</span>
              </div>
              {totals.original > 0 && (
                <div className="text-xs text-muted-foreground line-through tabular-nums">{totals.original} ج</div>
              )}
            </div>
            {totals.saved > 0 && (
              <div className="text-[10.5px] font-bold mt-0.5" style={{ color: ACCENT }}>
                وفّرت {totals.saved} جنيه
              </div>
            )}
          </div>
          <Button
            className="h-12 px-6 rounded-2xl text-white font-bold shadow-xl disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${BRAND_FROM}, ${BRAND_VIA}, ${BRAND_TO})`, boxShadow: `0 12px 28px -10px ${hexToRgba(BRAND_VIA, 0.6)}` }}
            disabled={!allSelected || submitting}
            onClick={() => setConfirmOpen(true)}
          >
            <ShoppingCart className="h-4 w-4 ml-2" />
            {allSelected ? "اشترك الآن" : `اختر ${totalCats - doneCats} مادة`}
          </Button>
        </div>
      </div>

    </StudentSidebarLayout>
  );
}