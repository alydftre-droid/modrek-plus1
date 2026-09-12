import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Edit, Eye, EyeOff, Loader2, Trash2, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { displayBundleSection, formatBundleAudience, hexToRgba, type BundledPackage } from "@/lib/bundledPackages";
import StoredImage from "@/components/common/StoredImage";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-foreground border-border",
  scheduled: "bg-primary/10 text-primary border-primary/20",
  active: "bg-secondary/20 text-secondary-foreground border-secondary/25",
  hidden: "bg-accent text-accent-foreground border-border",
  expired: "bg-destructive/10 text-destructive border-destructive/20",
};
const statusLabels: Record<string, string> = {
  draft: "مسودة", scheduled: "مجدولة", active: "نشطة", hidden: "مخفية", expired: "منتهية",
};

export default function PackagesList() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<BundledPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("bundled_packages" as any).select("*").order("created_at", { ascending: false }) as any;
    if (error) toast.error("فشل تحميل الباقات");
    setPackages((data || []) as BundledPackage[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleHidden = async (pkg: BundledPackage) => {
    const newStatus = pkg.status === "hidden" ? "active" : "hidden";
    const { error } = await supabase.from("bundled_packages" as any).update({ status: newStatus }).eq("id", pkg.id);
    if (error) return toast.error("فشل التحديث");
    toast.success(newStatus === "hidden" ? "تم إخفاء الباقة" : "تم تفعيل الباقة");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف الباقة؟ هذا الإجراء لا يمكن التراجع عنه.")) return;
    const { error } = await supabase.from("bundled_packages" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30" dir="rtl">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border/70">
        <div className="flex items-center justify-between max-w-4xl mx-auto p-4">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> إدارة الباقات
          </h1>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate("/admin/bundled-packages")}>+ باقة جديدة</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : packages.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground border-dashed border-border/70 bg-card/90">لا توجد باقات بعد</Card>
        ) : (
          packages.map((pkg) => (
            <Card
              key={pkg.id}
              className="overflow-hidden border border-border/70 bg-card/95 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex gap-4 p-4">
                {pkg.image_url ? (
                  <StoredImage source={pkg.image_url} alt="" className="h-16 w-16 rounded-2xl object-cover border border-border/60" />
                ) : (
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border/60"
                    style={{ backgroundColor: hexToRgba(pkg.color, 0.12), color: pkg.color || undefined }}
                  >
                    <Package className="h-7 w-7" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold truncate text-foreground">{pkg.name || "باقة بدون اسم"}</div>
                      <div className="text-xs text-muted-foreground mt-1 leading-6">{formatBundleAudience(pkg)}</div>
                    </div>
                    <Badge className={statusColors[pkg.status]}>{statusLabels[pkg.status]}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-background/80">{pkg.discount_percentage}% خصم</Badge>
                    <Badge variant="outline" className="bg-background/80">{pkg.subscriptions_count} مشترك</Badge>
                    {pkg.section && <Badge variant="outline" className="bg-background/80">{displayBundleSection(pkg.section)}</Badge>}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => navigate(`/admin/bundled-packages/edit/${pkg.id}`)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => toggleHidden(pkg)}>
                  {pkg.status === "hidden" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(pkg.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              </div>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
