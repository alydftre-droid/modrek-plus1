import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Edit, Eye, EyeOff, Loader2, Trash2, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BundledPackage } from "@/lib/bundledPackages";

const statusColors: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800",
  scheduled: "bg-blue-200 text-blue-800",
  active: "bg-green-200 text-green-800",
  hidden: "bg-yellow-200 text-yellow-800",
  expired: "bg-red-200 text-red-800",
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
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border">
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
          <Card className="p-8 text-center text-muted-foreground">لا توجد باقات بعد</Card>
        ) : (
          packages.map((pkg) => (
            <Card key={pkg.id} className="p-4 flex items-center gap-4 border-r-4" style={{ borderRightColor: pkg.color || "#10b981" }}>
              {pkg.image_url ? (
                <img src={pkg.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: pkg.color || "#10b981" }}>
                  <Package className="h-6 w-6" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{pkg.name || "باقة بدون اسم"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {pkg.education_type} · {pkg.grade} {pkg.section ? `· ${pkg.section}` : ""}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge className={statusColors[pkg.status]}>{statusLabels[pkg.status]}</Badge>
                  <Badge variant="outline">{pkg.discount_percentage}% خصم</Badge>
                  <Badge variant="outline">{pkg.subscriptions_count} مشترك</Badge>
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
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
