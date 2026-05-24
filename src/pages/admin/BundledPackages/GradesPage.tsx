import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, GraduationCap, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GRADES_BY_STAGE } from "@/lib/bundledPackages";

export default function BundledPackagesGradesPage() {
  const { eduType } = useParams();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(eduType || "");
  const title = decoded === "أزهر" ? "التعليم الأزهري" : "التعليم العام";

  const sections = [
    { stage: "preparatory", label: `المرحلة الإعدادية ${decoded === "أزهر" ? "الأزهرية" : "العامة"}`, icon: BookOpen },
    { stage: "secondary", label: `المرحلة الثانوية ${decoded === "أزهر" ? "الأزهرية" : "العامة"}`, icon: GraduationCap },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30" dir="rtl">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-border/70">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <h1 className="text-xl font-bold">{title}</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/bundled-packages")}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-8">
        {sections.map((section) => (
          <div key={section.stage} className="space-y-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <section.icon className="h-5 w-5 text-primary" /> {section.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GRADES_BY_STAGE[section.stage].map((grade) => (
                <Card
                  key={grade}
                  onClick={() =>
                    navigate(
                      `/admin/bundled-packages/${encodeURIComponent(decoded)}/${section.stage}/${encodeURIComponent(grade)}`
                    )
                  }
                  className="cursor-pointer border border-border/70 bg-card/95 p-5 text-center font-medium shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="text-foreground">{grade}</div>
                  <div className="mt-2 text-xs text-muted-foreground">عرض المواد المطابقة لهذا الصف</div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
