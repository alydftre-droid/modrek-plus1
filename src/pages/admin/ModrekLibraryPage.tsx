import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Library, Plus, Search, BookOpen, FileText, ClipboardList,
  Database, Landmark, NotebookPen, File as FileIcon, Loader2,
  ImageIcon, Layers, Brain, LayoutGrid, List, Eye, Pencil,
  RefreshCw, BarChart3, FolderOpen, MoreVertical, Sparkles,
  ChevronLeft, UserRound, AlertCircle, GraduationCap, Filter,
  Inbox, TrendingUp, ArrowUpRight, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  areEquivalentModrekSubjects,
  dedupeModrekSubjects,
  isNoTrackCode,
  subjectScopeMatches,
} from "@/lib/modrekLibrarySubjects";
import ModrekUploadWizard from "@/components/admin/modrek/ModrekUploadWizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ModrekShell, ModrekCard, ModrekButton, ModrekIconButton, ModrekHero,
  ModrekEyebrow, ModrekStat, ModrekSection, ModrekPill, ModrekSelect,
  ModrekSearchInput, ModrekStatus, ModrekEmpty,
} from "@/features/modrek/premium";

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
type Subject = Taxo & {
  stage_id: string | null;
  grade_id?: string | null;
  section_id: string | null;
  curriculum_track?: string | null;
  source_subject_id?: string | null;
  source_category?: string | null;
};
type SubSubject = Taxo & { subject_id: string };

const ICON_BY_CODE: Record<string, any> = {
  book: BookOpen, booklet: NotebookPen, notes: NotebookPen, summary: FileText,
  worksheet: ClipboardList, exam: ClipboardList, ministry_model: Landmark,
  ministry: Landmark, question_bank: Database, images: ImageIcon,
  teacher_file: UserRound, other: FileIcon,
};

