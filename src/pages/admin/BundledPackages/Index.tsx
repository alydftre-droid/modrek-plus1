import { useNavigate } from "react-router-dom";
import { ArrowRight, Moon, Sun, Package, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function BundledPackagesIndex() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between max-w-4xl mx-auto p-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> الباقات المجمعة
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/bundled-packages/manage")}>
              <ListChecks className="h-4 w-4 ml-1" /> إدارة الباقات
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <p className="text-muted-foreground text-center">
          اختر نوع التعليم لإنشاء باقات مخفضة مخصصة للطلاب
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { type: "أزهر", label: "التعليم الأزهري", icon: Moon, gradient: "from-emerald-500 to-teal-600" },
            { type: "عام", label: "التعليم العام", icon: Sun, gradient: "from-blue-500 to-indigo-600" },
          ].map((opt, i) => (
            <motion.div
              key={opt.type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card
                onClick={() => navigate(`/admin/bundled-packages/${encodeURIComponent(opt.type)}`)}
                className={`cursor-pointer overflow-hidden border-0 shadow-xl hover:scale-[1.02] transition-transform bg-gradient-to-br ${opt.gradient} text-white p-8 min-h-[200px] flex flex-col justify-between`}
              >
                <opt.icon className="h-12 w-12 mb-3 opacity-90" />
                <div>
                  <h2 className="text-2xl font-bold mb-1">{opt.label}</h2>
                  <p className="text-white/80 text-sm">إنشاء باقات مخفضة للطلاب</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
