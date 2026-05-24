import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Loader2, Check, AlertCircle, Layers3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  displayBundleSection,
  gradeNeedsSection,
  matchesBundleAcademicTarget,
  normalizeBundleGrade,
  normalizeBundleSection,
  normalizeBundleStage,
  sectionsForGrade,
  type EducationType,
} from "@/lib/bundledPackages";
import { toast } from "sonner";

export default function BundledPackagesSectionSubjectsPage() {
  const { eduType, stage, grade } = useParams();
  const navigate = useNavigate();
  const decodedEdu = decodeURIComponent(eduType || "") as EducationType;
  const decodedGrade = decodeURIComponent(grade || "");

  const sectionsAvailable = sectionsForGrade(decodedEdu, decodedGrade);
  const needsSection = gradeNeedsSection(decodedEdu, decodedGrade);
  const normalizedStage = normalizeBundleStage(stage);
  const normalizedGrade = normalizeBundleGrade(decodedGrade);

  const [section, setSection] = useState<string | null>(needsSection ? null : "none");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const activeSectionValue = useMemo(() => (section && section !== "none" ? normalizeBundleSection(section) : ""), [section]);

  useEffect(() => {
    if (needsSection && !section) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase
        .from("subjects" as any)
        .select("id, name, category, section, stage, grade, is_active")
        .eq("is_active", true);

      if (error) {
        toast.error("فشل تحميل المواد");
        setLoadError("تعذر قراءة المواد من قاعدة البيانات حالياً.");
        setLoading(false);
        return;
      }

      let list = ((data || []) as any[]).filter((subject) =>
        matchesBundleAcademicTarget(subject, {
          stage: normalizedStage,
          grade: normalizedGrade,
          section: activeSectionValue,
        })
      );

      list = list.sort((a, b) => a.name.localeCompare(b.name, "ar"));

      setSubjects(list.map((s: any) => ({ id: s.id, name: s.name, category: s.category })));
      if (list.length === 0) {
        setLoadError("لم يتم العثور على مواد مرتبطة فعليًا بهذا الصف/القسم.");
      }
      setLoading(false);
    })();
  }, [normalizedStage, normalizedGrade, activeSectionValue, section, needsSection]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const next = () => {
    if (selected.size === 0) {
      toast.error("اختر مادة واحدة على الأقل");
      return;
    }
    const params = new URLSearchParams({
      eduType: decodedEdu,
      stage: stage || "",
      grade: decodedGrade,
      section: section && section !== "none" ? section : "",
      subjects: Array.from(selected).join(","),
    });
    navigate(`/admin/bundled-packages/new?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 pb-24" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate text-foreground">{decodedGrade}</h1>
            <p className="text-xs text-muted-foreground mt-1">اختر المواد التي ستدخل داخل الباقة المجمعة.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <Card className="overflow-hidden border-border/70 bg-card/90 shadow-lg">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> ربط مباشر بالمواد الحقيقية
                </div>
                <h2 className="mt-3 text-base font-bold text-foreground">نطاق الباقة الحالية</h2>
              </div>
              <div className="rounded-2xl bg-secondary/20 p-3 text-secondary">
                <Layers3 className="h-5 w-5" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 bg-background/80 px-3 py-1 text-foreground">{decodedEdu}</Badge>
              <Badge variant="outline" className="border-primary/20 bg-background/80 px-3 py-1 text-foreground">{decodedGrade}</Badge>
              {activeSectionValue && (
                <Badge variant="outline" className="border-secondary/30 bg-secondary/10 px-3 py-1 text-foreground">
                  {displayBundleSection(activeSectionValue)}
                </Badge>
              )}
            </div>
          </div>
        </Card>

        {needsSection && !section && (
          <Card className="p-6 border-border/70 bg-card/95 shadow-md">
            <h2 className="font-bold mb-2 text-foreground">اختر الشعبة</h2>
            <p className="text-sm text-muted-foreground mb-4">سيتم جلب المواد المطابقة لهذه الشعبة مباشرة من قاعدة البيانات.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sectionsAvailable.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSection(s.value)}
                  className="rounded-2xl border border-border bg-background p-4 text-right transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-accent/40 hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">عرض المواد الخاصة بهذه الشعبة فقط</div>
                    </div>
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <BookOpen className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {(!needsSection || section) && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2 text-foreground">
                <BookOpen className="h-5 w-5 text-primary" /> اختر المواد ({selected.size} محددة)
              </h2>
              {needsSection && section && (
                <Badge variant="secondary" className="px-3 py-1">
                  الشعبة: {sectionsAvailable.find((s) => s.value === section)?.label}
                </Badge>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="p-4 border-border/60 bg-card/80">
                    <Skeleton className="h-5 w-28 mb-3" />
                    <Skeleton className="h-4 w-20" />
                  </Card>
                ))}
              </div>
            ) : subjects.length === 0 ? (
              <Card className="p-8 text-center border-dashed border-border/70 bg-card/80">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-secondary" />
                <p className="font-bold text-foreground mb-1">لا توجد مواد مطابقة حالياً</p>
                <p className="text-sm text-muted-foreground">{loadError || "أضف مواد لهذا الصف أو راجع بيانات المرحلة والشعبة."}</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subjects.map((s) => {
                  const isSelected = selected.has(s.id);
                  return (
                    <Card
                      key={s.id}
                      onClick={() => toggle(s.id)}
                      className={`p-4 cursor-pointer transition-all border ${
                        isSelected
                          ? "border-primary/60 bg-primary/5 shadow-md"
                          : "border-border/70 bg-card/95 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">{s.category || "مادة تعليمية"}</div>
                        </div>
                        <div className={`rounded-full p-2 ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          <Check className="h-4 w-4" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {(!needsSection || section) && subjects.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-40">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSelected(new Set())}>
              مسح الاختيار
            </Button>
            <Button className="flex-1" disabled={selected.size === 0} onClick={next}>
              متابعة ({selected.size})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
