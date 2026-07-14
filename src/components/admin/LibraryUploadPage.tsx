import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowRight, Loader2, Sparkles, Upload, FileText, Image as ImageIcon, Info } from "lucide-react";
import { uploadBookToBunny } from "@/lib/studentLibrary";

/* ============================================================================
 * LibraryUploadPage — a single-page book uploader. No wizard, no popup.
 * All lookups query Supabase directly. Nothing is hardcoded, cached, or mocked.
 * ============================================================================ */

interface Row { id: string; code?: string; name_ar: string }
interface GradeRow extends Row { stage_id: string }
interface LibrarySubjectRow {
  id: string; name_ar: string;
  stage_id: string | null; grade_id: string | null;
  section_id: string | null; curriculum_track: string | null;
  source_subject_id: string | null; source_category: string | null;
  is_active: boolean;
}
interface Diag { table: string; filter: Record<string, unknown>; count: number; error: string | null }

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

/** A styled native <select> that matches the screenshot reference. */
function SelectField({
  label, value, onChange, options, placeholder, disabled, required, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
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
          className={`h-11 w-full appearance-none rounded-xl border bg-white pr-10 pl-4 text-right text-sm text-slate-900 shadow-sm transition
            ${disabled ? "opacity-60 cursor-not-allowed border-slate-200" : "border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"}`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">▾</span>
      </div>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export default function LibraryUploadPage({ userId, onBack, onDone }: { userId: string; onBack: () => void; onDone: () => void }) {
  // Taxonomy from DB
  const [sections, setSections] = useState<Row[]>([]);
  const [stages, setStages] = useState<Row[]>([]);
  const [allGrades, setAllGrades] = useState<GradeRow[]>([]);
  const [allTracks, setAllTracks] = useState<Row[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);

  // Dynamic per-scope
  const [scopeSubjects, setScopeSubjects] = useState<LibrarySubjectRow[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [lastDiag, setLastDiag] = useState<Diag | null>(null);

  // Selections
  const [sectionCode, setSectionCode] = useState<"general" | "azhar" | "shared" | "">("");
  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [trackCode, setTrackCode] = useState(""); // "" = بدون شعبة (or single-track grade)
  const [subjectKey, setSubjectKey] = useState(""); // unique name_ar within scope
  const [subSubjectId, setSubSubjectId] = useState(""); // variant id
  const [term, setTerm] = useState<"" | "annual" | "term1" | "term2">("");
  const [editionYear, setEditionYear] = useState<string>("");

  // Book meta
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  /* -------- 1. Load base taxonomy once from DB -------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setTaxonomyLoading(true);
      const [s, st, g, t] = await Promise.all([
        supabase.from("library_sections").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("library_stages").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("library_grades").select("id,code,name_ar,stage_id,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("library_tracks").select("id,code,name_ar,sort_order").eq("is_active", true).order("sort_order"),
      ]);
      if (!mounted) return;
      if (s.error || st.error || g.error || t.error) {
        toast.error("تعذر تحميل بيانات المكتبة من قاعدة البيانات");
      }
      setSections((s.data ?? []) as Row[]);
      setStages((st.data ?? []) as Row[]);
      setAllGrades((g.data ?? []) as GradeRow[]);
      setAllTracks(((t.data ?? []) as Row[]).filter((x) => x.code !== "none"));
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

  /* -------- 2. Load subjects for the (section+stage+grade) scope -------- */
  useEffect(() => {
    let mounted = true;
    setScopeSubjects([]);
    if (!sectionCode || !stageId || !gradeId) { setLastDiag(null); return; }
    setScopeLoading(true);

    const sharedId = sections.find((s) => s.code === "shared")?.id;
    const chosenId = sections.find((s) => s.code === sectionCode)?.id;
    const sectionIds = sectionCode === "shared"
      ? (sharedId ? [sharedId] : [])
      : Array.from(new Set([chosenId, sharedId].filter(Boolean) as string[]));

    (async () => {
      const { data, error } = await supabase
        .from("library_subjects")
        .select("id,name_ar,stage_id,grade_id,section_id,curriculum_track,source_subject_id,source_category,is_active")
        .eq("is_active", true)
        .eq("stage_id", stageId)
        .eq("grade_id", gradeId)
        .in("section_id", sectionIds)
        .order("name_ar");
      if (!mounted) return;
      const rows = (data ?? []) as LibrarySubjectRow[];
      setScopeSubjects(rows);
      setLastDiag({
        table: "library_subjects",
        filter: { stage_id: stageId, grade_id: gradeId, section_id_in: sectionIds, is_active: true },
        count: rows.length,
        error: error?.message ?? null,
      });
      setScopeLoading(false);
    })();
    return () => { mounted = false; };
  }, [sectionCode, stageId, gradeId, sections]);

  /* -------- Derived options -------- */
  const stageOptions = useMemo(() => stages.map((s) => ({ value: s.id, label: s.name_ar })), [stages]);
  const gradeOptions = useMemo(
    () => allGrades.filter((g) => g.stage_id === stageId).map((g) => ({ value: g.id, label: g.name_ar })),
    [allGrades, stageId],
  );

  // Which tracks actually exist for this (stage+grade+section) scope?
  const availableTrackCodes = useMemo(() => {
    const set = new Set<string>();
    for (const s of scopeSubjects) if (s.curriculum_track) set.add(s.curriculum_track);
    return set;
  }, [scopeSubjects]);

  const trackOptions = useMemo(() => {
    if (availableTrackCodes.size === 0) return [];
    return allTracks
      .filter((t) => availableTrackCodes.has(t.code!))
      .map((t) => ({ value: t.code!, label: t.name_ar }));
  }, [allTracks, availableTrackCodes]);

  const showTrack = trackOptions.length > 0;

  // Subjects filtered by chosen track (or all if no track applies)
  const trackFilteredSubjects = useMemo(() => {
    if (!showTrack) return scopeSubjects;
    if (!trackCode) return [];
    return scopeSubjects.filter((s) => s.curriculum_track === trackCode);
  }, [scopeSubjects, showTrack, trackCode]);

  // Group by name_ar → subject label; variants become sub-subjects
  const subjectGroups = useMemo(() => {
    const map = new Map<string, LibrarySubjectRow[]>();
    for (const s of trackFilteredSubjects) {
      const key = s.name_ar.trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [trackFilteredSubjects]);

  const subjectOptions = useMemo(
    () => subjectGroups.map((g) => ({ value: g.name, label: g.name })),
    [subjectGroups],
  );

  const currentSubjectGroup = useMemo(
    () => subjectGroups.find((g) => g.name === subjectKey) || null,
    [subjectGroups, subjectKey],
  );

  const subSubjectOptions = useMemo(() => {
    if (!currentSubjectGroup) return [];
    if (currentSubjectGroup.items.length <= 1) return [];
    return currentSubjectGroup.items.map((it) => ({
      value: it.id,
      label: it.source_category ? `${it.name_ar} — ${it.source_category}` : it.name_ar,
    }));
  }, [currentSubjectGroup]);

  const showSubSubject = subSubjectOptions.length > 0;

  const chosenSubjectRow = useMemo(() => {
    if (!currentSubjectGroup) return null;
    if (currentSubjectGroup.items.length === 1) return currentSubjectGroup.items[0];
    return currentSubjectGroup.items.find((it) => it.id === subSubjectId) || null;
  }, [currentSubjectGroup, subSubjectId]);

  /* -------- Validation -------- */
  const canSubmit = useMemo(() => {
    if (!sectionCode || !stageId || !gradeId) return false;
    if (showTrack && !trackCode) return false;
    if (!subjectKey) return false;
    if (showSubSubject && !subSubjectId) return false;
    if (!term) return false;
    if (!chosenSubjectRow) return false;
    if (!title.trim()) return false;
    if (!pdfFile) return false;
    return !busy;
  }, [sectionCode, stageId, gradeId, showTrack, trackCode, subjectKey, showSubSubject, subSubjectId, term, chosenSubjectRow, title, pdfFile, busy]);

  /* -------- Submit -------- */
  const publish = async () => {
    if (!chosenSubjectRow || !pdfFile) return;
    setBusy(true); setProgress(0);
    try {
      const educationType = sectionCode === "azhar" ? "أزهر" : sectionCode === "shared" ? "both" : "عام";
      const chosenSectionId = sections.find((s) => s.code === sectionCode)?.id || null;
      const chosenTrackId = allTracks.find((t) => t.code === trackCode)?.id || null;

      // 1) Create draft row
      const created = await callAdmin("create", {
        title: title.trim(),
        description: description.trim() || null,
        education_type: educationType,
        stage_id: stageId,
        grade_id: gradeId,
        section_id: chosenSectionId,
        track_id: chosenTrackId,
        subject_id: chosenSubjectRow.id,
        subject_name_ar: chosenSubjectRow.name_ar,
        term,
        edition_year: editionYear ? Number(editionYear) : null,
        sub_subject_name: showSubSubject ? chosenSubjectRow.source_category || chosenSubjectRow.name_ar : null,
      });
      const bookId = created.book.id;

      // 2) Upload PDF
      const pdfUri = await uploadBookToBunny({
        file: pdfFile, userId,
        onProgress: (l, t) => setProgress(Math.round((l / t) * 85)),
      });

      // 3) Optional cover
      let coverUri: string | null = null;
      if (coverFile) {
        coverUri = await uploadBookToBunny({
          file: coverFile, userId,
          onProgress: (l, t) => setProgress(85 + Math.round((l / t) * 10)),
        });
      }
      setProgress(96);

      // 4) Update record
      await callAdmin("update", {
        id: bookId, pdf_path: pdfUri, cover_url: coverUri, file_size: pdfFile.size,
      });

      // 5) Publish → triggers processing
      await callAdmin("publish", { id: bookId });
      setProgress(100);
      toast.success("تم نشر الكتاب بنجاح ✅");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "فشل نشر الكتاب");
    } finally {
      setBusy(false);
    }
  };

  /* -------- UI -------- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" style={{ fontFamily: "Cairo, system-ui, sans-serif" }}>
      <div className="mx-auto max-w-6xl p-4 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 hover:bg-slate-50">
              <ArrowRight className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">رفع كتاب جديد</h1>
              <p className="text-xs text-slate-500 mt-0.5">جميع الحقول تُحمَّل مباشرة من قاعدة بيانات المكتبة الرسمية</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs text-blue-700 border border-blue-100">
            <Sparkles className="h-3.5 w-3.5" /> صفحة واحدة — بدون خطوات
          </div>
        </div>

        {taxonomyLoading ? (
          <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> جاري تحميل الأنظمة والمراحل والصفوف…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main form */}
            <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 md:p-6">
              <h2 className="text-sm font-bold text-slate-900 mb-4">تصنيف الكتاب</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField
                  label="النظام التعليمي" required
                  value={sectionCode}
                  onChange={(v) => setSectionCode(v as any)}
                  placeholder="عام / أزهري / مشترك"
                  options={sections.filter((s) => s.code && s.code !== "shared" || s.code === "shared").map((s) => ({ value: s.code!, label: s.name_ar }))}
                />
                <SelectField
                  label="المرحلة" required
                  value={stageId} onChange={setStageId}
                  disabled={!sectionCode}
                  placeholder="اختر المرحلة"
                  options={stageOptions}
                />
                <SelectField
                  label="الصف" required
                  value={gradeId} onChange={setGradeId}
                  disabled={!stageId}
                  placeholder={stageId ? "اختر الصف" : "اختر المرحلة أولًا"}
                  options={gradeOptions}
                />
                <SelectField
                  label={`الشعبة${showTrack ? "" : " (غير مطلوبة لهذا الصف)"}`}
                  required={showTrack}
                  value={trackCode} onChange={setTrackCode}
                  disabled={!gradeId || !showTrack || scopeLoading}
                  placeholder={scopeLoading ? "جاري تحديد الشُعب…" : showTrack ? "اختر الشعبة" : "لا توجد شُعب لهذا الصف"}
                  options={trackOptions}
                />
                <SelectField
                  label="المادة" required
                  value={subjectKey} onChange={setSubjectKey}
                  disabled={!gradeId || scopeLoading || (showTrack && !trackCode)}
                  placeholder={scopeLoading ? "جاري تحميل المواد…" : subjectOptions.length === 0 ? "لا توجد مواد" : "اختر المادة"}
                  options={subjectOptions}
                  hint={!scopeLoading && subjectOptions.length === 0 && lastDiag
                    ? `التشخيص: 0 نتيجة من public.${lastDiag.table} — راجع الفلاتر أدناه.`
                    : undefined}
                />
                <SelectField
                  label={`المادة الفرعية${showSubSubject ? "" : " (غير متوفرة)"}`}
                  required={showSubSubject}
                  value={subSubjectId} onChange={setSubSubjectId}
                  disabled={!showSubSubject}
                  placeholder={showSubSubject ? "اختر المادة الفرعية" : "لا توجد فروع لهذه المادة"}
                  options={subSubjectOptions}
                />
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

              {/* Diagnostics */}
              {lastDiag && subjectOptions.length === 0 && !scopeLoading && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900" dir="ltr">
                  <div className="font-bold mb-1 flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Diagnostics</div>
                  <div><b>Table:</b> public.{lastDiag.table}</div>
                  <div><b>Filter:</b> {JSON.stringify(lastDiag.filter)}</div>
                  <div><b>Rows returned:</b> {lastDiag.count}</div>
                  <div><b>Backend error:</b> {lastDiag.error || "none"}</div>
                </div>
              )}

              <div className="my-6 h-px bg-slate-200" />

              <h2 className="text-sm font-bold text-slate-900 mb-4">بيانات الكتاب</h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-800">اسم الكتاب <span className="text-rose-500">*</span></Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: المرشد في الأحياء" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold text-slate-800">وصف مختصر (اختياري)</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-xl resize-none" />
                </div>
              </div>
            </div>

            {/* Side panel: files & submit */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" /> ملف PDF <span className="text-rose-500">*</span></h3>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40 py-6 transition">
                  <Upload className="h-6 w-6 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-600">{pdfFile ? pdfFile.name : "اسحب الملف أو اضغط للاختيار"}</span>
                  {pdfFile && <span className="text-[11px] text-slate-500 mt-0.5">{bytes(pdfFile.size)}</span>}
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-violet-600" /> صورة الغلاف (اختياري)</h3>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/40 py-6 transition">
                  <ImageIcon className="h-6 w-6 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-600">{coverFile ? coverFile.name : "اختر صورة الغلاف"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              {busy && (
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-center">
                    {progress < 85 ? "جاري رفع الملف…" : progress < 96 ? "جاري رفع الغلاف…" : progress < 100 ? "جاري الإنهاء…" : "تم"}
                  </p>
                </div>
              )}

              <Button
                onClick={publish}
                disabled={!canSubmit}
                className="w-full h-12 rounded-xl text-base font-bold shadow-sm"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Sparkles className="h-4 w-4 ml-2" />}
                حفظ ونشر الكتاب
              </Button>

              <p className="text-[11px] text-slate-500 leading-relaxed text-center">
                جميع القوائم تعتمد على العلاقات الحقيقية بين
                <span dir="ltr" className="mx-1">library_sections → library_stages → library_grades → library_tracks → library_subjects</span>
                داخل قاعدة الإنتاج، بدون أي بيانات ثابتة في الكود.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
