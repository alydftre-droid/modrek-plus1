import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowRight, ArrowLeft, Loader2, Sparkles, Upload, FileText,
  Image as ImageIcon, Check, BookOpen, Layers, GraduationCap,
} from "lucide-react";
import { uploadBookToBunny } from "@/lib/studentLibrary";

/* ============================================================================
 * LibraryUploadPage — 3-step wizard for uploading a book to the library.
 * Step 1: تصنيف الكتاب  (education system → stage → grade → track → subject → sub → term → year)
 * Step 2: بيانات الكتاب  (title, description, author)
 * Step 3: رفع الملفات    (PDF + cover + upload / OCR / publish)
 *
 * All lookups query Supabase directly. No mock data, no hardcoded arrays,
 * no Diagnostics boxes in the UI.
 * ============================================================================ */

interface Row { id: string; code?: string; name_ar: string }
interface GradeRow extends Row { stage_id: string }
interface SourceSubjectRow {
  id: string;
  name: string;
  category: string;
  section: string | null;
  stage: string;
  grade: string;
  is_active?: boolean | null;
}
interface LibrarySubjectRow {
  id: string;
  name_ar: string;
  source_category: string | null;
  is_active: boolean;
  source?: SourceSubjectRow;
}

const CATEGORY_LABELS: Record<string, string> = {
  arabic: "العربية",
  english: "اللغة الإنجليزية",
  french: "اللغة الفرنسية",
  math: "الرياضيات",
  science: "العلوم",
  integrated_science: "العلوم المتكاملة",
  scientific: "المواد العلمية",
  literary: "المواد الأدبية",
  studies: "الدراسات الاجتماعية",
  sharia: "المواد الشرعية",
  religious: "المواد الشرعية",
};

function normalizeStageCode(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "preparatory" || v.includes("اعداد") || v.includes("إعداد")) return "preparatory";
  if (v === "secondary" || v.includes("ثانو")) return "secondary";
  if (v === "primary" || v.includes("ابتد")) return "primary";
  return v;
}

function normalizeGradeCode(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (["first", "الأول", "اول", "أول", "الصف الأول", "الاول", "1"].includes(v)) return "first";
  if (["second", "الثاني", "ثاني", "الصف الثاني", "الثانى", "2"].includes(v)) return "second";
  if (["third", "الثالث", "ثالث", "الصف الثالث", "3"].includes(v)) return "third";
  if (["fourth", "الرابع", "رابع", "الصف الرابع", "4"].includes(v)) return "fourth";
  if (["fifth", "الخامس", "خامس", "الصف الخامس", "5"].includes(v)) return "fifth";
  if (["sixth", "السادس", "سادس", "الصف السادس", "6"].includes(v)) return "sixth";
  return v;
}

function sourceGradeFromLibraryGradeCode(code: string | null | undefined) {
  if (code === "pr1" || code === "sec1" || code === "p1") return "first";
  if (code === "pr2" || code === "sec2" || code === "p2") return "second";
  if (code === "pr3" || code === "sec3" || code === "p3") return "third";
  if (code === "p4") return "fourth";
  if (code === "p5") return "fifth";
  if (code === "p6") return "sixth";
  return normalizeGradeCode(code);
}

function normalizeTrackCode(value: string | null | undefined) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (["scientific", "science", "sci", "علمي", "علمى", "علمي علوم", "علمى علوم", "علمي رياضة", "علمى رياضة"].includes(v)) return "scientific";
  if (["literary", "أدبي", "ادبي", "أدبى", "ادبى"].includes(v)) return "literary";
  return v;
}

function sourceSectionFromTrackCode(trackCode: string | null | undefined) {
  if (!trackCode || trackCode === "none") return "";
  if (["scientific", "sci_science", "sci_math"].includes(trackCode)) return "scientific";
  if (trackCode === "literary") return "literary";
  return trackCode;
}

function educationAllowsCategory(category: string | null | undefined, sectionCode: string) {
  if (sectionCode !== "general") return true;
  const c = String(category || "").trim().toLowerCase();
  return c !== "sharia" && c !== "religious";
}

function sourceMatchesStageGrade(subject: SourceSubjectRow, stage: Row | undefined, grade: GradeRow | undefined) {
  if (!stage || !grade) return false;
  return normalizeStageCode(subject.stage) === normalizeStageCode(stage.code)
    && normalizeGradeCode(subject.grade) === sourceGradeFromLibraryGradeCode(grade.code);
}