// Cloud accent per source type — subtle color chip only, no heavy gradients
const TYPE_ACCENT: Record<string, "blue"|"purple"|"emerald"|"amber"|"cyan"|"rose"|"slate"> = {
  book: "blue", booklet: "emerald", notes: "purple", summary: "cyan",
  worksheet: "emerald", exam: "amber", ministry_model: "slate", ministry: "slate",
  question_bank: "rose", images: "cyan", teacher_file: "purple", other: "slate",
};
const ACCENT_HEX: Record<string, { bg: string; fg: string; ring: string }> = {
  blue: { bg: "#EFF6FF", fg: "#2563EB", ring: "#DBEAFE" },
  purple: { bg: "#F5F3FF", fg: "#7C3AED", ring: "#EDE9FE" },
  emerald: { bg: "#ECFDF5", fg: "#059669", ring: "#D1FAE5" },
  amber: { bg: "#FFFBEB", fg: "#D97706", ring: "#FEF3C7" },
  cyan: { bg: "#ECFEFF", fg: "#0891B2", ring: "#CFFAFE" },
  rose: { bg: "#FFF1F2", fg: "#E11D48", ring: "#FFE4E6" },
  slate: { bg: "#F1F5F9", fg: "#334155", ring: "#E2E8F0" },
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
  const [f, setF] = useState({ stage: "", grade: "", section: "", track: "", subject: "", sub: "" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"new" | "old" | "title">("new");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [presetType, setPresetType] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      supabase.from("library_stages").select("id,name_ar,code").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("library_grades").select("id,name_ar,code,stage_id").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("library_sections").select("id,name_ar,code").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("library_tracks").select("id,name_ar,code").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("library_subjects").select("id,name_ar,code,stage_id,grade_id,section_id,curriculum_track,source_subject_id,source_category").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("library_sub_subjects").select("id,name_ar,code,subject_id").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("knowledge_sources").select("*").order("created_at", { ascending: false }),
    ]);
    const failed = [typesRes, stagesRes, gradesRes, sectionsRes, tracksRes, subjectsRes, subSubjectsRes, sourcesRes].find((res) => res.error);
    if (failed?.error) throw failed.error;
    applyBootstrapPayload({
      types: typesRes.data ?? [], stages: stagesRes.data ?? [], grades: gradesRes.data ?? [],
      sections: sectionsRes.data ?? [], tracks: tracksRes.data ?? [], subjects: subjectsRes.data ?? [],
      subSubjects: subSubjectsRes.data ?? [], sources: sourcesRes.data ?? [],
    });
  };

  const loadAll = async () => {
    setLoading(true); setLoadError(null);
    try {
      const { data, error } = await supabase.rpc("get_modrek_library_bootstrap" as any);
      if (error) {
        const message = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
        const isCacheMiss = message.includes("schema cache") || message.includes("could not find the function") || message.includes("pgrst202");
        if (!isCacheMiss) throw error;
        await loadAllFromTables();
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
  const filteredSubjects = useMemo(() => {
    const sectionCodeById = new Map(sections.map((section) => [section.id, section.code]));
    const selectedSectionCode = sections.find((sec) => sec.id === f.section)?.code;
    const selectedTrackCode = tracks.find((track) => track.id === f.track)?.code;
    const visibleSubjects = subjects.filter((subject) => subjectScopeMatches(subject, {
      stageId: f.stage,
      gradeId: f.grade,
      sectionId: f.section,
      selectedSectionCode,
      selectedTrackCode,
      sectionCodeById,
    }));
    return dedupeModrekSubjects(visibleSubjects, selectedTrackCode, f.section);
  }, [subjects, sections, tracks, f.stage, f.grade, f.section, f.track]);
  const filteredSubs = useMemo(() => subSubjects.filter((s) => !f.subject || s.subject_id === f.subject), [subSubjects, f.subject]);
  const subjectById = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);

  const filtered = useMemo(() => {
    let list = sources.filter((s) => {
      if (fType !== "all" && s.source_type_id !== fType) return false;
      if (f.stage && s.stage_id !== f.stage) return false;
      if (f.grade && s.grade_id !== f.grade) return false;
      if (f.section && s.section_id !== f.section) return false;
      if (f.track) {
        const selectedTrackCode = tracks.find((track) => track.id === f.track)?.code;
        if (isNoTrackCode(selectedTrackCode)) {
          if (s.track_id) return false;
        } else if (s.track_id && s.track_id !== f.track) return false;
      }
      if (f.subject && s.subject_id !== f.subject) {
        const selectedSubject = subjectById.get(f.subject);
        const sourceSubject = subjectById.get(s.subject_id || "");
        if (!areEquivalentModrekSubjects(selectedSubject, sourceSubject)) return false;
      }
      if (f.sub && s.sub_subject_id !== f.sub) return false;
      if (q && !s.title.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    if (sort === "old") list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "ar"));
    return list;
  }, [sources, q, fType, f, sort, tracks, subjectById]);

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
  const resetFilters = () => { setFType("all"); setF({ stage: "", grade: "", section: "", track: "", subject: "", sub: "" }); setQ(""); };
  const openWizard = (typeCode?: string | null) => { setPresetType(typeCode ?? null); setWizardOpen(true); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("knowledge_sources").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setSources((prev) => prev.filter((source) => source.id !== deleteTarget.id));
      toast.success("تم حذف الكتاب من المكتبة");
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e?.message || "تعذر حذف الكتاب");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModrekShell>
      {/* ── Hero ───────────────────────────────────────── */}
      <ModrekHero
        icon={Library}
        eyebrow={
          <ModrekEyebrow icon={Sparkles}>Modrek AI · Knowledge Base</ModrekEyebrow>
        }
        title="مكتبة Modrek AI"
        subtitle="إدارة قاعدة المعرفة الخاصة بالمساعد الذكي — كتب، ملازم، مذكرات، امتحانات، وأكثر."
        actions={
          <>
            <ModrekButton
              variant="secondary" size="md" icon={BarChart3}
              onClick={() => nav("/admin/modrek-analytics")}
            >
              التحليلات
            </ModrekButton>
            <ModrekButton
              variant="primary" size="md" icon={Plus}
              onClick={() => openWizard()}
            >
              إضافة مصدر جديد
            </ModrekButton>
          </>
        }
      />

      {/* ── Error banner ─────────────────────────────── */}
      {loadError && (
        <ModrekCard padding="none" className="p-4 border-[#FECACA] bg-[#FEF2F2]">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-[12px] bg-white text-[#DC2626] flex items-center justify-center ring-1 ring-[#FEE2E2] shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm text-[#991B1B]">تعذر تحميل بيانات المكتبة</div>
              <div className="text-xs mt-1 text-[#B91C1C] break-words">{loadError}</div>
            </div>
            <ModrekButton variant="danger" size="sm" icon={RefreshCw} onClick={loadAll}>
              إعادة المحاولة
            </ModrekButton>
          </div>
        </ModrekCard>
      )}

      {/* ── Stats ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <ModrekStat label="إجمالي المصادر" value={stats.total.toLocaleString("ar-EG")} icon={Layers} accent="blue" hint="كل المصادر" />
        <ModrekStat label="جاهزة للاستخدام" value={stats.ready.toLocaleString("ar-EG")} icon={Brain} accent="emerald" hint="مفهرسة بالكامل" />
        <ModrekStat label="قيد المعالجة" value={stats.processing.toLocaleString("ar-EG")} icon={Loader2} accent="amber" spin={stats.processing > 0} hint="تحت المعالجة" />
        <ModrekStat label="مسودات" value={stats.draft.toLocaleString("ar-EG")} icon={FileText} accent="slate" hint="لم تُنشر بعد" />
      </div>

      {/* ── Source types row ─────────────────────────── */}
      <ModrekSection
        title="أنواع المصادر"
        icon={FolderOpen}
        subtitle="اختر نوعاً لتصفية النتائج أو الرفع مباشرة"
        right={
          <ModrekButton
            variant={fType === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFType("all")}
          >
            عرض الكل
          </ModrekButton>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {types.map((t) => {
            const Icon = ICON_BY_CODE[t.code] ?? FileIcon;
            const active = fType === t.id;
            const accent = TYPE_ACCENT[t.code] ?? "slate";
            const hex = ACCENT_HEX[accent];
            return (
              <button
                key={t.id}
                onClick={() => setFType(active ? "all" : t.id)}
                className={cn(
                  "group relative text-right rounded-[18px] bg-white border p-4 min-h-[128px]",
                  "transition-all duration-200",
                  "shadow-[0_4px_16px_rgba(37,99,235,0.05)]",
                  active
                    ? "border-[#2563EB] shadow-[0_10px_28px_rgba(37,99,235,0.18)] -translate-y-0.5"
                    : "border-[#E5E7EB] hover:border-[#93C5FD] hover:shadow-[0_10px_28px_rgba(37,99,235,0.10)] hover:-translate-y-0.5",
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="h-11 w-11 rounded-[12px] flex items-center justify-center ring-1"
                    style={{ background: hex.bg, color: hex.fg, boxShadow: `inset 0 0 0 1px ${hex.ring}` }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {active && (
                    <span className="h-2 w-2 rounded-full bg-[#2563EB] shadow-[0_0_0_4px_rgba(37,99,235,0.15)]" />
                  )}
                </div>
                <div className="font-extrabold text-[13.5px] text-[#0F172A] leading-tight truncate">
                  {t.name_ar}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                  <span className="font-extrabold text-[#0F172A] tabular-nums">
                    {stats.byType[t.id] ?? 0}
                  </span>
                  مصدر
                </div>
              </button>
            );
          })}
        </div>
      </ModrekSection>

      {/* ── Filters ─────────────────────────────────── */}
      <ModrekCard padding="none" className="p-4 md:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 rounded-[12px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center ring-1 ring-[#DBEAFE]">
              <Filter className="h-4 w-4" />
            </span>
            <div>
              <div className="font-extrabold text-[15px] text-[#0F172A]">فلترة ذكية</div>
              <div className="text-[11px] text-[#94A3B8]">اختر النطاق التعليمي والمادة</div>
            </div>
          </div>
          {anyFilter && (
            <ModrekButton variant="ghost" size="sm" icon={RefreshCw} onClick={resetFilters}>
              إعادة تعيين
            </ModrekButton>
          )}
        </div>

        {/* Row 1 — Academic scope */}
        <div className="rounded-[16px] bg-[#F8FAFC] border border-[#E5E7EB] p-3 mb-3">
          <div className="text-[11px] font-extrabold text-[#475569] uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5 text-[#2563EB]" /> النطاق الأكاديمي
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <ModrekSelect label="المرحلة" placeholder="كل المراحل" value={f.stage} onChange={(v) => setF((x) => ({ ...x, stage: v, grade: "", subject: "", sub: "" }))} options={stages} />
            <ModrekSelect label="الصف" placeholder={f.stage ? "كل الصفوف" : "اختر المرحلة أولاً"} value={f.grade} onChange={(v) => setF((x) => ({ ...x, grade: v, subject: "", sub: "" }))} options={filteredGrades} disabled={!f.stage} />
            <ModrekSelect label="النظام" placeholder="عام / أزهر" value={f.section} onChange={(v) => setF((x) => ({ ...x, section: v, subject: "", sub: "" }))} options={sections} />
            <ModrekSelect label="الشعبة" placeholder="كل الشعب" value={f.track} onChange={(v) => setF((x) => ({ ...x, track: v, subject: "", sub: "" }))} options={tracks} />
          </div>
        </div>

        {/* Row 2 — Subject + search */}
        <div className="rounded-[16px] bg-[#F8FAFC] border border-[#E5E7EB] p-3">
          <div className="text-[11px] font-extrabold text-[#475569] uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-[#2563EB]" /> المادة والبحث
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <ModrekSelect label="المادة" placeholder="كل المواد" value={f.subject} onChange={(v) => setF((x) => ({ ...x, subject: v, sub: "" }))} options={filteredSubjects} />
            <ModrekSelect label="المادة الفرعية" placeholder={f.subject ? "كل المواد الفرعية" : "اختر المادة أولاً"} value={f.sub} onChange={(v) => setF((x) => ({ ...x, sub: v }))} options={filteredSubs} disabled={!f.subject} />
            <div>
              <div className="text-[12px] font-bold text-[#334155] mb-1.5 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-[#2563EB]" /> بحث
              </div>
              <ModrekSearchInput value={q} onChange={setQ} placeholder="ابحث عن مصدر بالاسم..." icon={Search} />
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        {anyFilter && (
          <div className="mt-3 pt-3 border-t border-[#E5E7EB] flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[#94A3B8] font-semibold">المسار:</span>
            <ModrekPill tone="blue">المكتبة</ModrekPill>
            {fType !== "all" && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="purple">{typeById(fType)?.name_ar}</ModrekPill></>}
            {f.stage && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="cyan">{nameById(stages, f.stage)}</ModrekPill></>}
            {f.grade && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="cyan">{nameById(grades, f.grade)}</ModrekPill></>}
            {f.section && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="emerald">{nameById(sections, f.section)}</ModrekPill></>}
            {f.track && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="emerald">{nameById(tracks, f.track)}</ModrekPill></>}
            {f.subject && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="amber">{nameById(subjects, f.subject)}</ModrekPill></>}
            {f.sub && <><ChevronLeft className="h-3 w-3 text-[#CBD5E1]" /><ModrekPill tone="amber">{nameById(subSubjects, f.sub)}</ModrekPill></>}
          </div>
        )}
      </ModrekCard>

      {/* ── Toolbar ─────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-[#475569]">
          <span className="font-extrabold text-[#0F172A] tabular-nums">{filtered.length}</span> مصدر
          {filtered.length !== stats.total && <span className="text-[#94A3B8]"> من أصل {stats.total}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="h-10 rounded-[12px] bg-white border border-[#E5E7EB] pr-3 pl-8 text-[12px] font-bold text-[#0F172A] appearance-none hover:border-[#93C5FD] focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
            >
              <option value="new">الأحدث أولاً</option>
              <option value="old">الأقدم أولاً</option>
              <option value="title">أبجدياً</option>
            </select>
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8]" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.53a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
          </div>
          <div className="inline-flex rounded-[12px] bg-white border border-[#E5E7EB] p-1 gap-1">
            <button onClick={() => setView("grid")} className={cn("h-8 w-8 rounded-[8px] flex items-center justify-center transition", view === "grid" ? "bg-[#2563EB] text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]" : "text-[#94A3B8] hover:text-[#2563EB] hover:bg-[#EFF6FF]")}><LayoutGrid className="h-4 w-4" /></button>
            <button onClick={() => setView("list")} className={cn("h-8 w-8 rounded-[8px] flex items-center justify-center transition", view === "list" ? "bg-[#2563EB] text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)]" : "text-[#94A3B8] hover:text-[#2563EB] hover:bg-[#EFF6FF]")}><List className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* ── Results ─────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-64 rounded-[20px] bg-white border border-[#E5E7EB] overflow-hidden">
              <div className="h-24 bg-[#F1F5F9] animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-3 rounded bg-[#F1F5F9] animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-[#F1F5F9] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <ModrekEmpty
          icon={Inbox}
          title={anyFilter ? "لا توجد نتائج مطابقة" : "لا توجد مصادر بعد"}
          description={anyFilter ? "جرّب إزالة بعض الفلاتر أو ابدأ برفع مصدر جديد." : "ابدأ ببناء قاعدة المعرفة عبر رفع أول مصدر."}
          action={
            <div className="flex gap-2">
              {anyFilter && (
                <ModrekButton variant="secondary" icon={RefreshCw} onClick={resetFilters}>مسح الفلاتر</ModrekButton>
              )}
              <ModrekButton variant="primary" icon={Plus} onClick={() => openWizard()}>إضافة مصدر</ModrekButton>
            </div>
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => {
            const t = typeById(s.source_type_id);
            const accent = TYPE_ACCENT[t?.code ?? "other"] ?? "slate";
            const hex = ACCENT_HEX[accent];
            const Icon = ICON_BY_CODE[t?.code ?? "other"] ?? FileIcon;
            return (
              <ModrekCard key={s.id} padding="none" interactive className="overflow-hidden group">
                <Link to={`/admin/modrek-library/${s.id}`} className="block">
                  <div
                    className="relative h-28 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${hex.bg} 0%, #FFFFFF 100%)`,
                      borderBottom: `1px solid ${hex.ring}`,
                    }}
                  >
                    <div
                      className="h-14 w-14 rounded-[16px] flex items-center justify-center ring-1 transition-transform duration-200 group-hover:scale-110"
                      style={{ background: "#FFFFFF", color: hex.fg, boxShadow: `0 8px 20px ${hex.fg}22, inset 0 0 0 1px ${hex.ring}` }}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="absolute top-2.5 right-2.5">
                      <ModrekStatus status={s.status} />
                    </div>
                    <div className="absolute top-2.5 left-2.5">
                      <ModrekPill tone={accent} size="sm">{t?.name_ar}</ModrekPill>
                    </div>
                  </div>
                </Link>
                <div className="p-4">
                  <Link to={`/admin/modrek-library/${s.id}`}>
                    <h3 className="font-extrabold text-[14px] text-[#0F172A] line-clamp-2 min-h-[40px] leading-snug hover:text-[#2563EB] transition-colors">
                      {s.title}
                    </h3>
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.stage_id && <ModrekPill tone="slate" size="sm">{nameById(stages, s.stage_id)}</ModrekPill>}
                    {s.subject_id && <ModrekPill tone="blue" size="sm">{nameById(subjects, s.subject_id)}</ModrekPill>}
                    {s.term && <ModrekPill tone="purple" size="sm">ترم {s.term}</ModrekPill>}
                  </div>
                  <div className="mt-3 text-[11px] text-[#94A3B8]">
                    آخر تحديث: {new Date(s.updated_at || s.created_at).toLocaleDateString("ar-EG")}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#E5E7EB] flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <ModrekIconButton aria-label="فتح" tone="blue" size="sm" icon={Eye} onClick={(e) => { e.preventDefault(); nav(`/admin/modrek-library/${s.id}`); }} />
                      <ModrekIconButton aria-label="تعديل" tone="slate" size="sm" icon={Pencil} onClick={(e) => { e.preventDefault(); nav(`/admin/modrek-library/${s.id}`); }} />
                      <ModrekIconButton aria-label="إعادة معالجة" tone="amber" size="sm" icon={RefreshCw} onClick={(e) => { e.preventDefault(); nav(`/admin/modrek-library/${s.id}`); }} />
                    </div>
                    <DropdownMenu dir="rtl">
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="المزيد"
                          onClick={(e) => e.preventDefault()}
                          className="h-8 w-8 rounded-[10px] bg-[#F8FAFC] text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center transition-colors ring-1 ring-[#E5E7EB]"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-[170px] text-right rounded-[12px] border-[#E5E7EB] bg-white p-1 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                        <DropdownMenuItem
                          onClick={(e) => { e.preventDefault(); setDeleteTarget(s); }}
                          className="justify-end gap-2 rounded-[10px] text-[#DC2626] focus:bg-[#FEF2F2] focus:text-[#B91C1C] cursor-pointer"
                        >
                          حذف الكتاب
                          <Trash2 className="h-4 w-4" />
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </ModrekCard>
            );
          })}
        </div>
      ) : (
        <ModrekCard padding="none" className="overflow-hidden">
          <div className="divide-y divide-[#F1F5F9]">
            {filtered.map((s) => {
              const t = typeById(s.source_type_id);
              const accent = TYPE_ACCENT[t?.code ?? "other"] ?? "slate";
              const hex = ACCENT_HEX[accent];
              const Icon = ICON_BY_CODE[t?.code ?? "other"] ?? FileIcon;
              return (
                <Link key={s.id} to={`/admin/modrek-library/${s.id}`} className="flex items-center gap-3 p-3.5 hover:bg-[#F8FAFC] transition-colors group">
                  <div
                    className="h-11 w-11 rounded-[12px] flex items-center justify-center shrink-0 ring-1"
                    style={{ background: hex.bg, color: hex.fg, boxShadow: `inset 0 0 0 1px ${hex.ring}` }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px] text-[#0F172A] truncate group-hover:text-[#2563EB]">{s.title}</div>
                    <div className="text-[12px] text-[#94A3B8] flex items-center gap-2 mt-0.5">
                      <span>{t?.name_ar}</span>
                      {s.stage_id && <span>· {nameById(stages, s.stage_id)}</span>}
                      {s.subject_id && <span>· {nameById(subjects, s.subject_id)}</span>}
                    </div>
                  </div>
                  <ModrekStatus status={s.status} />
                  <DropdownMenu dir="rtl">
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="المزيد"
                        onClick={(e) => e.preventDefault()}
                        className="h-8 w-8 rounded-[10px] bg-[#F8FAFC] text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center transition-colors ring-1 ring-[#E5E7EB]"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[170px] text-right rounded-[12px] border-[#E5E7EB] bg-white p-1 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
                      <DropdownMenuItem
                        onClick={(e) => { e.preventDefault(); setDeleteTarget(s); }}
                        className="justify-end gap-2 rounded-[10px] text-[#DC2626] focus:bg-[#FEF2F2] focus:text-[#B91C1C] cursor-pointer"
                      >
                        حذف الكتاب
                        <Trash2 className="h-4 w-4" />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ArrowUpRight className="h-4 w-4 text-[#94A3B8] group-hover:text-[#2563EB]" />
                </Link>
              );
            })}
          </div>
        </ModrekCard>
      )}

      <ModrekUploadWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={(id) => nav(`/admin/modrek-library/${id}`)}
        presetTypeCode={presetType}
        types={types} stages={stages} grades={grades}
        sections={sections} tracks={tracks} subjects={subjects} subSubjects={subSubjects}
        typeCounts={stats.byType}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-[18px] border-[#FECACA] bg-white text-right [font-family:Cairo,system-ui,sans-serif]">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-[#991B1B]">حذف الكتاب؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-7 text-[#475569]">
              سيتم حذف “{deleteTarget?.title}” وكل نسخ المعالجة والوحدات والفهرسة المرتبطة به نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start sm:space-x-0">
            <AlertDialogCancel disabled={deleting} className="rounded-[12px]">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              disabled={deleting}
              className="rounded-[12px] bg-[#DC2626] text-white hover:bg-[#B91C1C]"
            >
              {deleting ? "جاري الحذف..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModrekShell>
  );
}
