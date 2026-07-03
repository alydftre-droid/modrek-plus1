import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DSProvider } from "@/design-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Library, Plus, Search, BookOpen, FileText, ClipboardList,
  Database, Landmark, NotebookPen, File as FileIcon, Loader2,
  ImageIcon, Layers, Brain, ChevronDown, LayoutGrid, List,
  Eye, Pencil, Trash2, RefreshCw, BarChart3, FolderOpen, MoreVertical,
  Sparkles, TrendingUp, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ModrekUploadWizard from "@/components/admin/modrek/ModrekUploadWizard";

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
  database: Database, images: ImageIcon, file: FileIcon,
};

const TYPE_HERO: Record<string, { bg: string; icon: string; grad: string }> = {
  book:          { bg: "from-blue-50 to-indigo-50",     icon: "bg-blue-500",     grad: "from-blue-500 to-indigo-600" },
  booklet:       { bg: "from-emerald-50 to-teal-50",    icon: "bg-emerald-500",  grad: "from-emerald-500 to-teal-600" },
  notebook:      { bg: "from-purple-50 to-fuchsia-50",  icon: "bg-purple-500",   grad: "from-purple-500 to-fuchsia-600" },
  exam:          { bg: "from-amber-50 to-orange-50",    icon: "bg-amber-500",    grad: "from-amber-500 to-orange-600" },
  ministry:      { bg: "from-slate-50 to-slate-100",    icon: "bg-slate-700",    grad: "from-slate-700 to-slate-900" },
  question_bank: { bg: "from-rose-50 to-pink-50",       icon: "bg-rose-500",     grad: "from-rose-500 to-pink-600" },
  images:        { bg: "from-cyan-50 to-sky-50",        icon: "bg-cyan-500",     grad: "from-cyan-500 to-sky-600" },
  other:         { bg: "from-neutral-50 to-neutral-100", icon: "bg-neutral-500", grad: "from-neutral-500 to-neutral-700" },
};

