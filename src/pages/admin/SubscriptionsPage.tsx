import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  Search,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  GraduationCap,
  BookOpen,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCategoryDef } from "@/lib/studentCategories";

// ---------- Types ----------
interface SubjectRow {
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  name: string;
}
interface PriceRow {
  stage: string;
  grade: string;
  section: string | null;
  category: string;
  subject_name: string | null;
  price: number;
  updated_at: string;
}
interface SubjectEntry {
  key: string;           // category::name
  category: string;
  name: string;          // Arabic subject name (e.g. "الفيزياء")
  categoryLabel: string; // Arabic parent category label
  gradient: string;
  emoji: string;
  price: number | null;
  updated_at: string | null;
}

// ---------- Static labels (UI only — NOT data) ----------
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

// Fallback Arabic naming for categories not in getCategoryDef
const CATEGORY_FALLBACK: Record<string, { name: string; emoji: string; gradient: string }> = {
  arabic: { name: "اللغة العربية", emoji: "📖", gradient: "linear-gradient(135deg, hsl(15 85% 55%), hsl(35 85% 50%))" },
  religious: { name: "التربية الدينية / الشرعية", emoji: "🕌", gradient: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 85% 45%))" },
  sharia: { name: "المواد الشرعية", emoji: "🕌", gradient: "linear-gradient(135deg, hsl(45 90% 50%), hsl(35 85% 45%))" },
  english: { name: "اللغة الإنجليزية", emoji: "🇬🇧", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(245 80% 50%))" },
  french: { name: "اللغة الفرنسية", emoji: "🇫🇷", gradient: "linear-gradient(135deg, hsl(230 80% 55%), hsl(210 75% 50%))" },
  math: { name: "الرياضيات", emoji: "📐", gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))" },
  science: { name: "العلوم", emoji: "🔬", gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))" },
  integrated_science: { name: "العلوم المتكاملة", emoji: "⚛️", gradient: "linear-gradient(135deg, hsl(200 80% 50%), hsl(160 75% 45%))" },
  scientific: { name: "المواد العلمية", emoji: "⚛️", gradient: "linear-gradient(135deg, hsl(220 85% 55%), hsl(190 80% 50%))" },
  literary: { name: "المواد الأدبية", emoji: "📚", gradient: "linear-gradient(135deg, hsl(28 90% 55%), hsl(20 85% 45%))" },
  studies: { name: "الدراسات الاجتماعية", emoji: "🌍", gradient: "linear-gradient(135deg, hsl(265 80% 60%), hsl(255 75% 50%))" },
};

// Per-subject emoji hints (fallback = category emoji)
const SUBJECT_EMOJI: Record<string, string> = {
  "الفيزياء": "⚛️",
  "الكيمياء": "🧪",
  "الأحياء": "🧬",
  "الرياضيات": "📐",
  "الجبر": "➗",
  "الهندسة": "📏",
  "التفاضل والتكامل": "∫",
  "الإحصاء": "📊",
  "التاريخ": "📜",
  "الجغرافيا": "🌍",
  "الفلسفة": "🧠",
  "المنطق": "🔎",
  "علم النفس": "🧠",
  "علم الاجتماع": "👥",
  "الاقتصاد": "💹",
  "الإحصاء والاقتصاد": "📈",
  "النحو": "📝",
  "الأدب": "📖",
  "البلاغة": "🌹",
  "النصوص": "📄",
  "القراءة": "📚",
  "الإملاء": "✍️",
  "التعبير": "🗣️",
  "الصرف": "🔤",
  "اللغة العربية": "📖",
  "اللغة الإنجليزية": "🇬🇧",
  "اللغة الفرنسية": "🇫🇷",
  "اللغة الألمانية": "🇩🇪",
  "العلوم": "🔬",
  "التربية الدينية": "🕌",
  "القرآن الكريم": "📗",
  "التفسير": "📔",
  "الحديث": "📕",
  "الفقه": "⚖️",
  "التوحيد": "☪️",
  "السيرة": "📜",
};

function resolveCategoryLabel(category: string) {
  const def = getCategoryDef(category);
  if (def) return { name: def.name, emoji: def.emoji, gradient: def.gradient };
  const fb = CATEGORY_FALLBACK[category];
  if (fb) return fb;
  return { name: category, emoji: "📘", gradient: "linear-gradient(135deg, hsl(220 20% 50%), hsl(220 20% 40%))" };
}

