import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Layers3, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  displayBundleSection, gradeNeedsSection, sectionsForGrade,
  type EducationType,
} from "@/lib/bundledPackages";
import { getBundleSubjectChoices, getCategoryDef, getStudentDashboardButtons } from "@/lib/studentCategories";
import { toast } from "sonner";

export default function BundledPackagesSectionSubjectsPage() {
  const { eduType, stage, grade } = useParams();
  const navigate = useNavigate();
  const decodedEdu = decodeURIComponent(eduType || "") as EducationType;
  const decodedGrade = decodeURIComponent(grade || "");

  const sectionsAvailable = sectionsForGrade(decodedEdu, decodedGrade);
  const needsSection = gradeNeedsSection(decodedEdu, decodedGrade);
  const [section, setSection] = useState<string | null>(needsSection ? null : "none");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const activeSection = section && section !== "none" ? section : "";
  const categories = useMemo(() => {
    if (needsSection && !section) return [];
    return getStudentDashboardButtons({
      educationType: decodedEdu, stage: stage || "", grade: decodedGrade, section: activeSection,
    });
  }, [decodedEdu, stage, decodedGrade, activeSection, needsSection, section]);

  const subjectChoices = useMemo(() => {
    if (!expandedKey) return [];
    return getBundleSubjectChoices(expandedKey, {
      stage: stage || "",
      grade: decodedGrade,
      section: activeSection,
    });
  }, [expandedKey, stage, decodedGrade, activeSection]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleCategoryClick = (key: string, hasSubjects?: boolean) => {
    if (hasSubjects) {
      setExpandedKey((current) => current === key ? null : key);
      return;
    }
    toggle(key);
  };

  const toggleSubjectChoice = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const next = () => {
    if (selected.size < 2) {
      toast.error("اختر فئتين على الأقل لإنشاء باقة");
      return;
    }
    const params = new URLSearchParams({
      eduType: decodedEdu, stage: stage || "", grade: decodedGrade,
      section: activeSection,
      categories: Array.from(selected).join(","),
    });
    navigate(`/admin/bundled-packages/new?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 pb-28" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="flex items-center justify-between max-w-3xl mx-auto p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate text-foreground">{decodedGrade}</h1>
            <p className="text-xs text-muted-foreground mt-1">اختر فئتين أو أكثر من الأزرار الرئيسية كما يراها الطالب.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <Card className="overflow-hidden border-border/70 bg-card/90 shadow-lg">
          <div className="p-5 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> أزرار حقيقية مطابقة لشاشة الطالب
            </div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-secondary" /> نطاق الباقة
            </h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 bg-background/80">{decodedEdu}</Badge>
              <Badge variant="outline" className="border-primary/20 bg-background/80">{decodedGrade}</Badge>
              {activeSection && (
                <Badge variant="outline" className="border-secondary/30 bg-secondary/10">
                  {displayBundleSection(activeSection)}
                </Badge>
              )}
            </div>
          </div>
        </Card>

        {needsSection && !section && (
          <Card className="p-6 border-border/70 bg-card/95 shadow-md">
            <h2 className="font-bold mb-2 text-foreground">اختر الشعبة</h2>
            <p className="text-sm text-muted-foreground mb-4">سيتم عرض الأزرار الرئيسية الخاصة بهذه الشعبة فقط.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sectionsAvailable.map((s) => (
                <button key={s.value} type="button" onClick={() => setSection(s.value)}
                  className="rounded-2xl border border-border bg-background p-4 text-right transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <div className="font-semibold text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">عرض الأزرار الرئيسية لهذه الشعبة</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {(!needsSection || section) && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-foreground">الأزرار الرئيسية ({selected.size} محددة)</h2>
              <span className="text-xs text-muted-foreground">اضغط مرتين أو أكثر</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
               {categories.map((cat) => {
                 const isSelected = selected.has(cat.key);
                 const catSubjectChoices = cat.hasSubjects
                   ? getBundleSubjectChoices(cat.key, {
                       stage: stage || "",
                       grade: decodedGrade,
                       section: activeSection,
                     })
                   : [];
                 const selectedChildrenCount = catSubjectChoices.filter((choice) => selected.has(choice.id)).length;
                 const isExpanded = expandedKey === cat.key;
                return (
                   <div key={cat.key} className="space-y-2">
                     <button onClick={() => handleCategoryClick(cat.key, cat.hasSubjects)}
                       className={`${cat.toneClass} shadow-dashboard-soft group relative min-h-[130px] w-full overflow-hidden rounded-[20px] p-4 text-white transition-all duration-300 active:scale-[0.97] ${
                         isSelected || selectedChildrenCount > 0 || isExpanded
                           ? "ring-4 ring-white/80 ring-offset-2 ring-offset-background scale-[1.02] shadow-xl"
                           : "hover:-translate-y-1"
                       }`}>
                       <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
                       <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full bg-white/10 -translate-x-6 translate-y-6" />
                       <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
                         <span className="text-[44px] leading-none drop-shadow-sm">{cat.emoji}</span>
                         <span className="text-base font-semibold drop-shadow-sm">{cat.name}</span>
                         {cat.hasSubjects ? (
                           <span className="text-xs text-white/75">
                             {selectedChildrenCount > 0 ? `تم تحديد ${selectedChildrenCount} مادة` : (cat.subtitle || "اضغط لاختيار المادة")}
                           </span>
                         ) : cat.subtitle ? <span className="text-xs text-white/75">{cat.subtitle}</span> : null}
                       </div>
                       {cat.hasSubjects ? (
                         <div className="absolute top-2 left-2 rounded-full bg-white/20 p-1.5 shadow-sm">
                           <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                         </div>
                       ) : isSelected ? (
                         <div className="absolute top-2 right-2 bg-white text-primary rounded-full p-1 shadow">
                           <Check className="h-3 w-3" />
                         </div>
                       ) : null}
                     </button>

                     {cat.hasSubjects && isExpanded && subjectChoices.length > 0 && (
                       <Card className="border-border/70 bg-card/95 p-3 shadow-sm">
                         <div className="mb-3 text-sm font-bold text-foreground">اختر المواد داخل {cat.name}</div>
                         <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                           {subjectChoices.map((choice) => {
                             const def = getCategoryDef(choice.id);
                             const choiceSelected = selected.has(choice.id);
                             return (
                               <button
                                 key={choice.id}
                                 type="button"
                                 onClick={() => toggleSubjectChoice(choice.id)}
                                 className={`${def?.toneClass || "dashboard-category-science"} relative min-h-[88px] overflow-hidden rounded-2xl p-3 text-white transition-all ${
                                   choiceSelected ? "ring-2 ring-white/80 ring-offset-2 ring-offset-background shadow-lg" : "hover:-translate-y-0.5"
                                 }`}
                               >
                                 <div className="relative flex h-full flex-col items-center justify-center gap-1 text-center">
                                   <span className="text-3xl leading-none">{choice.emoji}</span>
                                   <span className="text-sm font-bold">{choice.name}</span>
                                 </div>
                                 {choiceSelected && (
                                   <div className="absolute top-2 right-2 rounded-full bg-white p-1 text-primary shadow">
                                     <Check className="h-3 w-3" />
                                   </div>
                                 )}
                               </button>
                             );
                           })}
                         </div>
                       </Card>
                     )}
                   </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {(!needsSection || section) && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-40">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSelected(new Set())}>مسح</Button>
            <Button className="flex-1" disabled={selected.size < 2} onClick={next}>
              متابعة ({selected.size})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
