import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  GraduationCap,
  BookOpen,
  Wallet,
  ChevronLeft,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getCategoriesForContext,
  getBundleSubjectChoices,
  fetchBundleSubjects,
  type CategoryDef,
  type BundleSubjectChoice,
} from "@/lib/studentCategories";

// ---------- Types ----------
interface PriceRow {
  id?: string;
  education_type: string;
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  subject_name: string | null;
  price: number;
  updated_at?: string;
}

// ---------- Static labels ----------
const EDUCATION_TYPES = [
  { key: "عام", label: "التعليم العام", icon: "🎓" },
  { key: "أزهر", label: "التعليم الأزهري", icon: "🕌" },
] as const;

const STAGES = [
  { key: "preparatory", label: "المرحلة الإعدادية", icon: "📗" },
  { key: "secondary", label: "المرحلة الثانوية", icon: "📕" },
] as const;

const GRADES: Record<string, { key: string; label: string }[]> = {
  preparatory: [
    { key: "first", label: "الأول الإعدادي" },
    { key: "second", label: "الثاني الإعدادي" },
    { key: "third", label: "الثالث الإعدادي" },
  ],
  secondary: [
    { key: "first", label: "الأول الثانوي" },
    { key: "second", label: "الثاني الثانوي" },
    { key: "third", label: "الثالث الثانوي" },
  ],
};

const SECTIONS = [
  { key: "scientific", label: "علمي" },
  { key: "literary", label: "أدبي" },
] as const;

// Categories that need expansion into individual subjects
const EXPANDABLE_CATEGORY_KEYS = new Set(["scientific", "history_geo"]);

// ---------- Helpers ----------
function priceKey(category: string, subjectName: string | null) {
  return `${category}::${subjectName ?? "__ROOT__"}`;
}