// ---------- Page ----------
export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [stage, setStage] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [section, setSection] = useState<string>(""); // "" means no section (preparatory)
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // key (category::name) -> input value
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // Reset dependent filters
  useEffect(() => { setGrade(""); setSection(""); setDrafts({}); }, [stage]);
  useEffect(() => { setSection(""); setDrafts({}); }, [grade]);
  useEffect(() => { setDrafts({}); }, [section]);

  const showSection = stage === "secondary";
  const canLoad = stage && grade && (!showSection || section);

  // ---------- Fetch subjects for filter ----------
  const subjectsQuery = useQuery({
    queryKey: ["admin-subs-subjects", stage, grade, section, showSection],
    enabled: !!canLoad,
    queryFn: async () => {
      let q = supabase.from("subjects").select("stage,grade,section,category,name").eq("is_active", true);
      q = q.eq("stage", stage).eq("grade", grade);
      if (showSection) q = q.eq("section", section);
      else q = q.is("section", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SubjectRow[];
    },
  });

  // ---------- Fetch prices for same filter (per-subject) ----------
  const pricesQuery = useQuery({
    queryKey: ["admin-subs-prices", stage, grade, section, showSection],
    enabled: !!canLoad,
    queryFn: async () => {
      let q = supabase
        .from("subject_default_prices")
        .select("stage,grade,section,category,subject_name,price,updated_at")
        .eq("education_type", "both")
        .eq("stage", stage)
        .eq("grade", grade)
        .not("subject_name", "is", null);
      if (showSection) q = q.eq("section", section);
      else q = q.is("section", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PriceRow[];
    },
  });

  // ---------- Merge subjects with their price ----------
  const subjects: SubjectEntry[] = useMemo(() => {
    const subs = subjectsQuery.data || [];
    const prices = pricesQuery.data || [];
    const priceByKey: Record<string, PriceRow> = {};
    prices.forEach((p) => {
      if (p.subject_name) priceByKey[`${p.category}::${p.subject_name}`] = p;
    });

    // Deduplicate (category, name) — same subject may exist under different sections but here filter already fixes it
    const seen = new Set<string>();
    const list: SubjectEntry[] = [];
    subs.forEach((s) => {
      const key = `${s.category}::${s.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      const label = resolveCategoryLabel(s.category);
      const price = priceByKey[key];
      list.push({
        key,
        category: s.category,
        name: s.name,
        categoryLabel: label.name,
        gradient: label.gradient,
        emoji: SUBJECT_EMOJI[s.name] || label.emoji,
        price: price ? Number(price.price) : null,
        updated_at: price?.updated_at || null,
      });
    });

    return list.sort((a, b) => {
      const c = a.categoryLabel.localeCompare(b.categoryLabel, "ar");
      if (c !== 0) return c;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [subjectsQuery.data, pricesQuery.data]);

  const filteredSubjects = useMemo(() => {
    if (!search.trim()) return subjects;
    const s = search.trim().toLowerCase();
    return subjects.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.categoryLabel.toLowerCase().includes(s) ||
        c.category.toLowerCase().includes(s)
    );
  }, [subjects, search]);

  // Group by category label for display sections
  const grouped = useMemo(() => {
    const map = new Map<string, SubjectEntry[]>();
    filteredSubjects.forEach((s) => {
      const arr = map.get(s.categoryLabel) || [];
      arr.push(s);
      map.set(s.categoryLabel, arr);
    });
    return Array.from(map.entries());
  }, [filteredSubjects]);

  const pricedCount = subjects.filter((c) => c.price != null).length;
  const unpricedCount = subjects.length - pricedCount;
  const avgPrice = pricedCount
    ? Math.round(subjects.filter((c) => c.price != null).reduce((s, c) => s + (c.price || 0), 0) / pricedCount)
    : 0;

  // ---------- Save one ----------
  const savePrice = useCallback(async (entry: SubjectEntry, valueRaw: string) => {
    const value = parseFloat(valueRaw);
    if (isNaN(value) || value < 0) {
      toast.error("أدخل سعرًا صحيحًا");
      return false;
    }
    setSavingKey(entry.key);
    try {
      const payload = {
        education_type: "both",
        stage,
        grade,
        section: showSection ? section : null,
        category: entry.category,
        subject_name: entry.name,
        price: value,
      };
      const { error } = await supabase
        .from("subject_default_prices")
        .upsert(payload, { onConflict: "education_type,stage,grade,section,category,subject_name" });
      if (error) throw error;
      setDrafts((d) => { const n = { ...d }; delete n[entry.key]; return n; });
      await qc.invalidateQueries({ queryKey: ["admin-subs-prices", stage, grade, section, showSection] });
      return true;
    } catch (e: any) {
      console.error("[subscriptions] save error:", e);
      toast.error(e?.message || "تعذر حفظ السعر");
      return false;
    } finally {
      setSavingKey(null);
    }
  }, [stage, grade, section, showSection, qc]);

  // ---------- Save all dirty ----------
  const saveAll = useCallback(async () => {
    const entries = Object.entries(drafts);
    if (!entries.length) { toast.info("لا يوجد تغييرات لحفظها"); return; }
    setSavingAll(true);
    let ok = 0, fail = 0;
    const byKey = new Map(subjects.map((s) => [s.key, s]));
    for (const [key, val] of entries) {
      const entry = byKey.get(key);
      if (!entry) { fail++; continue; }
      const success = await savePrice(entry, val);
      if (success) ok++; else fail++;
    }
    setSavingAll(false);
    if (fail === 0) toast.success(`تم حفظ ${ok} مادة بنجاح`);
    else toast.error(`نجح ${ok} — فشل ${fail}`);
  }, [drafts, savePrice, subjects]);

  // ---------- UI ----------
  const loading = subjectsQuery.isLoading || pricesQuery.isLoading;
  const dirtyCount = Object.keys(drafts).length;

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
              كل مادة مستقلة بسعرها الخاص — اختر المرحلة والصف لعرض جميع المواد الحقيقية من قاعدة البيانات
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-sm">
          {/* Stage */}
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
                <Sparkles className="h-4 w-4 text-muted-foreground" />
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

        {/* Results */}
        {!canLoad ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
            <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              اختر المرحلة والصف {showSection ? "والشعبة" : ""} لعرض المواد وتحديد أسعارها
            </p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-bold mb-1">لا توجد مواد لهذا الاختيار</p>
            <p className="text-xs text-muted-foreground">
              أضف مواد إلى هذا الصف من صفحة إدارة المواد وستظهر هنا تلقائيًا
            </p>
          </div>
        ) : (
          <>
            {/* Stats + search + save all */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/40 p-2">
                  <div className="text-lg font-extrabold text-foreground">{subjects.length}</div>
                  <div className="text-[11px] text-muted-foreground">إجمالي المواد</div>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-2">
                  <div className="text-lg font-extrabold text-emerald-600">{pricedCount}</div>
                  <div className="text-[11px] text-muted-foreground">مسعّرة</div>
                </div>
                <div className="rounded-xl bg-amber-500/10 p-2">
                  <div className="text-lg font-extrabold text-amber-600">{unpricedCount}</div>
                  <div className="text-[11px] text-muted-foreground">بدون سعر</div>
                </div>
              </div>
              {pricedCount > 0 && (
                <div className="text-center text-xs text-muted-foreground">
                  متوسط السعر: <span className="font-bold text-foreground">{avgPrice} جنيه</span>
                </div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث عن مادة..."
                    className="pr-9"
                  />
                </div>
                <Button
                  onClick={saveAll}
                  disabled={savingAll || dirtyCount === 0}
                  className="gap-2 shrink-0"
                >
                  {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  حفظ الكل {dirtyCount > 0 && `(${dirtyCount})`}
                </Button>
              </div>
            </div>

            {/* Grouped subject cards */}
            {grouped.map(([catLabel, items]) => (
              <div key={catLabel} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  <h2 className="text-sm font-extrabold text-foreground">{catLabel}</h2>
                  <span className="text-[11px] text-muted-foreground">({items.length})</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((c) => {
                    const draft = drafts[c.key];
                    const displayValue = draft !== undefined ? draft : (c.price != null ? String(c.price) : "");
                    const isDirty = draft !== undefined && draft !== (c.price != null ? String(c.price) : "");
                    const isSaving = savingKey === c.key;

                    return (
                      <div
                        key={c.key}
                        className={cn(
                          "rounded-2xl border-2 bg-card p-4 shadow-sm transition-all",
                          isDirty ? "border-primary/60 ring-2 ring-primary/20" : "border-border"
                        )}
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div
                            className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-sm"
                            style={{ background: c.gradient }}
                          >
                            {c.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-extrabold text-foreground truncate">{c.name}</h3>
                              {c.price != null ? (
                                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 ml-1" />
                                  مسعّرة
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-600 border-amber-500/40 text-[10px]">
                                  بدون سعر
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{c.categoryLabel}</p>
                            {c.updated_at && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                آخر تحديث: {new Date(c.updated_at).toLocaleDateString("ar-EG")}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              type="number"
                              min={0}
                              value={displayValue}
                              onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
                              placeholder="السعر"
                              className="pl-14 text-base font-bold text-center"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">جنيه</span>
                          </div>
                          <Button
                            size="sm"
                            variant={isDirty ? "default" : "outline"}
                            disabled={!isDirty || isSaving}
                            onClick={() => savePrice(c, displayValue)}
                            className="gap-1"
                          >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            حفظ
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredSubjects.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                لا نتائج للبحث "{search}"
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
