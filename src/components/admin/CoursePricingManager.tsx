import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, DollarSign, GraduationCap, BookOpen } from "lucide-react";

type EduType = "عام" | "أزهر";

const STAGES = [
  { key: "preparatory", label: "المرحلة الإعدادية" },
  { key: "secondary", label: "المرحلة الثانوية" },
] as const;

const GRADES = [
  { key: "first", label: "الصف الأول" },
  { key: "second", label: "الصف الثاني" },
  { key: "third", label: "الصف الثالث" },
] as const;

function sectionsFor(edu: EduType, stage: string, grade: string): { key: string; label: string }[] {
  if (stage !== "secondary") return [{ key: "", label: "بدون شعبة" }];
  if (edu === "أزهر") {
    return [
      { key: "scientific", label: "علمي" },
      { key: "literary", label: "أدبي" },
    ];
  }
  if (grade === "first") return [{ key: "", label: "بدون شعبة" }];
  if (grade === "third") {
    return [
      { key: "scientific", label: "علمي علوم / علمي رياضة" },
      { key: "literary", label: "أدبي" },
    ];
  }
  return [
    { key: "scientific", label: "علمي" },
    { key: "literary", label: "أدبي" },
  ];
}

interface Subject {
  id: string;
  name: string;
  category: string;
  stage: string;
  grade: string;
  section: string | null;
}

interface PriceRow {
  id?: string;
  education_type: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  price: number;
}

const CoursePricingManager = () => {
  const [edu, setEdu] = useState<EduType | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({}); // by category -> price
  const [existing, setExisting] = useState<Record<string, PriceRow>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const sectionOptions = useMemo(
    () => (edu && stage && grade ? sectionsFor(edu, stage, grade) : []),
    [edu, stage, grade]
  );

  useEffect(() => {
    if (!edu || !stage || !grade || section === null) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edu, stage, grade, section]);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch subjects matching stage/grade and section (null section subjects match too)
      let q = supabase.from("subjects").select("id,name,category,stage,grade,section").eq("stage", stage!).eq("grade", grade!);
      const { data: subs, error } = await q;
      if (error) throw error;
      const sectionKey = section || "";
      const filtered = (subs || []).filter((s: any) => {
        const ss = (s.section || "").trim();
        if (!sectionKey) return !ss;
        return !ss || ss === sectionKey;
      });
      // dedupe by category (one price per category in this scope)
      const seen = new Map<string, Subject>();
      filtered.forEach((s: any) => {
        if (!seen.has(s.category)) seen.set(s.category, s);
      });
      const unique = Array.from(seen.values());
      setSubjects(unique);

      // Fetch existing prices
      const { data: pr } = await supabase
        .from("subject_default_prices" as any)
        .select("*")
        .eq("education_type", edu!)
        .eq("stage", stage!)
        .eq("grade", grade!);
      const map: Record<string, PriceRow> = {};
      const priceInputs: Record<string, string> = {};
      (pr || []).forEach((row: any) => {
        const rowSec = (row.section || "") as string;
        if (rowSec !== sectionKey) return;
        map[row.category] = row;
        priceInputs[row.category] = String(row.price);
      });
      setExisting(map);
      setPrices(priceInputs);
    } catch (e: any) {
      console.error(e);
      toast.error("خطأ في تحميل المواد");
    } finally {
      setLoading(false);
    }
  };

  const savePrice = async (category: string) => {
    const raw = prices[category];
    if (raw === undefined || raw === "") {
      toast.error("ادخل سعراً");
      return;
    }
    const price = Number(raw);
    if (Number.isNaN(price) || price < 0) {
      toast.error("سعر غير صالح");
      return;
    }
    setSavingKey(category);
    try {
      const payload: any = {
        education_type: edu,
        stage,
        grade,
        section: section || null,
        category,
        price,
      };
      const ex = existing[category];
      if (ex?.id) {
        const { error } = await supabase.from("subject_default_prices" as any).update(payload).eq("id", ex.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subject_default_prices" as any).insert(payload);
        if (error) throw error;
      }
      toast.success("تم حفظ السعر");
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "خطأ في الحفظ");
    } finally {
      setSavingKey(null);
    }
  };

  const reset = () => {
    setEdu(null);
    setStage(null);
    setGrade(null);
    setSection(null);
    setSubjects([]);
    setPrices({});
    setExisting({});
  };

  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            تسعير كورسات المواد
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            حدّد سعراً ثابتاً لكل مادة. أي مجموعة جديدة ينشئها المعلم لهذه المادة سيتم تطبيق السعر تلقائياً عليها.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Education type */}
          <div>
            <Label className="mb-2 block">نوع التعليم</Label>
            <div className="flex gap-2 flex-wrap">
              {(["عام", "أزهر"] as EduType[]).map((t) => (
                <Button
                  key={t}
                  variant={edu === t ? "default" : "outline"}
                  onClick={() => { setEdu(t); setStage(null); setGrade(null); setSection(null); }}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Step 2: Stage */}
          {edu && (
            <div>
              <Label className="mb-2 block">المرحلة</Label>
              <div className="flex gap-2 flex-wrap">
                {STAGES.map((s) => (
                  <Button
                    key={s.key}
                    variant={stage === s.key ? "default" : "outline"}
                    onClick={() => { setStage(s.key); setGrade(null); setSection(null); }}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Grade */}
          {edu && stage && (
            <div>
              <Label className="mb-2 block">الصف</Label>
              <div className="flex gap-2 flex-wrap">
                {GRADES.map((g) => (
                  <Button
                    key={g.key}
                    variant={grade === g.key ? "default" : "outline"}
                    onClick={() => { setGrade(g.key); setSection(null); }}
                  >
                    {g.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Section */}
          {edu && stage && grade && (
            <div>
              <Label className="mb-2 block">الشعبة</Label>
              <div className="flex gap-2 flex-wrap">
                {sectionOptions.map((opt) => (
                  <Button
                    key={opt.key || "none"}
                    variant={section === opt.key ? "default" : "outline"}
                    onClick={() => setSection(opt.key)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {(edu || stage || grade || section !== null) && (
            <Button variant="ghost" size="sm" onClick={reset}>إعادة التحديد</Button>
          )}
        </CardContent>
      </Card>

      {edu && stage && grade && section !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              المواد المتاحة
              <Badge variant="secondary" className="mr-2">{subjects.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : subjects.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">لا توجد مواد لهذا التصنيف</p>
            ) : (
              <div className="grid gap-3">
                {subjects.map((s) => {
                  const ex = existing[s.category];
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg bg-card"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-bold">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ex ? `السعر الحالي: ${ex.price} جنيه` : "لا يوجد سعر افتراضي"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder="السعر"
                          value={prices[s.category] ?? ""}
                          onChange={(e) => setPrices((p) => ({ ...p, [s.category]: e.target.value }))}
                          className="w-32 text-center"
                        />
                        <span className="text-sm text-muted-foreground">جنيه</span>
                        <Button
                          size="sm"
                          onClick={() => savePrice(s.category)}
                          disabled={savingKey === s.category}
                          className="gap-1"
                        >
                          {savingKey === s.category ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          حفظ
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CoursePricingManager;
