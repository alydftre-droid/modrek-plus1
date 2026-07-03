import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DSProvider } from "@/design-system";
import { Input } from "@/components/ui/input";
import {
  Library, Plus, Search, BookOpen, FileText, ClipboardList,
  Database, Landmark, NotebookPen, File as FileIcon, Loader2,
  ImageIcon, Layers, Brain, ChevronDown, LayoutGrid, List,
  Eye, Pencil, Trash2, RefreshCw, BarChart3, FolderOpen, MoreVertical,
  Sparkles, TrendingUp, ChevronLeft, UserRound, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ModrekUploadWizard from "@/components/admin/modrek/ModrekUploadWizard";
import { DSBadge, DSButton } from "@/design-system";

type SourceType = { id: string; code: string; name_ar: string; icon: string | null; sort_order: number };
type Source = {
  id: string; title: string; description: string | null; author: string | null;
  status: string; source_type_id: string; stage_id: string | null; grade_id: string | null;
  section_id: string | null; track_id: string | null; subject_id: string | null;
  sub_subject_id: string | null; term: number | null; created_at: string; updated_at: string;
  cover_asset_id: string | null; metadata: any;
};
type Taxo = { id: string; name_ar: string; code: string };
type Grade = Taxo & { stage_id: string };
type Subject = Taxo & { stage_id: string | null; section_id: string | null };
type SubSubject = Taxo & { subject_id: string };

const ICONS: Record<string, any> = {
  book: BookOpen, booklet: NotebookPen, notebook: NotebookPen, "file-text": FileText,
  clipboard: ClipboardList, "file-check": ClipboardList, landmark: Landmark,
  database: Database, images: ImageIcon, file: FileIcon, user: UserRound,
};

const ICON_BY_CODE: Record<string, any> = {
  book: BookOpen,
  booklet: NotebookPen,
  notes: NotebookPen,
  summary: FileText,
  worksheet: ClipboardList,
  exam: ClipboardList,
  ministry_model: Landmark,
  ministry: Landmark,
  question_bank: Database,
  images: ImageIcon,
  teacher_file: UserRound,
  other: FileIcon,
};

const TYPE_HERO: Record<string, { bg: string; icon: string; grad: string; shadow: string }> = {
  book:           { bg: "from-blue-600 to-indigo-700",     icon: "bg-blue-500",     grad: "from-blue-500 to-indigo-600",     shadow: "shadow-blue-500/25" },
  booklet:        { bg: "from-emerald-600 to-teal-700",    icon: "bg-emerald-500",  grad: "from-emerald-500 to-teal-600",  shadow: "shadow-emerald-500/25" },
  notes:          { bg: "from-violet-600 to-purple-700",   icon: "bg-violet-500",   grad: "from-violet-500 to-purple-600", shadow: "shadow-violet-500/25" },
  notebook:       { bg: "from-violet-600 to-purple-700",   icon: "bg-violet-500",   grad: "from-violet-500 to-purple-600", shadow: "shadow-violet-500/25" },
  summary:        { bg: "from-sky-600 to-blue-700",        icon: "bg-sky-500",      grad: "from-sky-500 to-blue-600",       shadow: "shadow-sky-500/25" },
  worksheet:      { bg: "from-lime-600 to-emerald-700",    icon: "bg-lime-600",     grad: "from-lime-600 to-emerald-600",   shadow: "shadow-lime-500/25" },
  exam:           { bg: "from-amber-500 to-orange-700",    icon: "bg-amber-500",    grad: "from-amber-500 to-orange-600",   shadow: "shadow-amber-500/25" },
  ministry_model: { bg: "from-slate-700 to-slate-950",     icon: "bg-slate-700",    grad: "from-slate-700 to-slate-900",    shadow: "shadow-slate-500/25" },
  ministry:       { bg: "from-slate-700 to-slate-950",     icon: "bg-slate-700",    grad: "from-slate-700 to-slate-900",    shadow: "shadow-slate-500/25" },
  question_bank:  { bg: "from-rose-600 to-pink-700",       icon: "bg-rose-500",     grad: "from-rose-500 to-pink-600",      shadow: "shadow-rose-500/25" },
  images:         { bg: "from-cyan-600 to-sky-700",        icon: "bg-cyan-500",     grad: "from-cyan-500 to-sky-600",       shadow: "shadow-cyan-500/25" },
  teacher_file:   { bg: "from-teal-600 to-cyan-700",       icon: "bg-teal-500",     grad: "from-teal-500 to-cyan-600",      shadow: "shadow-teal-500/25" },
  other:          { bg: "from-neutral-600 to-neutral-800", icon: "bg-neutral-500",  grad: "from-neutral-500 to-neutral-700", shadow: "shadow-neutral-500/25" },
};

export default function ModrekLibraryPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [types, setTypes] = useState<SourceType[]>([]);
  const [stages, setStages] = useState<Taxo[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [sections, setSections] = useState<Taxo[]>([]);
  const [tracks, setTracks] = useState<Taxo[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subSubjects, setSubSubjects] = useState<SubSubject[]>([]);
  const [sources, setSources] = useState<Source[]>([]);

  const [q, setQ] = useState("");
  const [fType, setFType] = useState<string>("all");
  const [f, setF] = useState({
    stage: "", grade: "", section: "", track: "", subject: "", sub: "",
  });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"new" | "old" | "title">("new");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [presetType, setPresetType] = useState<string | null>(null);

  const applyBootstrapPayload = (payload: any) => {
    setTypes((payload.types ?? []) as any);
    setStages((payload.stages ?? []) as any);
    setGrades((payload.grades ?? []) as any);
    setSections((payload.sections ?? []) as any);
    setTracks((payload.tracks ?? []) as any);
    setSubjects((payload.subjects ?? []) as any);
    setSubSubjects((payload.subSubjects ?? []) as any);
    setSources((payload.sources ?? []) as any);
  };

  const loadAllFromTables = async () => {
    const [typesRes, stagesRes, gradesRes, sectionsRes, tracksRes, subjectsRes, subSubjectsRes, sourcesRes] = await Promise.all([
      supabase.from("knowledge_source_types").select("*").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("library_stages").select("id,name_ar,code").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("library_grades").select("id,name_ar,code,stage_id").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("library_sections").select("id,name_ar,code").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("library_tracks").select("id,name_ar,code").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("library_subjects").select("id,name_ar,code,stage_id,section_id").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("library_sub_subjects").select("id,name_ar,code,subject_id").eq("is_active", true).order("sort_order", { ascending: true }).order("name_ar", { ascending: true }),
      supabase.from("knowledge_sources").select("*").order("created_at", { ascending: false }),
    ]);

    const failed = [typesRes, stagesRes, gradesRes, sectionsRes, tracksRes, subjectsRes, subSubjectsRes, sourcesRes].find((res) => res.error);
    if (failed?.error) throw failed.error;

    applyBootstrapPayload({
      types: typesRes.data ?? [],
      stages: stagesRes.data ?? [],
      grades: gradesRes.data ?? [],
      sections: sectionsRes.data ?? [],
      tracks: tracksRes.data ?? [],
      subjects: subjectsRes.data ?? [],
      subSubjects: subSubjectsRes.data ?? [],
      sources: sourcesRes.data ?? [],
    });
  };

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("get_modrek_library_bootstrap" as any);
      if (error) {
        const message = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
        const isSchemaCacheMiss = message.includes("schema cache") || message.includes("could not find the function") || message.includes("pgrst202");
        if (!isSchemaCacheMiss) throw error;
        await loadAllFromTables();
        toast.info("تم تحميل بيانات المكتبة مباشرة من قاعدة البيانات");
        return;
      }
      applyBootstrapPayload((data ?? {}) as any);
    } catch (e: any) {
      console.error("Modrek library load failed", e);
      setLoadError(e?.message || "تعذر تحميل بيانات المكتبة");
      toast.error("تعذر تحميل بيانات المكتبة");
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const filteredGrades = useMemo(() => grades.filter((g) => !f.stage || g.stage_id === f.stage), [grades, f.stage]);
  const filteredSubjects = useMemo(() => subjects.filter((s) => {
    const sectionCode = sections.find((sec) => sec.id === f.section)?.code;
    if (f.stage && s.stage_id && s.stage_id !== f.stage) return false;
    if (sectionCode === "shared") return true;
    if (f.section && s.section_id && s.section_id !== f.section) return false;
    return true;
  }), [subjects, sections, f.stage, f.section]);
  const filteredSubs = useMemo(() => subSubjects.filter((s) => !f.subject || s.subject_id === f.subject), [subSubjects, f.subject]);

  const filtered = useMemo(() => {
    let list = sources.filter((s) => {
      if (fType !== "all" && s.source_type_id !== fType) return false;
      if (f.stage && s.stage_id !== f.stage) return false;
      if (f.grade && s.grade_id !== f.grade) return false;
      if (f.section && s.section_id !== f.section) return false;
      if (f.track && s.track_id !== f.track) return false;
      if (f.subject && s.subject_id !== f.subject) return false;
      if (f.sub && s.sub_subject_id !== f.sub) return false;
      if (q && !s.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    if (sort === "old") list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "ar"));
    return list;
  }, [sources, q, fType, f, sort]);

  const typeById = (id: string) => types.find((t) => t.id === id);
  const nameById = <T extends { id: string; name_ar: string }>(list: T[], id: string | null) =>
    (id && list.find((x) => x.id === id)?.name_ar) || "—";

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    sources.forEach((s) => { byType[s.source_type_id] = (byType[s.source_type_id] ?? 0) + 1; });
    return {
      total: sources.length,
      ready: sources.filter((s) => s.status === "ready").length,
      processing: sources.filter((s) => s.status === "processing").length,
      draft: sources.filter((s) => s.status === "draft").length,
      byType,
    };
  }, [sources]);

  const anyFilter = fType !== "all" || f.stage || f.grade || f.section || f.track || f.subject || f.sub || q;

  const resetFilters = () => {
    setFType("all");
    setF({ stage: "", grade: "", section: "", track: "", subject: "", sub: "" });
    setQ("");
  };

  const openWizard = (typeCode?: string | null) => {
    setPresetType(typeCode ?? null);
    setWizardOpen(true);
  };

  return (
    <DSProvider>
      <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] via-[#F8FAFC] to-[#F5F3FF]">
        <div className="max-w-[1500px] mx-auto p-4 md:p-8 space-y-6">
          {/* Hero Header — strong gradient, white text, no washed-out whites */}
          <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F172A] via-[#1D4ED8] to-[#7C3AED] shadow-[0_24px_55px_-16px_rgba(29,78,216,0.52)] ring-1 ring-white/50">
            {/* decorative glow */}
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[#F59E0B]/20 blur-3xl" />

            <div className="relative p-5 md:p-8">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 md:h-16 md:w-16 rounded-[18px] bg-white/15 backdrop-blur-sm border border-white/25 text-white flex items-center justify-center shrink-0">
                    <Library className="h-7 w-7 md:h-8 md:w-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl md:text-3xl font-black text-white">Modrek AI Library</h1>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F59E0B] text-[#78350F] shadow">
                        <Sparkles className="h-3 w-3" /> Knowledge Base
                      </span>
                    </div>
                    <p className="text-xs md:text-sm text-white/85 mt-1">
                      إدارة قاعدة المعرفة الخاصة بالمساعد الذكي — كتب، ملازم، مذكرات، امتحانات، وأكثر.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openWizard()}
                  className="h-12 px-6 rounded-[14px] bg-gradient-to-l from-[#F59E0B] to-[#F97316] text-white font-black text-sm shadow-lg shadow-orange-500/30 hover:from-[#D97706] hover:to-[#EA580C] hover:shadow-xl transition-all inline-flex items-center gap-2 ring-1 ring-white/30"
                >
                  <Plus className="h-5 w-5" /> إضافة مصدر جديد
                </button>
              </div>

              {/* Quick upload chips — colored, no white */}
              <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
                {types.map((type) => {
                  const hero = TYPE_HERO[type.code] ?? TYPE_HERO.other;
                  const Icon = ICON_BY_CODE[type.code] ?? ICONS[type.icon ?? "file"] ?? FileIcon;
                  return (
                    <QuickUploadChip
                      key={type.id}
                      icon={Icon}
                      label={`رفع ${type.name_ar}`}
                      onClick={() => openWizard(type.code)}
                      color={hero.grad}
                    />
                  );
                })}
              </div>
            </div>
          </div>


          {loadError && (
            <div className="rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-[#B91C1C] flex items-start gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-bold text-sm">تعذر تحميل بيانات مكتبة Modrek AI</div>
                <div className="text-xs mt-1 break-words">{loadError}</div>
                <button onClick={loadAll} className="mt-2 text-xs font-bold underline underline-offset-4">إعادة المحاولة</button>
              </div>
            </div>
          )}

          {/* Top stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <BigStat label="إجمالي المصادر" value={stats.total} icon={Layers} tone="blue" trend="+" />
            <BigStat label="جاهزة للاستخدام" value={stats.ready} icon={Brain} tone="emerald" />
            <BigStat label="قيد المعالجة" value={stats.processing} icon={Loader2} tone="amber" spin={stats.processing > 0} />
            <BigStat label="مسودات" value={stats.draft} icon={FileText} tone="slate" />
          </div>

          {/* Source-type cards */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base md:text-lg font-black text-[#0F172A] flex items-center gap-2">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white flex items-center justify-center shadow-md"><FolderOpen className="h-4 w-4" /></span> أنواع المصادر
              </h2>
              <button
                onClick={() => { setFType("all"); }}
                className={cn("text-xs font-black h-9 px-3 rounded-xl transition-all shadow-sm", fType === "all" ? "bg-[#2563EB] text-white" : "bg-[#334155] text-white hover:bg-[#0F172A]")}
              >عرض الكل</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 md:gap-3">
              {types.map((t) => {
                const Icon = ICON_BY_CODE[t.code] ?? ICONS[t.icon ?? "file"] ?? FileIcon;
                const active = fType === t.id;
                const hero = TYPE_HERO[t.code] ?? TYPE_HERO.other;
                return (
                  <button
                    key={t.id}
                    onClick={() => setFType(active ? "all" : t.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border-2 p-3 md:p-4 text-right transition-all min-h-[118px] bg-gradient-to-br text-white shadow-lg",
                      hero.bg,
                      hero.shadow,
                      active
                        ? "border-white ring-4 ring-[#2563EB]/25 scale-[1.02]"
                        : "border-white/20 hover:border-white hover:shadow-xl hover:-translate-y-0.5",
                    )}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_38%)]" />
                    <div className={cn(
                      "relative h-10 w-10 rounded-xl flex items-center justify-center text-white shadow mb-2 bg-white/20 ring-1 ring-white/25 backdrop-blur-sm",
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="relative font-black text-sm text-white truncate">{t.name_ar}</div>
                    <div className="relative mt-1 text-[11px] text-white/80">
                      <span className="font-black text-white text-sm tabular-nums">{stats.byType[t.id] ?? 0}</span> مصدر
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Cascading filters — grouped, professional */}
          <section className="rounded-[20px] border-2 border-[#BFDBFE] bg-gradient-to-br from-white via-[#F8FAFC] to-[#EFF6FF] p-4 md:p-5 shadow-[0_12px_30px_-18px_rgba(37,99,235,0.45)]">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white flex items-center justify-center shadow-md">
                  <Search className="h-4 w-4" />
                </div>
                <span className="font-black text-base text-[#0F172A]">فلترة ذكية</span>
                <span className="text-[11px] text-[#475569] font-bold">— اختر النطاق التعليمي والمادة</span>
              </div>
              {anyFilter && (
                <button
                  onClick={resetFilters}
                  className="text-xs font-bold text-white bg-[#DC2626] hover:bg-[#B91C1C] px-3 h-8 rounded-lg flex items-center gap-1.5 shadow-sm transition"
                >
                  <RefreshCw className="h-3 w-3" /> إعادة تعيين
                </button>
              )}
            </div>

            {/* Row 1: Academic scope (stage + grade + section + track) */}
            <div className="rounded-2xl bg-gradient-to-l from-[#EFF6FF] to-white border-2 border-[#BFDBFE] p-3 mb-3">
              <div className="text-[11px] font-black text-[#1D4ED8] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> النطاق الأكاديمي</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <FilterSelect label="المرحلة" value={f.stage} onChange={(v) => setF((x) => ({ ...x, stage: v, grade: "", subject: "", sub: "" }))} options={stages} accent="blue" />
                <FilterSelect label="الصف" value={f.grade} onChange={(v) => setF((x) => ({ ...x, grade: v }))} options={filteredGrades} disabled={!f.stage} accent="blue" />
                <FilterSelect label="النظام (عام/أزهر)" value={f.section} onChange={(v) => setF((x) => ({ ...x, section: v, subject: "", sub: "" }))} options={sections} accent="purple" />
                <FilterSelect label="الشعبة" value={f.track} onChange={(v) => setF((x) => ({ ...x, track: v }))} options={tracks} accent="purple" />
              </div>
            </div>

            {/* Row 2: Subject scope + search */}
            <div className="rounded-2xl bg-gradient-to-l from-[#ECFDF5] to-white border-2 border-[#A7F3D0] p-3">
              <div className="text-[11px] font-black text-[#047857] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> المادة والبحث</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <FilterSelect label="المادة" value={f.subject} onChange={(v) => setF((x) => ({ ...x, subject: v, sub: "" }))} options={filteredSubjects} accent="emerald" />
                <FilterSelect label="المادة الفرعية" value={f.sub} onChange={(v) => setF((x) => ({ ...x, sub: v }))} options={filteredSubs} disabled={!f.subject} accent="emerald" />
                <div className="relative">
                  <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#059669]" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ابحث عن مصدر بالاسم..."
                    className="w-full h-10 rounded-[10px] border-2 border-[#DCFCE7] bg-white pr-9 pl-3 text-sm font-semibold text-[#0F172A] placeholder:text-[#94A3B8] placeholder:font-normal focus:outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/20 transition"
                  />
                </div>
              </div>
            </div>

            {/* Breadcrumb */}
            {anyFilter && (
              <div className="mt-3 pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-1 text-xs">
                <span className="text-[#64748B] font-semibold">المسار النشط:</span>
                <Crumb label="المكتبة" />
                {fType !== "all" && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={typeById(fType)?.name_ar ?? ""} /></>}
                {f.stage && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={nameById(stages, f.stage)} /></>}
                {f.grade && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={nameById(grades, f.grade)} /></>}
                {f.section && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={nameById(sections, f.section)} /></>}
                {f.track && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={nameById(tracks, f.track)} /></>}
                {f.subject && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={nameById(subjects, f.subject)} /></>}
                {f.sub && <><ChevronLeft className="h-3 w-3 text-[#94A3B8]" /><Crumb label={nameById(subSubjects, f.sub)} /></>}
              </div>
            )}
          </section>


          {/* Results toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-slate-600">
              <span className="font-bold text-slate-900 tabular-nums">{filtered.length}</span> مصدر
              {filtered.length !== stats.total && <span className="text-slate-400 mr-1"> من {stats.total}</span>}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-9 rounded-xl border-2 border-[#BFDBFE] bg-[#EFF6FF] pr-3 pl-8 text-xs font-black text-[#1D4ED8] appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="new">الأحدث أولاً</option>
                  <option value="old">الأقدم أولاً</option>
                  <option value="title">أبجدياً</option>
                </select>
                <ChevronDown className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="inline-flex rounded-xl border-2 border-[#BFDBFE] bg-[#DBEAFE] overflow-hidden shadow-sm">
                <button onClick={() => setView("grid")} className={cn("p-2 transition", view === "grid" ? "bg-[#2563EB] text-white" : "bg-[#DBEAFE] text-[#1D4ED8] hover:bg-[#BFDBFE]")}>
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button onClick={() => setView("list")} className={cn("p-2 transition", view === "list" ? "bg-[#2563EB] text-white" : "bg-[#DBEAFE] text-[#1D4ED8] hover:bg-[#BFDBFE]")}>
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="h-56 rounded-2xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-[#93C5FD] p-12 text-center bg-gradient-to-br from-[#EFF6FF] via-white to-[#F5F3FF] shadow-inner">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center text-white mb-3 shadow-lg">
                <Library className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-slate-800">لا توجد مصادر بعد</h3>
              <p className="text-xs text-slate-500 mt-1">ابدأ ببناء قاعدة المعرفة عبر رفع أول مصدر.</p>
              <DSButton className="mt-4" onClick={() => openWizard()}>
                <Plus className="h-4 w-4 ml-2" /> إضافة أول مصدر
              </DSButton>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((s) => {
                const t = typeById(s.source_type_id);
                const hero = TYPE_HERO[t?.code ?? "other"] ?? TYPE_HERO.other;
                const Icon = ICON_BY_CODE[t?.code ?? "other"] ?? ICONS[t?.icon ?? "file"] ?? FileIcon;
                return (
                    <div key={s.id} className="group rounded-2xl border-2 border-[#E2E8F0] bg-white overflow-hidden hover:shadow-xl hover:border-blue-300 transition-all">
                    {/* Cover */}
                    <Link to={`/admin/modrek-library/${s.id}`} className="block">
                      <div className={cn("relative h-32 bg-gradient-to-br flex items-center justify-center", hero.bg)}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_38%)]" />
                        <div className={cn("h-16 w-16 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shadow-lg", hero.grad)}>
                          <Icon className="h-8 w-8" />
                        </div>
                        <div className="absolute top-2 right-2">
                          <StatusPill status={s.status} />
                        </div>
                        <div className="absolute top-2 left-2">
                          <DSBadge tone="neutral" className="text-[10px] bg-white/90 backdrop-blur">{t?.name_ar}</DSBadge>
                        </div>
                      </div>
                    </Link>
                    {/* Body */}
                    <div className="p-3">
                      <Link to={`/admin/modrek-library/${s.id}`}>
                        <h3 className="font-bold text-sm text-slate-900 line-clamp-2 min-h-[40px] hover:text-blue-600">{s.title}</h3>
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.stage_id && <DSBadge tone="neutral" className="text-[9px] h-5 px-1.5">{nameById(stages, s.stage_id)}</DSBadge>}
                        {s.subject_id && <DSBadge tone="info" className="text-[9px] h-5 px-1.5">{nameById(subjects, s.subject_id)}</DSBadge>}
                        {s.term && <DSBadge tone="purple" className="text-[9px] h-5 px-1.5">ترم {s.term}</DSBadge>}
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400">
                        آخر تحديث: {new Date(s.updated_at || s.created_at).toLocaleDateString("ar-EG")}
                      </div>
                      {/* Actions */}
                      <div className="mt-2 pt-2 border-t flex items-center justify-between">
                        <div className="flex items-center gap-0.5">
                          <ActionIconBtn title="فتح" onClick={() => nav(`/admin/modrek-library/${s.id}`)} icon={Eye} tone="blue" />
                          <ActionIconBtn title="تعديل" onClick={() => nav(`/admin/modrek-library/${s.id}`)} icon={Pencil} tone="slate" />
                          <ActionIconBtn title="الإحصائيات" onClick={() => nav(`/admin/modrek-library/${s.id}`)} icon={BarChart3} tone="violet" />
                          <ActionIconBtn title="إعادة المعالجة" onClick={() => nav(`/admin/modrek-library/${s.id}`)} icon={RefreshCw} tone="amber" />
                        </div>
                        <button className="h-7 w-7 rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C] inline-flex items-center justify-center shadow-sm transition" title="المزيد">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-[#E2E8F0] bg-white overflow-hidden shadow-sm">
              {filtered.map((s, i) => {
                const t = typeById(s.source_type_id);
                const hero = TYPE_HERO[t?.code ?? "other"] ?? TYPE_HERO.other;
                const Icon = ICON_BY_CODE[t?.code ?? "other"] ?? ICONS[t?.icon ?? "file"] ?? FileIcon;
                return (
                  <Link key={s.id} to={`/admin/modrek-library/${s.id}`}
                    className={cn("flex items-center gap-3 p-3 hover:bg-[#EFF6FF] transition", i > 0 && "border-t")}>
                    <div className={cn("h-11 w-11 rounded-lg bg-gradient-to-br text-white flex items-center justify-center shrink-0", hero.grad)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">{s.title}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{t?.name_ar}</span>
                        {s.stage_id && <span>· {nameById(stages, s.stage_id)}</span>}
                        {s.subject_id && <span>· {nameById(subjects, s.subject_id)}</span>}
                      </div>
                    </div>
                    <StatusPill status={s.status} />
                    <ChevronLeft className="h-4 w-4 text-slate-400" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ModrekUploadWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => nav(`/admin/modrek-library/${id}`)}
        presetTypeCode={presetType}
        types={types} stages={stages} grades={grades}
        sections={sections} tracks={tracks} subjects={subjects} subSubjects={subSubjects}
        typeCounts={stats.byType}
      />
    </DSProvider>
  );
}

// ---------- Sub-components ----------
function QuickUploadChip({ icon: Icon, label, onClick, color }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 group inline-flex items-center gap-2 px-3.5 h-10 rounded-xl bg-gradient-to-br border border-white/25 hover:border-white transition-all text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5",
        color,
      )}
    >
      <span className="h-7 w-7 rounded-lg bg-white/20 text-white flex items-center justify-center shadow-sm ring-1 ring-white/25">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-xs font-black text-white">{label}</span>
      <Plus className="h-3.5 w-3.5 text-white/90" />
    </button>
  );
}

function BigStat({ label, value, icon: Icon, tone, trend, spin }: any) {
  const tones: any = {
    blue:    { bg: "from-[#2563EB] to-[#1D4ED8]", border: "border-blue-300",    icon: "bg-white/20", text: "text-white", shadow: "shadow-blue-500/25" },
    emerald: { bg: "from-[#059669] to-[#047857]", border: "border-emerald-300", icon: "bg-white/20", text: "text-white", shadow: "shadow-emerald-500/25" },
    amber:   { bg: "from-[#F59E0B] to-[#EA580C]", border: "border-amber-300",   icon: "bg-white/20", text: "text-white", shadow: "shadow-amber-500/25" },
    slate:   { bg: "from-[#475569] to-[#0F172A]", border: "border-slate-300",   icon: "bg-white/20", text: "text-white", shadow: "shadow-slate-500/25" },
  };
  const t = tones[tone];
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br border-2 p-4 md:p-5 shadow-xl hover:shadow-2xl transition-shadow text-white", t.bg, t.border, t.shadow)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_38%)]" />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs font-black text-white/85">{label}</div>
          <div className="mt-2 text-2xl md:text-3xl font-black text-white tabular-nums">{value.toLocaleString("ar-EG")}</div>
          {trend && <div className={cn("mt-1 text-[10px] font-bold flex items-center gap-1", t.text)}><TrendingUp className="h-3 w-3" /> نشط</div>}
        </div>
        <div className={cn("h-12 w-12 rounded-xl text-white flex items-center justify-center shadow-md ring-1 ring-white/25", t.icon)}>
          <Icon className={cn("h-5 w-5", spin && "animate-spin")} />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, disabled, accent = "blue" }: any) {
  const accents: any = {
    blue:    { ring: "focus:border-[#2563EB] focus:ring-[#2563EB]/20", border: "border-[#93C5FD]", bg: "bg-[#EFF6FF]", icon: "text-[#2563EB]" },
    purple:  { ring: "focus:border-[#7C3AED] focus:ring-[#7C3AED]/20", border: "border-[#C4B5FD]", bg: "bg-[#F5F3FF]", icon: "text-[#7C3AED]" },
    emerald: { ring: "focus:border-[#059669] focus:ring-[#059669]/20", border: "border-[#6EE7B7]", bg: "bg-[#ECFDF5]", icon: "text-[#059669]" },
  };
  const a = accents[accent] ?? accents.blue;
  return (
    <div className={cn("relative", disabled && "opacity-50 pointer-events-none")}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full h-10 rounded-[10px] border-2 pr-3 pl-8 text-xs font-black text-[#0F172A] appearance-none transition focus:outline-none focus:ring-2 disabled:bg-[#F1F5F9] disabled:border-[#E2E8F0] shadow-sm",
          a.border, a.bg, a.ring,
        )}
        disabled={disabled}
      >
        <option value="" className="font-normal text-[#64748B]">— {label} —</option>
        {options.map((o: any) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}
      </select>
      <ChevronDown className={cn("h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none", a.icon)} />
    </div>
  );
}

function Crumb({ label }: { label: string }) {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#EFF6FF] text-[#1D4ED8] font-bold text-[11px] border border-[#BFDBFE]">{label}</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: any = {
    draft:      { l: "مسودة",         c: "bg-slate-600 text-white" },
    processing: { l: "قيد المعالجة",   c: "bg-amber-500 text-white ring-2 ring-amber-200" },
    ready:      { l: "جاهز",           c: "bg-emerald-600 text-white" },
    archived:   { l: "مؤرشف",          c: "bg-slate-400 text-white" },
    failed:     { l: "فشل",            c: "bg-rose-600 text-white" },
  };
  const m = map[status] ?? map.draft;
  return <span className={cn("text-[10px] px-2 py-1 rounded-full font-black shadow-sm", m.c)}>{m.l}</span>;
}

function ActionIconBtn({ icon: Icon, title, onClick, tone }: any) {
  const tones: any = {
    blue:   "bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-blue-500/20",
    slate:  "bg-[#334155] text-white hover:bg-[#0F172A] shadow-slate-500/20",
    violet: "bg-[#7C3AED] text-white hover:bg-[#6D28D9] shadow-violet-500/20",
    amber:  "bg-[#F59E0B] text-white hover:bg-[#D97706] shadow-amber-500/20",
  };
  return (
    <button
      title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
      className={cn("h-7 w-7 inline-flex items-center justify-center rounded-md transition-all shadow-sm hover:shadow-md", tones[tone])}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

