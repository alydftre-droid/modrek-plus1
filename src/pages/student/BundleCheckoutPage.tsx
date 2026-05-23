import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Loader2, Check, ShoppingCart, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";

interface SubjectInfo {
  id: string;
  name: string;
  groups: { id: string; title: string; price: number; month_label: string | null; teacher_id: string | null; teacherName?: string }[];
}

export default function BundleCheckoutPage() {
  const { bundleId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pkg, setPkg] = useState<any>(null);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!bundleId || !user) return;
    (async () => {
      const { data: pkgData } = await supabase.from("bundled_packages" as any).select("*").eq("id", bundleId).single();
      setPkg(pkgData);

      const { data: pkgSubjects } = await supabase.from("bundled_package_subjects" as any).select("subject_id").eq("package_id", bundleId) as any;
      const subjectIds = (pkgSubjects || []).map((s: any) => s.subject_id);
      if (subjectIds.length === 0) { setLoading(false); return; }

      const { data: subjectData } = await supabase.from("subjects" as any).select("id, name").in("id", subjectIds);
      const { data: groupsData } = await supabase.from("content_groups" as any)
        .select("id, subject_id, title, price, month_label, teacher_id, created_by, is_active")
        .in("subject_id", subjectIds).eq("is_active", true);

      // teacher names
      const teacherIds = Array.from(new Set((groupsData || []).map((g: any) => g.teacher_id || g.created_by).filter(Boolean)));
      const { data: teachers } = teacherIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
        : { data: [] };
      const teacherMap = new Map((teachers || []).map((t: any) => [t.id, t.full_name]));

      const list: SubjectInfo[] = (subjectData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        groups: (groupsData || []).filter((g: any) => g.subject_id === s.id).map((g: any) => ({
          id: g.id, title: g.title, price: Number(g.price || 0),
          month_label: g.month_label, teacher_id: g.teacher_id || g.created_by,
          teacherName: teacherMap.get(g.teacher_id || g.created_by) as string,
        })),
      }));
      setSubjects(list);

      // auto-select cheapest for each
      const auto: Record<string, string> = {};
      list.forEach((s) => {
        if (s.groups.length > 0) {
          const cheapest = [...s.groups].sort((a, b) => a.price - b.price)[0];
          auto[s.id] = cheapest.id;
        }
      });
      setSelectedGroups(auto);

      setLoading(false);
    })();
  }, [bundleId, user?.id]);

  const totals = useMemo(() => {
    let original = 0;
    subjects.forEach((s) => {
      const gid = selectedGroups[s.id];
      const g = s.groups.find((x) => x.id === gid);
      if (g) original += g.price;
    });
    let final = pkg?.manual_final_price !== null && pkg?.manual_final_price !== undefined
      ? Number(pkg.manual_final_price)
      : Math.round(original * (1 - (pkg?.discount_percentage || 0) / 100) * 100) / 100;
    if (final < 0) final = 0;
    return { original, final, saved: Math.max(original - final, 0) };
  }, [subjects, selectedGroups, pkg]);

  const allSelected = subjects.every((s) => selectedGroups[s.id]);

  const confirm = async () => {
    if (!allSelected) return toast.error("اختر مجموعة لكل مادة");
    setSubmitting(true);
    const selections = subjects.map((s) => ({ subject_id: s.id, group_id: selectedGroups[s.id] }));
    const { data, error } = await supabase.rpc("purchase_bundled_package" as any, {
      _package_id: bundleId, _selections: selections,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    const result = data as any;
    if (!result?.success) return toast.error(result?.error || "فشل الاشتراك");
    toast.success("🎉 تم الاشتراك في الباقة بنجاح");
    navigate("/my-courses");
  };

  if (loading) {
    return <StudentSidebarLayout title="اشتراك الباقة">
      <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    </StudentSidebarLayout>;
  }

  if (!pkg) {
    return <StudentSidebarLayout title="اشتراك الباقة"><div className="p-8 text-center">الباقة غير موجودة</div></StudentSidebarLayout>;
  }

  return (
    <StudentSidebarLayout title={pkg.name || "اشتراك الباقة"}>
      <div className="p-4 pb-32 max-w-3xl mx-auto space-y-4">
        <Card className="p-4" style={{ borderColor: pkg.color, borderWidth: 2 }}>
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6" style={{ color: pkg.color }} />
            <div>
              <div className="font-bold">{pkg.name || "باقة مخفضة"}</div>
              <div className="text-sm text-muted-foreground">اختر مجموعة واحدة لكل مادة</div>
            </div>
          </div>
        </Card>

        {subjects.map((s) => (
          <Card key={s.id} className="p-4 space-y-3">
            <div className="font-bold">{s.name}</div>
            {s.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مجموعات متاحة لهذه المادة</p>
            ) : (
              <div className="space-y-2">
                {s.groups.map((g) => {
                  const selected = selectedGroups[s.id] === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroups((p) => ({ ...p, [s.id]: g.id }))}
                      className={`w-full text-right p-3 rounded-lg border-2 transition-all flex items-center justify-between gap-2 ${
                        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{g.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {g.teacherName || "معلم"} {g.month_label ? `· ${g.month_label}` : ""}
                        </div>
                      </div>
                      <div className="text-left flex items-center gap-2">
                        <div className="text-sm font-bold">{g.price} ج</div>
                        {selected && <Check className="h-5 w-5 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-40">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex justify-between items-baseline">
            <div>
              <div className="text-xs text-muted-foreground line-through">{totals.original} جنيه</div>
              <div className="text-2xl font-bold" style={{ color: pkg.color }}>{totals.final} جنيه</div>
            </div>
            {totals.saved > 0 && (
              <Badge className="text-base py-1 px-3" style={{ backgroundColor: pkg.color, color: "#fff" }}>
                توفير {totals.saved} ج
              </Badge>
            )}
          </div>
          <Button className="w-full" size="lg" disabled={!allSelected || submitting} onClick={confirm}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <><ShoppingCart className="h-4 w-4 ml-2" /> تأكيد الاشتراك</>
            )}
          </Button>
        </div>
      </div>
    </StudentSidebarLayout>
  );
}
