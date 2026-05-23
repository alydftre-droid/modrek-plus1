import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Loader2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { gradeNeedsSection, sectionsForGrade, type EducationType } from "@/lib/bundledPackages";
import { toast } from "sonner";

export default function BundledPackagesSectionSubjectsPage() {
  const { eduType, stage, grade } = useParams();
  const navigate = useNavigate();
  const decodedEdu = decodeURIComponent(eduType || "") as EducationType;
  const decodedGrade = decodeURIComponent(grade || "");

  const sectionsAvailable = sectionsForGrade(decodedEdu, decodedGrade);
  const needsSection = gradeNeedsSection(decodedEdu, decodedGrade);

  const [section, setSection] = useState<string | null>(needsSection ? null : "none");
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (needsSection && !section) return;
    setLoading(true);
    (async () => {
      let q = supabase
        .from("subjects" as any)
        .select("id, name, category, section, stage, grade, is_active")
        .eq("stage", stage)
        .eq("grade", decodedGrade)
        .eq("is_active", true);
      const { data, error } = await q;
      if (error) {
        toast.error("فشل تحميل المواد");
        setLoading(false);
        return;
      }
      let list = (data || []) as any[];
      // Filter by section if applicable. Subjects with null section = shared
      if (needsSection && section && section !== "none") {
        list = list.filter((s) => !s.section || s.section === section);
      }
      setSubjects(list.map((s: any) => ({ id: s.id, name: s.name, category: s.category })));
      setLoading(false);
    })();
  }, [stage, decodedGrade, section, needsSection]);

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
    <div className="min-h-screen bg-background pb-24" dir="rtl">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <h1 className="text-lg font-bold truncate">{decodedGrade}</h1>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {needsSection && !section && (
          <Card className="p-6">
            <h2 className="font-bold mb-4">اختر الشعبة</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sectionsAvailable.map((s) => (
                <Button key={s.value} variant="outline" className="h-16 text-base" onClick={() => setSection(s.value)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {(!needsSection || section) && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> اختر المواد ({selected.size} محددة)
              </h2>
              {needsSection && section && (
                <Badge variant="secondary">
                  الشعبة: {sectionsAvailable.find((s) => s.value === section)?.label}
                </Badge>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : subjects.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">لا توجد مواد متاحة لهذا الصف</Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subjects.map((s) => {
                  const isSelected = selected.has(s.id);
                  return (
                    <Card
                      key={s.id}
                      onClick={() => toggle(s.id)}
                      className={`p-4 cursor-pointer transition-all border-2 ${
                        isSelected ? "border-primary bg-primary/5" : "hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.name}</span>
                        {isSelected && <Check className="h-5 w-5 text-primary" />}
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
