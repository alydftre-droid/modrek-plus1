import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { motion } from "framer-motion";
import { hexToRgba, matchesPackageToStudent } from "@/lib/bundledPackages";
import { getCategoryDef } from "@/lib/studentCategories";

export default function BundlesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase.from("profiles")
        .select("education_type, stage, grade, section").eq("id", user.id).maybeSingle();

      if (!profile?.stage || !profile?.grade) { setLoading(false); return; }

      const { data } = await supabase.from("bundled_packages" as any)
        .select("*").eq("status", "active") as any;

      let list = (data || []).filter((p: any) => matchesPackageToStudent(p, {
        educationType: profile.education_type, stage: profile.stage, grade: profile.grade, section: profile.section,
      }));
      const now = Date.now();
      list = list.filter((p: any) => !p.expires_at || new Date(p.expires_at).getTime() > now);
      list = list.filter((p: any) => (p.category_keys?.length || 0) >= 2);

      setPackages(list);
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <StudentSidebarLayout title="الباقات المخفضة">
      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border-border/70 bg-card/90">
                <Skeleton className="h-40 w-full rounded-none" />
              </Card>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-border/70 bg-card/90">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold mb-1">لا توجد باقات متاحة حالياً</p>
            <p className="text-sm text-muted-foreground">تابعنا للحصول على عروض جديدة</p>
          </Card>
        ) : (
          packages.map((pkg, i) => {
            const cats = (pkg.category_keys || []).map((k: string) => getCategoryDef(k)).filter(Boolean);
            const namesText = cats.map((c: any) => c.name).join(" و ");
            return (
              <motion.div key={pkg.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card onClick={() => navigate(`/student/bundles/${pkg.id}`)}
                  className="overflow-hidden cursor-pointer transition-all border border-border/70 shadow-md hover:-translate-y-1 hover:shadow-xl"
                  style={{ boxShadow: `0 14px 32px ${hexToRgba(pkg.color, 0.14)}` }}>
                  <div className="relative p-5" style={{ background: `linear-gradient(135deg, ${hexToRgba(pkg.color, 0.20)}, ${hexToRgba(pkg.color, 0.05)})` }}>
                    <Badge className="absolute top-3 left-3 border-0 font-bold shadow"
                      style={{ backgroundColor: pkg.color, color: "#fff" }}>
                      <Sparkles className="h-3 w-3 ml-1" /> {pkg.discount_type === "amount" ? `خصم ${pkg.discount_amount} ج` : `خصم ${pkg.discount_percentage}%`}
                    </Badge>

                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-background/80 shadow-sm" style={{ color: pkg.color }}>
                      <Package className="h-6 w-6" />
                    </div>

                    <h3 className="font-bold text-xl mb-2 text-foreground">{pkg.name || `باقة ${namesText}`}</h3>
                    <p className="text-foreground/80 text-sm leading-7">
                      يمكنك الاشتراك في <span className="font-bold">{namesText}</span> بخصم <span className="font-bold" style={{ color: pkg.color }}>{pkg.discount_type === "amount" ? `${pkg.discount_amount} ج` : `${pkg.discount_percentage}%`}</span>
                    </p>

                    <div className="flex flex-wrap gap-2 mt-3">
                      {cats.map((c: any) => (
                        <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-background/80 border border-border/60 px-3 py-1 text-xs font-semibold text-foreground">
                          <span>{c.emoji}</span>{c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between bg-card border-t border-border/60">
                    <div className="text-sm font-semibold" style={{ color: pkg.color }}>اختر مجموعاتك الآن ←</div>
                    <Badge variant="outline">{cats.length} فئات</Badge>
                  </div>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </StudentSidebarLayout>
  );
}