// ---------- Page ----------
export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [educationType, setEducationType] = useState<string>("");
  const [stage, setStage] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [section, setSection] = useState<string>("");
  const [expandedCategory, setExpandedCategory] = useState<CategoryDef | null>(null);

  // Reset dependent filters
  useEffect(() => { setStage(""); setGrade(""); setSection(""); }, [educationType]);
  useEffect(() => { setGrade(""); setSection(""); }, [stage]);
  useEffect(() => { setSection(""); }, [grade]);

  // Secondary + general grade 1 → no section. Azhar always has section for secondary.
  const showSection = stage === "secondary" && !(educationType === "عام" && grade === "first");
  const canLoad = !!educationType && !!stage && !!grade && (!showSection || !!section);

  // ---------- Build the categories the STUDENT would see ----------
  const categories: CategoryDef[] = useMemo(() => {
    if (!canLoad) return [];
    return getCategoriesForContext({
      educationType,
      stage,
      grade,
      section: showSection ? section : null,
    });
  }, [educationType, stage, grade, section, showSection, canLoad]);

  // ---------- Fetch existing prices for this filter ----------
  // NOTE: prices are stored section-agnostic (section = NULL) so a subject
  // shared between scientific and literary (e.g. Math, English) has ONE price.
  // Arabic/Sharia differ per education_type ("عام" vs "أزهر"), not per section.
  const pricesQuery = useQuery({
    queryKey: ["dev-subs-prices", educationType, stage, grade, showSection ? section : null],
    enabled: canLoad,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_default_prices")
        .select("id,education_type,stage,grade,section,category,subject_name,price,updated_at")
        .in("education_type", [educationType, "both"])
          .eq("stage", stage)
          .eq("grade", grade);
      if (error) throw error;
      return (data || []) as PriceRow[];
    },
  });

  // Map: `${category}::${subject_name || __ROOT__}` -> price row.
  // Prefer the new official section-agnostic price, but still show legacy
  // section-specific rows so the developer sees the current saved price.
  const priceMap = useMemo(() => {
    const m = new Map<string, PriceRow>();
    (pricesQuery.data || []).forEach((row) => {
      const k = priceKey(row.category, row.subject_name);
      const existing = m.get(k);
      const rowSection = row.section || null;
      const selectedSection = showSection ? section || null : null;
      const rowScore =
        (row.education_type === educationType ? 100 : 0) +
        (rowSection === null ? 20 : rowSection === selectedSection ? 10 : 0);
      const existingSection = existing?.section || null;
      const existingScore = existing
        ? (existing.education_type === educationType ? 100 : 0) +
          (existingSection === null ? 20 : existingSection === selectedSection ? 10 : 0)
        : -1;
      if (!existing || rowScore > existingScore) {
        m.set(k, row);
      }
    });
    return m;
  }, [pricesQuery.data, educationType, section, showSection]);

  // ---------- Get current price for a category button ----------
  const getCategoryPrice = useCallback(
    (def: CategoryDef): PriceRow | null => {
      // For non-expandable: try each dbCategory with subject_name=null
      for (const cat of def.dbCategories) {
        const row = priceMap.get(priceKey(cat, null));
        if (row) return row;
      }
      return null;
    },
    [priceMap]
  );

  const getSubjectPrice = useCallback(
    (def: CategoryDef, subjectName: string): PriceRow | null => {
      for (const cat of def.dbCategories) {
        const row = priceMap.get(priceKey(cat, subjectName));
        if (row) return row;
      }
      return null;
    },
    [priceMap]
  );

  // ---------- Save ----------
  const savePrice = useCallback(
    async (params: {
      dbCategory: string;
      subjectName: string | null;
      value: number;
    }) => {
      const payload = {
        education_type: educationType,
        stage,
        grade,
        section: null, // section-agnostic pricing: one price per subject per grade
        category: params.dbCategory,
        subject_name: params.subjectName,
        price: params.value,
      };
      const { data: existing, error: findError } = await supabase
        .from("subject_default_prices")
        .select("id")
        .eq("education_type", educationType)
        .eq("stage", stage)
        .eq("grade", grade)
        .is("section", null)
        .eq("category", params.dbCategory)
        .is("subject_name", params.subjectName)
        .maybeSingle();
      if (findError) throw findError;

      const { error } = existing?.id
        ? await supabase
            .from("subject_default_prices")
            .update({ price: params.value })
            .eq("id", existing.id)
        : await supabase.from("subject_default_prices").insert(payload);
      if (error) throw error;
      await qc.invalidateQueries({
        queryKey: ["dev-subs-prices", educationType, stage, grade],
      });
    },
    [educationType, stage, grade, qc]
  );

  // ---------- UI ----------
  const loading = pricesQuery.isLoading;

  return (
    <div className="min-h-screen bg-background px-4 py-5 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-extrabold text-foreground">إدارة أسعار الاشتراكات</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              نفس أزرار المواد التي يراها الطالب — اضغط على المواد العلمية أو الأدبية لتحديد سعر كل مادة داخلها
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-sm">
          {/* Education Type */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold">نوع التعليم</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {EDUCATION_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setEducationType(t.key)}
                  className={cn(
                    "rounded-xl border-2 px-3 py-3 text-sm font-bold transition-all",
                    educationType === t.key
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-background hover:border-primary/40"
                  )}
                >
                  <span className="ml-1">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stage */}
          {educationType && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold">المرحلة الدراسية</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STAGES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStage(s.key)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-sm font-bold transition-all",
                      stage === s.key
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background hover:border-primary/40"
                    )}
                  >
                    <span className="ml-1">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grade */}
          {stage && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold">الصف الدراسي</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {GRADES[stage].map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setGrade(g.key)}
                    className={cn(
                      "rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition-all",
                      grade === g.key
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background hover:border-primary/40"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section */}
          {showSection && grade && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold">الشعبة</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS.map((sec) => (
                  <button
                    key={sec.key}
                    onClick={() => setSection(sec.key)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-all",
                      section === sec.key
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background hover:border-primary/40"
                    )}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {!canLoad ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              اختر نوع التعليم والمرحلة والصف {showSection ? "والشعبة" : ""} لعرض المواد
            </p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : categories.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-bold">لا توجد مواد لهذا الاختيار</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((def) => {
              const isExpandable = EXPANDABLE_CATEGORY_KEYS.has(def.key);
              const price = isExpandable ? null : getCategoryPrice(def);
              return (
                <CategoryPriceCard
                  key={def.key}
                  def={def}
                  isExpandable={isExpandable}
                  price={price}
                  onSave={
                    isExpandable
                      ? undefined
                      : async (value) => {
                          try {
                            await savePrice({
                              dbCategory: def.dbCategories[0],
                              subjectName: null,
                              value,
                            });
                            toast.success(`تم حفظ سعر ${def.name}`);
                          } catch (e: any) {
                            toast.error(e?.message || "تعذر الحفظ");
                          }
                        }
                  }
                  onExpand={
                    isExpandable
                      ? () => setExpandedCategory(def)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Expansion dialog for scientific / history_geo */}
      <Dialog
        open={!!expandedCategory}
        onOpenChange={(v) => {
          if (!v) setExpandedCategory(null);
        }}
      >
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{expandedCategory?.emoji}</span>
              {expandedCategory?.name}
            </DialogTitle>
            <DialogDescription>
              اختر المادة وحدّد سعرها الرسمي — كل مادة داخلية بسعر مستقل
            </DialogDescription>
          </DialogHeader>
          {expandedCategory && (
            <ExpandedSubjectsList
              def={expandedCategory}
              stage={stage}
              grade={grade}
              section={showSection ? section : null}
              getSubjectPrice={(name) => getSubjectPrice(expandedCategory, name)}
              onSave={async (subjectName, value, dbCategory) => {
                try {
                  await savePrice({ dbCategory, subjectName, value });
                  toast.success(`تم حفظ سعر ${subjectName}`);
                } catch (e: any) {
                  toast.error(e?.message || "تعذر الحفظ");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Category card ----------
function CategoryPriceCard({
  def,
  isExpandable,
  price,
  onSave,
  onExpand,
}: {
  def: CategoryDef;
  isExpandable: boolean;
  price: PriceRow | null;
  onSave?: (value: number) => Promise<void>;
  onExpand?: () => void;
}) {
  const currentPrice = price?.price ?? null;
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(currentPrice != null ? String(currentPrice) : "");
  }, [currentPrice]);

  const displayValue = draft;
  const isDirty =
    !isExpandable &&
    displayValue !== (currentPrice != null ? String(currentPrice) : "");

  const handleSave = async () => {
    if (!onSave) return;
    const v = parseFloat(displayValue);
    if (isNaN(v) || v < 0) {
      toast.error("أدخل سعرًا صحيحًا");
      return;
    }
    setSaving(true);
    try {
      await onSave(v);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border-2 bg-card p-4 shadow-sm transition-all",
        isDirty ? "border-primary/60 ring-2 ring-primary/20" : "border-border"
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
          style={{ background: def.gradient }}
        >
          {def.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-extrabold text-foreground truncate">{def.name}</h3>
            {isExpandable ? (
              <Badge variant="outline" className="text-primary border-primary/40 text-[10px]">
                عدة مواد
              </Badge>
            ) : currentPrice != null ? (
              <Badge
                variant="secondary"
                className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]"
              >
                <CheckCircle2 className="h-3 w-3 ml-1" />
                {currentPrice} جنيه
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-[10px]">
                بدون سعر
              </Badge>
            )}
          </div>
          {isExpandable ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              اضغط لاختيار المادة وتحديد سعرها
            </p>
          ) : price?.updated_at ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              آخر تحديث: {new Date(price.updated_at).toLocaleDateString("ar-EG")}
            </p>
          ) : null}
        </div>
      </div>

      {isExpandable ? (
        <Button onClick={onExpand} className="w-full gap-2" variant="secondary">
          اختيار المادة وتحديد السعر
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type="number"
              min={0}
              value={displayValue}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="السعر الحالي"
              className="pl-14 text-base font-bold text-center"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              جنيه
            </span>
          </div>
          <Button
            size="sm"
            variant={isDirty ? "default" : "outline"}
            disabled={!isDirty || saving}
            onClick={handleSave}
            className="gap-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Expanded subjects (scientific / history_geo) ----------
function ExpandedSubjectsList({
  def,
  stage,
  grade,
  section,
  getSubjectPrice,
  onSave,
}: {
  def: CategoryDef;
  stage: string;
  grade: string;
  section: string | null;
  getSubjectPrice: (name: string) => PriceRow | null;
  onSave: (subjectName: string, value: number, dbCategory: string) => Promise<void>;
}) {
  // Choices from the same helper the student flow uses
  const staticChoices: BundleSubjectChoice[] = useMemo(
    () => getBundleSubjectChoices(def.key, { stage, grade, section }),
    [def.key, stage, grade, section]
  );

  // Query real DB subjects for this expandable category to know their exact `category` values
  const dbSubjectsQuery = useQuery({
    queryKey: ["dev-subs-dbsubs", def.key, stage, grade, section],
    queryFn: async () => {
      const list = await fetchBundleSubjects(supabase, def.key, { stage, grade, section }, null);
      return list as Array<{ id: string; name: string; category: string }>;
    },
  });

  const dbSubjects = dbSubjectsQuery.data || [];

  // Merge static choices with actual DB categories
  const items = useMemo(() => {
    return staticChoices.map((choice) => {
      // find DB match by name
      const match = dbSubjects.find((s) => {
        const a = (s.name || "").replace(/\s+/g, "");
        const b = (choice.name || "").replace(/\s+/g, "");
        return a === b || a.includes(b) || b.includes(a);
      });
      const dbCategory = match?.category || def.dbCategories[0];
      return { ...choice, dbCategory, existsInDb: !!match };
    });
  }, [staticChoices, dbSubjects, def.dbCategories]);

  if (dbSubjectsQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        لا توجد مواد داخلية لهذا الاختيار
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
      {items.map((item) => (
        <SubjectPriceRow
          key={item.id}
          name={item.name}
          emoji={item.emoji}
          dbCategory={item.dbCategory}
          missingInDb={!item.existsInDb}
          currentPrice={getSubjectPrice(item.name)?.price ?? null}
          onSave={(v) => onSave(item.name, v, item.dbCategory)}
        />
      ))}
    </div>
  );
}

function SubjectPriceRow({
  name,
  emoji,
  dbCategory,
  currentPrice,
  missingInDb,
  onSave,
}: {
  name: string;
  emoji: string;
  dbCategory: string;
  currentPrice: number | null;
  missingInDb: boolean;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(currentPrice != null ? String(currentPrice) : "");
  }, [currentPrice]);

  const isDirty = draft !== (currentPrice != null ? String(currentPrice) : "");

  const handleSave = async () => {
    const v = parseFloat(draft);
    if (isNaN(v) || v < 0) {
      toast.error("أدخل سعرًا صحيحًا");
      return;
    }
    setSaving(true);
    try {
      await onSave(v);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-card p-3 transition-all",
        isDirty ? "border-primary/60" : "border-border"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{emoji}</span>
        <span className="font-bold text-sm flex-1">{name}</span>
        {currentPrice != null ? (
          <Badge
            variant="secondary"
            className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]"
          >
            {currentPrice} جنيه حاليًا
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-[10px]">
            بدون سعر
          </Badge>
        )}
      </div>
      {missingInDb && (
        <p className="text-[10px] text-amber-600 mb-1">
          ⚠️ غير موجودة كمادة نشطة في قاعدة البيانات لهذا الصف
        </p>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="السعر"
            className="pl-14 text-sm font-bold text-center h-9"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            جنيه
          </span>
        </div>
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          disabled={!isDirty || saving}
          onClick={handleSave}
          className="gap-1 h-9"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ
        </Button>
      </div>
    </div>
  );
}
