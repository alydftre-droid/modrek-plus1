import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, GraduationCap, BookOpen, ListChecks, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GRADES_BY_STAGE } from "@/lib/bundledPackages";

export default function BundledPackagesGradesPage() {
  const { eduType } = useParams();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(eduType || "");
  const isAzhari = decoded === "أزهر";
  const title = isAzhari ? "التعليم الأزهري" : "التعليم العام";

  const sections = [
    { stage: "preparatory" as const, label: `المرحلة الإعدادية ${isAzhari ? "الأزهرية" : "العامة"}`, icon: BookOpen },
    { stage: "secondary" as const, label: `المرحلة الثانوية ${isAzhari ? "الأزهرية" : "العامة"}`, icon: GraduationCap },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30" dir="rtl">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border/70">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <h1 className="text-lg sm:text-xl font-bold text-foreground">{title}</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/bundled-packages")}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <button
          onClick={() => navigate(`/admin/bundled-packages/manage?eduType=${encodeURIComponent(decoded)}`)}
          className={`group w-full overflow-hidden rounded-3xl border border-border/70 bg-card p-5 sm:p-6 text-right shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-2 ${
            isAzhari ? "ring-amber-500/30 bg-gradient-to-bl from-amber-500/15 via-amber-500/10 to-transparent" : "ring-primary/30 bg-gradient-to-bl from-primary/15 via-primary/10 to-transparent"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className={`rounded-2xl bg-background/80 p-3 shadow-sm ${isAzhari ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>
              <ListChecks className="h-7 w-7" />
            </div>
            <ChevronLeft className={`h-5 w-5 ${isAzhari ? "text-amber-600 dark:text-amber-400" : "text-primary"} transition-transform duration-300 group-hover:-translate-x-1`} />
          </div>
          <div className="mt-4">
            <div className="text-xl sm:text-2xl font-bold text-foreground">المجموعات النشطة - {isAzhari ? "أزهري" : "عام"}</div>
            <div className="mt-1 text-sm text-muted-foreground">عرض وإدارة جميع الباقات المنشورة لهذا النوع</div>
          </div>
        </button>

        <div className="space-y-1 pt-2">
          <div className="text-sm font-semibold text-muted-foreground px-1">إنشاء باقة جديدة — اختر الصف</div>
        </div>

        {sections.map((section) => (
          <div key={section.stage} className="space-y-3">
            <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
              <section.icon className="h-5 w-5 text-primary" /> {section.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GRADES_BY_STAGE[section.stage].map((grade) => (
                <Card
                  key={grade}
                  onClick={() =>
                    navigate(`/admin/bundled-packages/${encodeURIComponent(decoded)}/${section.stage}/${encodeURIComponent(grade)}`)
                  }
                  className="cursor-pointer border border-border/70 bg-card/95 p-5 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="font-semibold text-foreground">{grade}</div>
                  <div className="mt-2 text-xs text-muted-foreground">المواد الحقيقية لهذا الصف</div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
