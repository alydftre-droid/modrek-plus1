import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Loader2, Sparkles, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StudentSidebarLayout from "@/components/student/StudentSidebarLayout";
import { motion } from "framer-motion";

export default function BundlesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles").select("education_type, stage, grade, section").eq("id", user.id).single();

      if (!profile?.stage || !profile?.grade) {
        setLoading(false);
        return;
      }

      let q = supabase
        .from("bundled_packages" as any).select("*")
        .eq("status", "active")
        .eq("stage", profile.stage)
        .eq("grade", profile.grade);
      if (profile.education_type) q = q.eq("education_type", profile.education_type);

      const { data } = await q as any;
      let list = (data || []).filter((p: any) => {
        // section match: package has no section (shared) OR matches student's section
        if (!p.section) return true;
        return p.section === profile.section;
      });
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
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : packages.length === 0 ? (
          <Card className="p-10 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold mb-1">لا توجد باقات متاحة حالياً</p>
            <p className="text-sm text-muted-foreground">تابعنا للحصول على عروض جديدة</p>
          </Card>
        ) : (
          packages.map((pkg, i) => (
            <motion.div key={pkg.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card
                onClick={() => navigate(`/student/bundles/${pkg.id}`)}
                className="overflow-hidden cursor-pointer hover:shadow-xl transition-all border-2"
                style={{ borderColor: pkg.color }}
              >
                <div className="p-5 text-white relative" style={{ background: `linear-gradient(135deg, ${pkg.color}, ${pkg.color}dd)` }}>
                  {pkg.price?.discount_percentage > 0 && (
                    <Badge className="absolute top-3 left-3 bg-white text-foreground font-bold">
                      <Sparkles className="h-3 w-3 ml-1" /> خصم {pkg.price.discount_percentage}%
                    </Badge>
                  )}
                  <h3 className="font-bold text-xl mb-1">{pkg.name || "باقة مميزة"}</h3>
                  {pkg.description && <p className="text-white/90 text-sm">{pkg.description}</p>}
                  <div className="flex items-center gap-3 mt-3 text-sm">
                    <Badge variant="secondary" className="bg-white/20 text-white border-0">{pkg.subjectsCount} مواد</Badge>
                    {pkg.expires_at && (
                      <Badge variant="secondary" className="bg-white/20 text-white border-0">
                        <Clock className="h-3 w-3 ml-1" /> ينتهي قريباً
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between bg-card">
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