export default function ModrekLibraryPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
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

  const loadAll = async () => {
    setLoading(true);
    try {
      const [t, s, g, sec, tr, sub, ss, src] = await Promise.all([
        supabase.from("knowledge_source_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("library_stages").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_grades").select("id,name_ar,code,stage_id").eq("is_active", true).order("sort_order"),
        supabase.from("library_sections").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_tracks").select("id,name_ar,code").eq("is_active", true).order("sort_order"),
        supabase.from("library_subjects").select("id,name_ar,code,stage_id,section_id").eq("is_active", true).order("sort_order"),
        supabase.from("library_sub_subjects").select("id,name_ar,code,subject_id").eq("is_active", true).order("sort_order"),
        supabase.from("knowledge_sources").select("*").order("created_at", { ascending: false }),
      ]);
      setTypes((t.data ?? []) as any);
      setStages((s.data ?? []) as any);
      setGrades((g.data ?? []) as any);
      setSections((sec.data ?? []) as any);
      setTracks((tr.data ?? []) as any);
      setSubjects((sub.data ?? []) as any);
      setSubSubjects((ss.data ?? []) as any);
      setSources((src.data ?? []) as any);
    } catch (e: any) {
      console.error(e); toast.error("خطأ في تحميل المكتبة");
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const filteredGrades = useMemo(() => grades.filter((g) => !f.stage || g.stage_id === f.stage), [grades, f.stage]);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="max-w-[1500px] mx-auto p-4 md:p-8 space-y-6">
          {/* Hero Header */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-blue-50/40 to-violet-50/40 border shadow-sm">
            <div className="absolute top-0 left-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/3" />
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-violet-400/10 rounded-full blur-3xl translate-y-1/2 translate-x-1/3" />
            <div className="relative p-5 md:p-7">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 md:h-16 md:w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shadow-lg shrink-0">
                    <Library className="h-7 w-7 md:h-8 md:w-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl md:text-3xl font-black text-slate-900">Modrek AI Library</h1>
                      <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 border-0"><Sparkles className="h-3 w-3 ml-1" /> Knowledge Base</Badge>
                    </div>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">إدارة قاعدة المعرفة الخاصة بالمساعد الذكي — كتب، ملازم، مذكرات، امتحانات، وأكثر.</p>
                  </div>
                </div>
                <Button
                  onClick={() => openWizard()}
                  className="h-11 px-5 bg-gradient-to-l from-blue-600 to-violet-600 hover:opacity-90 text-white font-bold shadow-lg"
                >
                  <Plus className="h-4 w-4 ml-2" /> إضافة مصدر جديد
                </Button>
              </div>

              {/* Quick upload chips */}
              <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                <QuickUploadChip icon={BookOpen} label="رفع كتاب" onClick={() => openWizard("book")} color="from-blue-500 to-indigo-600" />
                <QuickUploadChip icon={NotebookPen} label="رفع ملزمة" onClick={() => openWizard("booklet")} color="from-emerald-500 to-teal-600" />
                <QuickUploadChip icon={ClipboardList} label="رفع امتحان" onClick={() => openWizard("exam")} color="from-amber-500 to-orange-600" />
                <QuickUploadChip icon={ImageIcon} label="رفع صور" onClick={() => openWizard("images")} color="from-cyan-500 to-sky-600" />
                <QuickUploadChip icon={Landmark} label="نموذج وزارة" onClick={() => openWizard("ministry")} color="from-slate-700 to-slate-900" />
                <QuickUploadChip icon={Database} label="بنك أسئلة" onClick={() => openWizard("question_bank")} color="from-rose-500 to-pink-600" />
              </div>
            </div>
          </div>

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
              <h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-slate-500" /> أنواع المصادر
              </h2>
              <button
                onClick={() => { setFType("all"); }}
                className={cn("text-xs font-semibold", fType === "all" ? "text-blue-600" : "text-slate-500 hover:text-blue-600")}
              >عرض الكل</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2 md:gap-3">
              {types.map((t) => {
                const Icon = ICONS[t.icon ?? "file"] ?? FileIcon;
                const active = fType === t.id;
                const hero = TYPE_HERO[t.code] ?? TYPE_HERO.other;
                return (
                  <button
                    key={t.id}
                    onClick={() => setFType(active ? "all" : t.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border-2 p-3 md:p-4 text-right transition-all",
                      active
                        ? "border-blue-500 shadow-lg scale-[1.02] bg-gradient-to-br " + hero.bg
                        : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md",
                    )}
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center text-white shadow mb-2 bg-gradient-to-br",
                      hero.grad,
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="font-bold text-sm text-slate-900 truncate">{t.name_ar}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      <span className="font-bold text-slate-800 text-sm tabular-nums">{stats.byType[t.id] ?? 0}</span> مصدر
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Cascading filters */}
          <section className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <span className="font-bold text-sm text-slate-800">فلترة ذكية</span>
              </div>
              {anyFilter && (
                <button onClick={resetFilters} className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> إعادة تعيين
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <FilterSelect label="المرحلة" value={f.stage} onChange={(v) => setF((x) => ({ ...x, stage: v, grade: "" }))} options={stages} />
              <FilterSelect label="الصف" value={f.grade} onChange={(v) => setF((x) => ({ ...x, grade: v }))} options={filteredGrades} disabled={!f.stage} />
              <FilterSelect label="القسم" value={f.section} onChange={(v) => setF((x) => ({ ...x, section: v }))} options={sections} />
              <FilterSelect label="الشعبة" value={f.track} onChange={(v) => setF((x) => ({ ...x, track: v }))} options={tracks} />
              <FilterSelect label="المادة" value={f.subject} onChange={(v) => setF((x) => ({ ...x, subject: v, sub: "" }))} options={subjects} />
              <FilterSelect label="المادة الفرعية" value={f.sub} onChange={(v) => setF((x) => ({ ...x, sub: v }))} options={filteredSubs} disabled={!f.subject} />
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="pr-7 h-9 text-xs" />
              </div>
            </div>

            {/* Breadcrumb */}
            {anyFilter && (
              <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-1 text-xs text-slate-500">
                <span className="text-slate-400">المسار:</span>
                <Crumb label="المكتبة" />
                {fType !== "all" && <><ChevronLeft className="h-3 w-3" /><Crumb label={typeById(fType)?.name_ar ?? ""} /></>}
                {f.stage && <><ChevronLeft className="h-3 w-3" /><Crumb label={nameById(stages, f.stage)} /></>}
                {f.grade && <><ChevronLeft className="h-3 w-3" /><Crumb label={nameById(grades, f.grade)} /></>}
                {f.section && <><ChevronLeft className="h-3 w-3" /><Crumb label={nameById(sections, f.section)} /></>}
                {f.track && <><ChevronLeft className="h-3 w-3" /><Crumb label={nameById(tracks, f.track)} /></>}
                {f.subject && <><ChevronLeft className="h-3 w-3" /><Crumb label={nameById(subjects, f.subject)} /></>}
                {f.sub && <><ChevronLeft className="h-3 w-3" /><Crumb label={nameById(subSubjects, f.sub)} /></>}
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
                <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-9 rounded-lg border border-slate-200 bg-white pr-3 pl-8 text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="new">الأحدث أولاً</option>
                  <option value="old">الأقدم أولاً</option>
                  <option value="title">أبجدياً</option>
                </select>
                <ChevronDown className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="inline-flex rounded-lg border bg-white overflow-hidden">
                <button onClick={() => setView("grid")} className={cn("p-2", view === "grid" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button onClick={() => setView("list")} className={cn("p-2", view === "list" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
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
            <div className="rounded-2xl border-2 border-dashed p-12 text-center bg-white">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Library className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-slate-800">لا توجد مصادر بعد</h3>
              <p className="text-xs text-slate-500 mt-1">ابدأ ببناء قاعدة المعرفة عبر رفع أول مصدر.</p>
              <Button className="mt-4" onClick={() => openWizard()}>
                <Plus className="h-4 w-4 ml-2" /> إضافة أول مصدر
              </Button>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((s) => {
                const t = typeById(s.source_type_id);
                const hero = TYPE_HERO[t?.code ?? "other"] ?? TYPE_HERO.other;
                const Icon = ICONS[t?.icon ?? "file"] ?? FileIcon;
                return (
                  <div key={s.id} className="group rounded-2xl border bg-white overflow-hidden hover:shadow-xl hover:border-blue-300 transition-all">
                    {/* Cover */}
                    <Link to={`/admin/modrek-library/${s.id}`} className="block">
                      <div className={cn("relative h-32 bg-gradient-to-br flex items-center justify-center", hero.bg)}>
                        <div className={cn("h-16 w-16 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shadow-lg", hero.grad)}>
                          <Icon className="h-8 w-8" />
                        </div>
                        <div className="absolute top-2 right-2">
                          <StatusPill status={s.status} />
                        </div>
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="text-[10px] bg-white/80 backdrop-blur">{t?.name_ar}</Badge>
                        </div>
                      </div>
                    </Link>
                    {/* Body */}
                    <div className="p-3">
                      <Link to={`/admin/modrek-library/${s.id}`}>
                        <h3 className="font-bold text-sm text-slate-900 line-clamp-2 min-h-[40px] hover:text-blue-600">{s.title}</h3>
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.stage_id && <Badge variant="outline" className="text-[9px] py-0 px-1.5">{nameById(stages, s.stage_id)}</Badge>}
                        {s.subject_id && <Badge variant="outline" className="text-[9px] py-0 px-1.5">{nameById(subjects, s.subject_id)}</Badge>}
                        {s.term && <Badge variant="outline" className="text-[9px] py-0 px-1.5">ترم {s.term}</Badge>}
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
                        <button className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="المزيد">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border bg-white overflow-hidden">
              {filtered.map((s, i) => {
                const t = typeById(s.source_type_id);
                const hero = TYPE_HERO[t?.code ?? "other"] ?? TYPE_HERO.other;
                const Icon = ICONS[t?.icon ?? "file"] ?? FileIcon;
                return (
                  <Link key={s.id} to={`/admin/modrek-library/${s.id}`}
                    className={cn("flex items-center gap-3 p-3 hover:bg-slate-50 transition", i > 0 && "border-t")}>
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
        "shrink-0 group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-transparent hover:shadow-md transition-all",
      )}
    >
      <span className={cn("h-7 w-7 rounded-lg bg-gradient-to-br text-white flex items-center justify-center", color)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900">{label}</span>
      <Plus className="h-3 w-3 text-slate-400" />
    </button>
  );
}

function BigStat({ label, value, icon: Icon, tone, trend, spin }: any) {
  const tones: any = {
    blue:    { bg: "from-blue-50 to-blue-100/50",       icon: "bg-blue-500",    text: "text-blue-700" },
    emerald: { bg: "from-emerald-50 to-emerald-100/50", icon: "bg-emerald-500", text: "text-emerald-700" },
    amber:   { bg: "from-amber-50 to-amber-100/50",     icon: "bg-amber-500",   text: "text-amber-700" },
    slate:   { bg: "from-slate-50 to-slate-100/50",     icon: "bg-slate-500",   text: "text-slate-700" },
  };
  const t = tones[tone];
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br border p-4 md:p-5", t.bg)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-600">{label}</div>
          <div className="mt-2 text-2xl md:text-3xl font-black text-slate-900 tabular-nums">{value.toLocaleString("ar-EG")}</div>
          {trend && <div className={cn("mt-1 text-[10px] font-bold flex items-center gap-1", t.text)}><TrendingUp className="h-3 w-3" /> نشط</div>}
        </div>
        <div className={cn("h-11 w-11 rounded-xl text-white flex items-center justify-center shadow", t.icon)}>
          <Icon className={cn("h-5 w-5", spin && "animate-spin")} />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, disabled }: any) {
  return (
    <div className={cn("relative", disabled && "opacity-50 pointer-events-none")}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 rounded-lg border border-slate-200 bg-white pr-2.5 pl-7 text-xs text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">كل {label}</option>
        {options.map((o: any) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}
      </select>
      <ChevronDown className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

function Crumb({ label }: { label: string }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">{label}</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: any = {
    draft:      { l: "مسودة",         c: "bg-slate-200 text-slate-700" },
    processing: { l: "قيد المعالجة",   c: "bg-amber-100 text-amber-700 ring-2 ring-amber-200" },
    ready:      { l: "جاهز",           c: "bg-emerald-100 text-emerald-700" },
    archived:   { l: "مؤرشف",          c: "bg-slate-100 text-slate-500" },
    failed:     { l: "فشل",            c: "bg-rose-100 text-rose-700" },
  };
  const m = map[status] ?? map.draft;
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", m.c)}>{m.l}</span>;
}

function ActionIconBtn({ icon: Icon, title, onClick, tone }: any) {
  const tones: any = {
    blue:   "text-blue-600 hover:bg-blue-50",
    slate:  "text-slate-600 hover:bg-slate-100",
    violet: "text-violet-600 hover:bg-violet-50",
    amber:  "text-amber-600 hover:bg-amber-50",
  };
  return (
    <button
      title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
      className={cn("p-1.5 rounded-md transition", tones[tone])}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
