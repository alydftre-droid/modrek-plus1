import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Loader2, Sparkles, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { motion } from "framer-motion";
import { displayBundleSection, formatBundleAudience, hexToRgba, matchesPackageToStudent } from "@/lib/bundledPackages";

export default function BundlesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles").select("education_type, stage, grade, section").eq("id", user.id).maybeSingle();

      if (!profile?.stage || !profile?.grade) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("bundled_packages" as any)
        .select("*")
        .in("status", ["active", "scheduled"]) as any;

      let list = (data || []).filter((p: any) => matchesPackageToStudent(p, {
        educationType: profile.education_type,
        stage: profile.stage,
        grade: profile.grade,
        section: profile.section,
      }));

      list = list.filter((p: any) => p.status === "active");
      // exclude expired by time
      const now = Date.now();
      list = list.filter((p: any) => !p.expires_at || new Date(p.expires_at).getTime() > now);

      // Compute prices
      const enriched = await Promise.all(list.map(async (p: any) => {
        const { data: priceData } = await supabase.rpc("compute_bundle_price" as any, { _package_id: p.id });
        const { count } = await supabase.from("bundled_package_subjects" as any)
          .select("*", { count: "exact", head: true }).eq("package_id", p.id);
        return { ...p, price: priceData, subjectsCount: count || 0 };
      }));

      setPackages(enriched);
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <StudentSidebarLayout title="الباقات المخفضة">
      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="overflow-hidden border-border/70 bg-card/90 shadow-md">
                <Skeleton className="h-32 w-full rounded-none" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : packages.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-border/70 bg-card/90 shadow-sm">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold mb-1">لا توجد باقات متاحة حالياً</p>
            <p className="text-sm text-muted-foreground">تابعنا للحصول على عروض جديدة</p>
          </Card>
        ) : (
          packages.map((pkg, i) => (
            <motion.div key={pkg.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card
                onClick={() => navigate(`/student/bundles/${pkg.id}`)}
                className="overflow-hidden cursor-pointer transition-all border border-border/70 bg-card/95 shadow-md hover:-translate-y-1 hover:shadow-xl"
                style={{ boxShadow: `0 14px 32px ${hexToRgba(pkg.color, 0.12)}` }}
              >
                <div className="relative p-5" style={{ background: `linear-gradient(135deg, ${hexToRgba(pkg.color, 0.16)}, ${hexToRgba(pkg.color, 0.04)})` }}>
                  {pkg.price?.discount_percentage > 0 && (
                    <Badge className="absolute top-3 left-3 border-0 bg-secondary text-secondary-foreground font-bold shadow-sm">
                      <Sparkles className="h-3 w-3 ml-1" /> خصم {pkg.price.discount_percentage}%
                    </Badge>
                  )}
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/10 bg-background/80 text-primary shadow-sm">
                    <Package className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-xl mb-1 text-foreground">{pkg.name || "باقة مميزة"}</h3>
                  {pkg.description && <p className="text-muted-foreground text-sm leading-7">{pkg.description}</p>}
                  <div className="mt-3 text-xs text-muted-foreground">{formatBundleAudience(pkg)}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-4 text-sm">
                    <Badge variant="outline" className="bg-background/80">{pkg.subjectsCount} مواد</Badge>
                    {pkg.section && <Badge variant="outline" className="bg-background/80">{displayBundleSection(pkg.section)}</Badge>}
                    {pkg.expires_at && (
                      <Badge variant="outline" className="bg-background/80">
                        <Clock className="h-3 w-3 ml-1" /> ينتهي قريباً
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between bg-card border-t border-border/60">
                  <div>
                    <div className="text-sm text-muted-foreground line-through">{pkg.price?.original} جنيه</div>
                    <div className="text-2xl font-bold" style={{ color: pkg.color }}>{pkg.price?.final} جنيه</div>
                  </div>
                  <div className="text-sm font-medium text-primary">عرض التفاصيل ←</div>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </StudentSidebarLayout>
  );
}
