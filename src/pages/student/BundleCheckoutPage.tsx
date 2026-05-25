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

  return (
    <StudentSidebarLayout title={pkg.name || "اشتراك الباقة"}>
      <div className="p-4 pb-36 max-w-3xl mx-auto space-y-5">
        {/* Hero header */}
        <div
          className="relative overflow-hidden rounded-3xl p-5"
          style={{
            background: `linear-gradient(135deg, ${pkg.color} 0%, ${hexToRgba(pkg.color, 0.72)} 100%)`,
            boxShadow: `0 20px 50px -20px ${hexToRgba(pkg.color, 0.6)}`,
          }}
        >
          <div className="absolute -top-12 -right-10 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-14 -left-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3 text-white">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-[11px] font-bold mb-2">
                <Sparkles className="h-3 w-3" /> باقة مميزة
              </div>
              <h2 className="text-xl font-extrabold leading-tight truncate">{pkg.name || "باقة موفّرة"}</h2>
              <p className="text-[12px] text-white/90 mt-1">
                {totalCats} مواد · وفّر أكثر باشتراك واحد
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/95 px-3 py-2 text-center shadow-lg">
              <div className="text-[10px] font-semibold leading-tight" style={{ color: pkg.color }}>خصم حصري</div>
              <div className="text-xl font-extrabold leading-tight" style={{ color: pkg.color }}>
                {pkg.discount_type === "amount" ? `${pkg.discount_amount} ج` : `${pkg.discount_percentage}%`}
              </div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground">حدّد مجموعة لكل مادة</span>
            <span className="font-extrabold tabular-nums" style={{ color: pkg.color }}>
              {doneCats} / {totalCats}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(doneCats / Math.max(totalCats, 1)) * 100}%`,
                background: `linear-gradient(90deg, ${pkg.color}, ${hexToRgba(pkg.color, 0.55)})`,
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {categoryButtons.map((button) => {
            const selectedGroup = selected[button.key];
            const isDone = !!selectedGroup;
            return (
              <div key={button.key} className="space-y-2">
                <button
                  onClick={() => openRealSubjectFlow(button)}
                  className={`${button.toneClass} group relative h-[130px] w-full overflow-hidden rounded-2xl p-4 text-white transition-all duration-300 hover:-translate-y-1 active:scale-[0.97] shadow-lg`}
                >
                  <div className="absolute left-0 top-0 h-24 w-24 rounded-full bg-white/10 -translate-x-8 -translate-y-7" />
                  <div className="absolute bottom-0 right-0 h-20 w-20 rounded-full bg-white/10 translate-x-6 translate-y-6" />
                  {isDone && (
                    <div className="absolute top-2 left-2 h-7 w-7 rounded-full bg-white flex items-center justify-center shadow-md ring-2 ring-white/50">
                      <Check className="h-4 w-4" style={{ color: pkg.color }} strokeWidth={3} />
                    </div>
                  )}
                  <div className="relative flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <span className="text-[42px] leading-none drop-shadow-sm">{button.emoji}</span>
                    <span className="text-base font-bold drop-shadow-sm">{button.name}</span>
                  </div>
                </button>

                <Card
                  className={`p-3 min-h-[92px] transition-all rounded-2xl ${
                    isDone
                      ? "bg-card border shadow-sm"
                      : "bg-muted/40 border border-dashed border-border/80"
                  }`}
                  style={isDone ? { borderColor: hexToRgba(pkg.color, 0.35) } : undefined}
                >
                  {selectedGroup ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: hexToRgba(pkg.color, 0.14), color: pkg.color }}
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
                      <div className="text-sm font-extrabold tabular-nums" style={{ color: pkg.color }}>
                        {selectedGroup.price} ج
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 py-2">
                      <div className="text-[12px] font-bold text-foreground/80">جاهز للاختيار</div>
                      <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                        <span>اضغط الزر بالأعلى</span>
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