function subjectMatchesSpecializedTrack(subject: SourceSubjectRow, trackCode: string | null | undefined) {
  const name = (subject.name || "").trim();
  if (trackCode === "sci_science") return !name.includes("رياضيات") && !name.includes("الرياضيات");
  if (trackCode === "sci_math") return !name.includes("أحياء") && !name.includes("احياء") && !name.includes("الأحياء");
  return true;
}

function categoryLabel(category: string, items: LibrarySubjectRow[]) {
  const key = String(category || "").trim().toLowerCase();
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  if (items.length === 1) return items[0].source?.name || items[0].name_ar;
  return category || "مواد أخرى";
}

const ENV_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ENV_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "");

async function callAdmin(action: string, body?: unknown) {
  const url = new URL(`${ENV_URL}/functions/v1/library-admin`);
  url.searchParams.set("action", action);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("يجب تسجيل الدخول أولًا");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: ENV_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /**/ }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

function bytes(n: number) {
  if (!n) return "0";
  const u = ["ب", "ك.ب", "م.ب", "غ.ب"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

/* ---------------------------- Styled Select ------------------------------- */
function SelectField({
  label, value, onChange, options, placeholder, disabled, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-slate-800">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <div className="relative">
        <select
          dir="rtl"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 w-full appearance-none rounded-xl border bg-white pr-4 pl-10 text-right text-sm text-slate-900 shadow-sm transition
            ${disabled ? "opacity-60 cursor-not-allowed border-slate-200" : "border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"}`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
      </div>
    </div>
  );
}

/* ------------------------------- Stepper --------------------------------- */
function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "تصنيف الكتاب", icon: Layers },
    { n: 2, label: "بيانات الكتاب", icon: BookOpen },
    { n: 3, label: "رفع الملفات", icon: Upload },
  ] as const;
  return (
    <div className="flex items-center justify-center gap-3 md:gap-6 mb-8">
      {items.map((it, idx) => {
        const done = step > it.n;
        const active = step === it.n;
        const Icon = it.icon;
        return (
          <div key={it.n} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition
                  ${done ? "bg-emerald-500 border-emerald-500 text-white"
                    : active ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200"
                    : "bg-white border-slate-300 text-slate-400"}`}
              >
                {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className={`text-[11px] font-semibold ${active || done ? "text-slate-900" : "text-slate-400"}`}>
                {it.label}
              </span>
            </div>
            {idx < items.length - 1 && (
              <div className={`h-0.5 w-8 md:w-16 mb-5 rounded-full ${step > it.n ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================ Page ================================== */
export default function LibraryUploadPage({
  userId, onBack, onDone,
}: {
  userId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Taxonomy
  const [sections, setSections] = useState<Row[]>([]);
  const [stages, setStages] = useState<Row[]>([]);
  const [allGrades, setAllGrades] = useState<GradeRow[]>([]);
  const [allTracks, setAllTracks] = useState<Row[]>([]);
  const [sourceSubjects, setSourceSubjects] = useState<SourceSubjectRow[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);

  // Dynamic subjects for chosen scope
  const [scopeSubjects, setScopeSubjects] = useState<LibrarySubjectRow[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);

  // Selections
  const [sectionCode, setSectionCode] = useState<"general" | "azhar" | "shared" | "">("");
  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [trackCode, setTrackCode] = useState("");
  const [subjectKey, setSubjectKey] = useState("");
  const [subSubjectId, setSubSubjectId] = useState("");
  const [term, setTerm] = useState<"" | "annual" | "term1" | "term2">("");
  const [editionYear, setEditionYear] = useState<string>("");

  // Book meta
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");

  // Files
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState("");

  /* -------- Load taxonomy from DB -------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setTaxonomyLoading(true);
      const [s, st, g, t, source] = await Promise.all([
        supabase.from("library_sections").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("library_stages").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("library_grades").select("id,code,name_ar,stage_id,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("library_tracks").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("subjects").select("id,name,category,section,stage,grade,is_active").eq("is_active", true).order("category", { ascending: true }).order("name", { ascending: true }),
      ]);
      if (!mounted) return;
      if (s.error || st.error || g.error || t.error || source.error) {
        toast.error("تعذر تحميل بيانات المكتبة من قاعدة البيانات");
      }
      setSections((s.data ?? []) as Row[]);
      setStages((st.data ?? []) as Row[]);
      setAllGrades((g.data ?? []) as GradeRow[]);
      setAllTracks(((t.data ?? []) as Row[]).filter((x) => x.code !== "none"));
      setSourceSubjects((source.data ?? []) as SourceSubjectRow[]);
      setTaxonomyLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  /* -------- Cascade resets -------- */
  useEffect(() => { setStageId(""); setGradeId(""); setTrackCode(""); setSubjectKey(""); setSubSubjectId(""); }, [sectionCode]);
  useEffect(() => { setGradeId(""); setTrackCode(""); setSubjectKey(""); setSubSubjectId(""); }, [stageId]);
  useEffect(() => { setTrackCode(""); setSubjectKey(""); setSubSubjectId(""); }, [gradeId]);
  useEffect(() => { setSubjectKey(""); setSubSubjectId(""); }, [trackCode]);
  useEffect(() => { setSubSubjectId(""); }, [subjectKey]);

  /* -------- Subjects for scope (section + stage + grade) --------
     The real stage/grade/track relationship lives in the platform `subjects`
     rows. The upload picker must not query legacy `library_subjects` mapping
     columns because production schemas may not contain them. */
  useEffect(() => {
    let mounted = true;
    setScopeSubjects([]);
    if (!sectionCode || !stageId || !gradeId) return;
    setScopeLoading(true);

    (async () => {
      const selectedStage = stages.find((s) => s.id === stageId);
      const selectedGrade = allGrades.find((g) => g.id === gradeId);
      const sourceRows = sourceSubjects
        .filter((row) => sourceMatchesStageGrade(row, selectedStage, selectedGrade))
        .filter((row) => educationAllowsCategory(row.category, sectionCode));
      const sourceIds = sourceRows.map((row) => row.id);

      if (sourceIds.length === 0) {
        if (mounted) {
          setScopeSubjects([]);
          setScopeLoading(false);
          toast.error("لا توجد مواد فعّالة مطابقة لهذا النظام والمرحلة والصف في قاعدة البيانات.");
        }
        return;
      }
      if (!mounted) return;
      const rows = sourceRows.map((source) => ({
        id: source.id,
        name_ar: source.name,
        source_category: source.category,
        is_active: source.is_active !== false,
        source,
      } satisfies LibrarySubjectRow));

      setScopeSubjects(rows);
      setScopeLoading(false);
    })();
    return () => { mounted = false; };
  }, [sectionCode, stageId, gradeId, stages, allGrades, sourceSubjects]);

  /* -------- Derived options -------- */
  const stageOptions = useMemo(() => {
    const allowed = sourceSubjects.filter((row) => !sectionCode || educationAllowsCategory(row.category, sectionCode));
    return stages
      .filter((stage) => allowed.some((row) => normalizeStageCode(row.stage) === normalizeStageCode(stage.code)))
      .map((s) => ({ value: s.id, label: s.name_ar }));
  }, [stages, sourceSubjects, sectionCode]);
  const gradeOptions = useMemo(
    () => {
      const selectedStage = stages.find((s) => s.id === stageId);
      const allowed = sourceSubjects.filter((row) => !sectionCode || educationAllowsCategory(row.category, sectionCode));
      return allGrades
        .filter((g) => g.stage_id === stageId)
        .filter((g) => allowed.some((row) => sourceMatchesStageGrade(row, selectedStage, g)))
        .map((g) => ({ value: g.id, label: g.name_ar }));
    },
    [allGrades, stageId, stages, sourceSubjects, sectionCode],
  );

  const availableTrackCodes = useMemo(() => {
    const set = new Set<string>();
    for (const s of scopeSubjects) {
      const sourceTrack = normalizeTrackCode(s.source?.section);
      if (sourceTrack) set.add(sourceTrack);
    }
    return set;
  }, [scopeSubjects]);

  const trackOptions = useMemo(() => {
    const selectedGrade = allGrades.find((g) => g.id === gradeId);
    const codes = new Set<string>();
    if (availableTrackCodes.has("literary")) codes.add("literary");
    if (availableTrackCodes.has("scientific")) {
      if (sectionCode === "general" && selectedGrade?.code === "sec3") {
        codes.add("sci_science");
        codes.add("sci_math");
      } else {
        codes.add("scientific");
      }
    }
    return allTracks.filter((t) => t.code && codes.has(t.code)).map((t) => ({ value: t.code!, label: t.name_ar }));
  }, [allTracks, availableTrackCodes, allGrades, gradeId, sectionCode]);
  const showTrack = trackOptions.length > 0;

  const trackFilteredSubjects = useMemo(() => {
    if (!showTrack) return scopeSubjects;
    if (!trackCode) return [];
    const sourceSection = sourceSectionFromTrackCode(trackCode);
    return scopeSubjects
      .filter((s) => normalizeTrackCode(s.source?.section) === sourceSection)
      .filter((s) => !s.source || subjectMatchesSpecializedTrack(s.source, trackCode));
  }, [scopeSubjects, showTrack, trackCode]);

  const subjectGroups = useMemo(() => {
    const map = new Map<string, LibrarySubjectRow[]>();
    for (const s of trackFilteredSubjects) {
      const key = String(s.source?.category || s.source_category || s.name_ar).trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      name: categoryLabel(key, items),
      items: [...items].sort((a, b) => (a.source?.name || a.name_ar).localeCompare(b.source?.name || b.name_ar, "ar")),
    }));
  }, [trackFilteredSubjects]);

  const subjectOptions = useMemo(
    () => subjectGroups.map((g) => ({ value: g.key, label: g.name })),
    [subjectGroups],
  );

  const currentSubjectGroup = useMemo(
    () => subjectGroups.find((g) => g.key === subjectKey) || null,
    [subjectGroups, subjectKey],
  );

  const subSubjectOptions = useMemo(() => {
    if (!currentSubjectGroup || currentSubjectGroup.items.length <= 1) return [];
    return currentSubjectGroup.items.map((it) => ({
      value: it.id,
      label: it.source?.name || it.name_ar,
    }));
  }, [currentSubjectGroup]);

  const showSubSubject = subSubjectOptions.length > 0;

  const chosenSubjectRow = useMemo(() => {
    if (!currentSubjectGroup) return null;
    if (currentSubjectGroup.items.length === 1) return currentSubjectGroup.items[0];
    return currentSubjectGroup.items.find((it) => it.id === subSubjectId) || null;
  }, [currentSubjectGroup, subSubjectId]);

  /* -------- Validation per step -------- */
  const step1Valid = useMemo(() => {
    if (!sectionCode || !stageId || !gradeId) return false;
    if (showTrack && !trackCode) return false;
    if (!subjectKey) return false;
    if (showSubSubject && !subSubjectId) return false;
    if (!term) return false;
    return !!chosenSubjectRow;
  }, [sectionCode, stageId, gradeId, showTrack, trackCode, subjectKey, showSubSubject, subSubjectId, term, chosenSubjectRow]);

  const step2Valid = title.trim().length > 0;
  const step3Valid = !!pdfFile;

  /* -------- Publish -------- */
  const publish = async () => {
    if (!chosenSubjectRow || !pdfFile) return;
    setBusy(true); setProgress(0); setStageLabel("جاري إنشاء السجل…");
    try {
      const educationType = sectionCode === "azhar" ? "أزهر" : sectionCode === "shared" ? "both" : "عام";
      const chosenSectionId = sections.find((s) => s.code === sectionCode)?.id || null;
      const chosenTrackId = allTracks.find((t) => t.code === trackCode)?.id || null;

      const created = await callAdmin("create", {
        title: title.trim(),
        description: [description.trim(), author.trim() ? `المؤلف: ${author.trim()}` : ""].filter(Boolean).join("\n\n") || null,
        education_type: educationType,
        stage_id: stageId,
        grade_id: gradeId,
        section_id: chosenSectionId,
        track_id: chosenTrackId,
        subject_id: chosenSubjectRow.id,
        subject_name_ar: currentSubjectGroup?.name || chosenSubjectRow.name_ar,
        term,
        edition_year: editionYear ? Number(editionYear) : null,
        sub_subject_name: showSubSubject ? (chosenSubjectRow.source?.name || chosenSubjectRow.name_ar) : null,
      });
      const bookId = created.book.id;

      setStageLabel("جاري رفع ملف PDF…");
      const pdfUri = await uploadBookToBunny({
        file: pdfFile, userId,
        onProgress: (l, t) => setProgress(Math.round((l / t) * 80)),
      });

      let coverUri: string | null = null;
      if (coverFile) {
        setStageLabel("جاري رفع صورة الغلاف…");
        coverUri = await uploadBookToBunny({
          file: coverFile, userId,
          onProgress: (l, t) => setProgress(80 + Math.round((l / t) * 10)),
        });
      }

      setProgress(92); setStageLabel("جاري حفظ بيانات الكتاب…");
      await callAdmin("update", {
        id: bookId, pdf_path: pdfUri, cover_url: coverUri, file_size: pdfFile.size,
      });

      setStageLabel("بدء التحويل التفاعلي (OCR)…");
      await callAdmin("publish", { id: bookId });
      setProgress(100); setStageLabel("تم النشر ✅");
      toast.success("تم نشر الكتاب بنجاح — سيظهر للطلاب فور اكتمال المعالجة");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "فشل نشر الكتاب");
    } finally {
      setBusy(false);
    }
  };

  /* -------- Summary for right-hand card -------- */
  const summary = useMemo(() => {
    const findName = <T extends Row>(list: T[], key: keyof T, val: string) =>
      (list.find((x) => (x as any)[key] === val) as any)?.name_ar || "";
    return {
      section: sections.find((s) => s.code === sectionCode)?.name_ar || "",
      stage: findName(stages, "id", stageId),
      grade: findName(allGrades, "id", gradeId),
      track: allTracks.find((t) => t.code === trackCode)?.name_ar || "",
      subject: currentSubjectGroup?.name || "",
      sub: showSubSubject ? currentSubjectGroup?.items.find((it) => it.id === subSubjectId)?.source?.name || "" : "",
      term: term === "annual" ? "سنوي" : term === "term1" ? "الفصل الأول" : term === "term2" ? "الفصل الثاني" : "",
      year: editionYear,
    };
  }, [sections, sectionCode, stages, stageId, allGrades, gradeId, allTracks, trackCode, subjectKey, showSubSubject, currentSubjectGroup, subSubjectId, term, editionYear]);

  /* ================================ UI ================================== */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" style={{ fontFamily: "Cairo, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-5xl p-4 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50">
              <ArrowRight className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">رفع كتاب جديد</h1>
              <p className="text-xs text-slate-500 mt-0.5">أكمل الخطوات الثلاث لإضافة كتاب تفاعلي إلى المكتبة</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs text-blue-700 border border-blue-100">
            <Sparkles className="h-3.5 w-3.5" /> {step} / 3
          </div>
        </div>

        <Stepper step={step} />

        {taxonomyLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> جاري تحميل الأنظمة والمراحل والصفوف…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 md:p-7">
              {/* -------------------- STEP 1 -------------------- */}
              {step === 1 && (
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Layers className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">الخطوة الأولى — تصنيف الكتاب</h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SelectField
                      label="النظام التعليمي" required
                      value={sectionCode} onChange={(v) => setSectionCode(v as any)}
                      placeholder="عام / أزهري / مشترك"
                      options={sections.map((s) => ({ value: s.code!, label: s.name_ar }))}
                    />
                    <SelectField
                      label="المرحلة" required
                      value={stageId} onChange={setStageId}
                      disabled={!sectionCode}
                      placeholder={sectionCode ? "اختر المرحلة" : "اختر النظام التعليمي أولًا"}
                      options={stageOptions}
                    />
                    <SelectField
                      label="الصف" required
                      value={gradeId} onChange={setGradeId}
                      disabled={!stageId}
                      placeholder={stageId ? "اختر الصف" : "اختر المرحلة أولًا"}
                      options={gradeOptions}
                    />
                    {showTrack && (
                      <SelectField
                        label="الشعبة" required
                        value={trackCode} onChange={setTrackCode}
                        disabled={scopeLoading}
                        placeholder={scopeLoading ? "جاري التحميل…" : "اختر الشعبة"}
                        options={trackOptions}
                      />
                    )}
                    <SelectField
                      label="المادة" required
                      value={subjectKey} onChange={setSubjectKey}
                      disabled={!gradeId || scopeLoading || (showTrack && !trackCode)}
                      placeholder={scopeLoading ? "جاري تحميل المواد…" : subjectOptions.length === 0 ? "لا توجد مواد لهذا الصف" : "اختر المادة"}
                      options={subjectOptions}
                    />
                    {showSubSubject && (
                      <SelectField
                        label="المادة الفرعية" required
                        value={subSubjectId} onChange={setSubSubjectId}
                        placeholder="اختر المادة الفرعية"
                        options={subSubjectOptions}
                      />
                    )}
                    <SelectField
                      label="الترم" required
                      value={term} onChange={(v) => setTerm(v as any)}
                      placeholder="اختر الترم"
                      options={[
                        { value: "annual", label: "سنوي (بدون ترم)" },
                        { value: "term1", label: "الفصل الدراسي الأول" },
                        { value: "term2", label: "الفصل الدراسي الثاني" },
                      ]}
                    />
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-slate-800">سنة الإصدار</Label>
                      <Input
                        type="number" inputMode="numeric" placeholder="مثال: 2025"
                        value={editionYear}
                        onChange={(e) => setEditionYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* -------------------- STEP 2 -------------------- */}
              {step === 2 && (
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">الخطوة الثانية — بيانات الكتاب</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-slate-800">اسم الكتاب <span className="text-rose-500">*</span></Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: المرشد في الأحياء" className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-slate-800">اسم المؤلف (اختياري)</Label>
                      <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="اسم المؤلف أو الناشر" className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold text-slate-800">وصف الكتاب (اختياري)</Label>
                      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="وصف مختصر لمحتوى الكتاب…" className="rounded-xl resize-none" />
                    </div>
                  </div>
                </>
              )}

              {/* -------------------- STEP 3 -------------------- */}
              {step === 3 && (
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Upload className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">الخطوة الثالثة — رفع الملفات</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40 py-8 px-4 transition">
                      <FileText className="h-8 w-8 text-blue-500 mb-2" />
                      <span className="text-sm font-semibold text-slate-800">ملف PDF <span className="text-rose-500">*</span></span>
                      <span className="text-xs text-slate-500 mt-1 text-center">{pdfFile ? pdfFile.name : "اضغط لاختيار الملف"}</span>
                      {pdfFile && <span className="text-[11px] text-slate-500 mt-0.5">{bytes(pdfFile.size)}</span>}
                      <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                    </label>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/40 py-8 px-4 transition">
                      <ImageIcon className="h-8 w-8 text-violet-500 mb-2" />
                      <span className="text-sm font-semibold text-slate-800">صورة الغلاف (اختياري)</span>
                      <span className="text-xs text-slate-500 mt-1 text-center">{coverFile ? coverFile.name : "اضغط لاختيار الصورة"}</span>
                      {coverFile && <span className="text-[11px] text-slate-500 mt-0.5">{bytes(coverFile.size)}</span>}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>

                  {busy && (
                    <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700">{stageLabel}</span>
                        <span className="text-xs text-slate-500">{progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white border border-slate-200 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* -------------------- Nav buttons -------------------- */}
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => (step === 1 ? onBack() : setStep((s) => (s - 1) as 1 | 2 | 3))}
                  className="h-11 rounded-xl px-5"
                >
                  <ArrowRight className="h-4 w-4 ml-1" />
                  {step === 1 ? "إلغاء" : "السابق"}
                </Button>

                {step < 3 ? (
                  <Button
                    onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                    disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                    className="h-11 rounded-xl px-6 font-bold"
                  >
                    التالي
                    <ArrowLeft className="h-4 w-4 mr-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={publish}
                    disabled={!step3Valid || busy}
                    className="h-11 rounded-xl px-6 font-bold bg-emerald-600 hover:bg-emerald-700"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Sparkles className="h-4 w-4 ml-2" />}
                    رفع الكتاب
                  </Button>
                )}
              </div>
            </div>

            {/* -------------------- Summary card -------------------- */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 h-fit sticky top-4">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">ملخص التصنيف</h3>
              </div>
              <ul className="text-[13px] text-slate-700 divide-y divide-slate-100">
                {[
                  ["النظام", summary.section],
                  ["المرحلة", summary.stage],
                  ["الصف", summary.grade],
                  ["الشعبة", summary.track],
                  ["المادة", summary.subject],
                  ["المادة الفرعية", summary.sub],
                  ["الترم", summary.term],
                  ["سنة الإصدار", summary.year],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between py-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold text-slate-900">{v || "—"}</span>
                  </li>
                ))}
              </ul>
              {step === 3 && title && (
                <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-3">
                  <div className="text-[11px] text-blue-700 mb-1">الكتاب</div>
                  <div className="text-sm font-bold text-blue-900">{title}</div>
                  {author && <div className="text-[11px] text-blue-700 mt-0.5">المؤلف: {author}</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
