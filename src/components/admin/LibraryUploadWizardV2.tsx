import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import { uploadBookToBunny } from "@/lib/studentLibrary";
import {
  fetchLibraryTaxonomy,
  fetchSourceSubjectsForPicker,
  mapSourceSubjectsToLibrarySubjects,
  sourceGradeFromLibraryGradeCode,
  tracksForLibraryContext,
  type LibraryGradeRow,
  type LibraryPickerSubject,
  type LibrarySectionRow,
  type LibraryStageRow,
  type LibraryTrackRow,
  type QueryDiag,
  type SourceSubjectRow,
} from "@/lib/libraryTaxonomy";

function DiagBox({ diag, hint }: { diag: QueryDiag | null; hint?: string }) {
  if (!diag) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900" dir="ltr">
      <div className="font-bold mb-1">🔎 Diagnostics</div>
      <div><b>Table:</b> public.{diag.table}</div>
      <div><b>Filter:</b> {JSON.stringify(diag.filter)}</div>
      <div><b>Rows returned:</b> {diag.count}</div>
      <div><b>Backend error:</b> {diag.error || "none"}</div>
      <div><b>Query status:</b> {diag.ok ? "success" : "failed"}</div>
      {hint && <div className="mt-1 text-amber-800">💡 {hint}</div>}
    </div>
  );
}

const ENV_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ENV_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "");

async function callAdmin(action: string, method: "POST" | "GET", body?: unknown) {
  const url = new URL(`${ENV_URL}/functions/v1/library-admin`);
  url.searchParams.set("action", action);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("يجب تسجيل الدخول أولًا");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ENV_KEY,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
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

const uniqueSubjects = (subjects: LibraryPickerSubject[]) => {
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    const key = `${subject.name_ar}__${subject.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function LibraryUploadWizardV2({ onClose, onDone, userId }: { onClose: () => void; onDone: () => void; userId: string }) {
  const [step, setStep] = useState(1);
  const [sections, setSections] = useState<LibrarySectionRow[]>([]);
  const [stages, setStages] = useState<LibraryStageRow[]>([]);
  const [grades, setGrades] = useState<LibraryGradeRow[]>([]);
  const [tracks, setTracks] = useState<LibraryTrackRow[]>([]);
  const [sourceSubjects, setSourceSubjects] = useState<SourceSubjectRow[]>([]);
  const [subjects, setSubjects] = useState<LibraryPickerSubject[]>([]);
  const [diagnostics, setDiagnostics] = useState<QueryDiag[]>([]);
  const [taxonomyLoading, setTaxonomyLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [sectionId, setSectionId] = useState("");
  const [stageId, setStageId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const selectedSection = useMemo(() => sections.find((s) => s.id === sectionId) || null, [sections, sectionId]);
  const selectedStage = useMemo(() => stages.find((s) => s.id === stageId) || null, [stages, stageId]);
  const selectedGrade = useMemo(() => grades.find((g) => g.id === gradeId) || null, [grades, gradeId]);
  const selectedTrack = useMemo(() => tracks.find((t) => t.id === trackId) || null, [tracks, trackId]);
  const selectedSubject = useMemo(() => subjects.find((s) => s.id === subjectId) || null, [subjects, subjectId]);
  const educationType = selectedSection?.code === "azhar" ? "أزهر" : selectedSection?.code === "shared" ? "both" : "عام";
  const visibleGrades = useMemo(() => grades.filter((g) => g.stage_id === stageId), [grades, stageId]);
  const visibleTracks = useMemo(() => tracksForLibraryContext({ educationType, stageCode: selectedStage?.code, gradeCode: selectedGrade?.code, sourceSubjects, allTracks: tracks }), [educationType, selectedStage?.code, selectedGrade?.code, sourceSubjects, tracks]);
  const tracksRequired = visibleTracks.length > 0;
  const visibleSubjects = useMemo(() => uniqueSubjects(subjects), [subjects]);

  useEffect(() => {
    let mounted = true;
    setTaxonomyLoading(true);
    fetchLibraryTaxonomy()
      .then((data) => {
        if (!mounted) return;
        setSections(data.sections.filter((s) => s.code !== "shared"));
        setStages(data.stages);
        setGrades(data.grades);
        setTracks(data.tracks.filter((t) => t.code !== "none"));
        setDiagnostics(data.diagnostics);
      })
      .catch((e: any) => toast.error(e?.message || "تعذر تحميل بيانات المكتبة"))
      .finally(() => mounted && setTaxonomyLoading(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => { setStageId(""); setGradeId(""); setTrackId(""); setSubjectId(""); setSourceSubjects([]); setSubjects([]); }, [sectionId]);
  useEffect(() => { setGradeId(""); setTrackId(""); setSubjectId(""); setSourceSubjects([]); setSubjects([]); }, [stageId]);
  useEffect(() => { setTrackId(""); setSubjectId(""); setSourceSubjects([]); setSubjects([]); }, [gradeId]);

  useEffect(() => {
    let mounted = true;
    setSourceSubjects([]);
    setSubjects([]);
    setSubjectId("");
    if (!selectedSection || !selectedStage || !selectedGrade) return;
    fetchSourceSubjectsForPicker({
      educationType,
      stageCode: selectedStage.code,
      gradeCode: selectedGrade.code,
      trackCode: null,
    }).then(({ rows, diag }) => {
      if (!mounted) return;
      setSourceSubjects(rows);
      setDiagnostics((prev) => [...prev.filter((d) => d.table !== "subjects"), diag]);
    }).catch((e: any) => toast.error(e?.message || "تعذر تحميل مواد الصف"));
    return () => { mounted = false; };
  }, [educationType, selectedGrade, selectedSection, selectedStage]);

  useEffect(() => {
    let mounted = true;
    setSubjectId("");
    setSubjects([]);
    if (!selectedSection || !selectedStage || !selectedGrade) return;
    if (selectedStage.code === "secondary" && sourceSubjects.length === 0) return;
    if (tracksRequired && !selectedTrack) return;
    setSubjectsLoading(true);
    fetchSourceSubjectsForPicker({
      educationType,
      stageCode: selectedStage.code,
      gradeCode: selectedGrade.code,
      trackCode: selectedTrack?.code || null,
    })
      .then(async ({ rows, diag }) => {
        const mapped = await mapSourceSubjectsToLibrarySubjects(rows);
        if (!mounted) return;
        setSubjects(mapped.rows);
        setDiagnostics((prev) => [...prev.filter((d) => !["subjects", "library_subjects"].includes(d.table)), diag, mapped.diag]);
      })
      .catch((e: any) => toast.error(e?.message || "تعذر تحميل المواد"))
      .finally(() => mounted && setSubjectsLoading(false));
    return () => { mounted = false; };
  }, [educationType, selectedGrade, selectedSection, selectedStage, selectedTrack, sourceSubjects.length, tracksRequired]);

  const nextEnabled = () => {
    switch (step) {
      case 1: return !!sectionId;
      case 2: return !!stageId;
      case 3: return !!gradeId;
      case 4: return tracksRequired ? !!trackId : true;
      case 5: return !!subjectId;
      case 6: return !!pdfFile;
      case 7: return true;
      case 8: return title.trim().length > 0;
      default: return true;
    }
  };

  const publish = async () => {
    if (!pdfFile || !selectedSubject) return;
    setBusy(true);
    try {
      const created = await callAdmin("create", "POST", {
        title,
        description,
        education_type: educationType,
        stage_id: stageId || null,
        grade_id: gradeId || null,
        section_id: sectionId || null,
        track_id: trackId || null,
        subject_id: selectedSubject.id,
        subject_name_ar: selectedSubject.name_ar,
      });
      const bookId = created.book.id;
      const uri = await uploadBookToBunny({ file: pdfFile, userId, onProgress: (l, t) => setProgress(Math.round((l / t) * 90)) });
      let coverUri: string | null = null;
      if (coverFile) coverUri = await uploadBookToBunny({ file: coverFile, userId, onProgress: (l, t) => setProgress(90 + Math.round((l / t) * 4)) });
      setProgress(95);
      await callAdmin("update", "POST", { id: bookId, pdf_path: uri, cover_url: coverUri, file_size: pdfFile.size });
      setProgress(100);
      await callAdmin("publish", "POST", { id: bookId });
      toast.success("تم نشر الكتاب بنجاح");
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "فشل النشر");
    } finally {
      setBusy(false);
    }
  };

  const OptionsGrid = ({ items, selected, onPick }: { items: Array<{ id: string; name_ar: string }>; selected: string; onPick: (id: string) => void }) => (
    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => onPick(it.id)} className={`min-h-11 rounded-lg border text-sm font-semibold px-3 py-2 text-right text-slate-900 ${selected === it.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white hover:bg-slate-50"}`}>
          {it.name_ar}
        </button>
      ))}
    </div>
  );

  const Empty = ({ loading, diag, hint }: { loading: boolean; diag: QueryDiag | null; hint?: string }) => loading ? (
    <div className="flex items-center py-4 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل من قاعدة البيانات…</div>
  ) : (
    <><p className="text-xs text-rose-600">{diag?.error ? "فشل الاستعلام — راجع التشخيص أدناه." : "لا توجد بيانات مطابقة في قاعدة البيانات."}</p><DiagBox diag={diag} hint={hint} /></>
  );

  const diagFor = (table: string) => diagnostics.find((d) => d.table === table) || null;

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl bg-white text-slate-900 dark:bg-white dark:text-slate-900" dir="rtl">
        <DialogHeader><DialogTitle className="text-right text-slate-900">رفع كتاب جديد — خطوة {step} من 10</DialogTitle></DialogHeader>
        <div className="min-h-[240px] py-2 text-slate-900">
          {step === 1 && <div className="space-y-3"><Label className="text-slate-800">النظام التعليمي</Label>{taxonomyLoading || sections.length === 0 ? <Empty loading={taxonomyLoading} diag={diagFor("library_sections")} /> : <OptionsGrid items={sections} selected={sectionId} onPick={setSectionId} />}</div>}
          {step === 2 && <div className="space-y-3"><Label className="text-slate-800">المرحلة</Label>{stages.length === 0 ? <Empty loading={taxonomyLoading} diag={diagFor("library_stages")} /> : <OptionsGrid items={stages} selected={stageId} onPick={setStageId} />}</div>}
          {step === 3 && <div className="space-y-3"><Label className="text-slate-800">الصف</Label>{visibleGrades.length === 0 ? <Empty loading={taxonomyLoading} diag={diagFor("library_grades")} hint="الصفوف تُعرض فقط حسب المرحلة المختارة." /> : <OptionsGrid items={visibleGrades} selected={gradeId} onPick={setGradeId} />}</div>}
          {step === 4 && <div className="space-y-3"><Label className="text-slate-800">الشعبة {tracksRequired ? "" : "(غير مطلوبة لهذا الصف)"}</Label>{!tracksRequired ? <p className="text-xs text-slate-500">هذا الصف لا يحتاج شعبة منفصلة. اضغط التالي.</p> : <OptionsGrid items={visibleTracks} selected={trackId} onPick={setTrackId} />}</div>}
          {step === 5 && <div className="space-y-3"><Label className="text-slate-800">المادة</Label>{subjectsLoading ? <div className="flex items-center py-4 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري تحميل المواد الحقيقية…</div> : visibleSubjects.length === 0 ? <Empty loading={false} diag={diagFor("subjects")} hint={`يتم جلب المواد من جدول subjects حسب المرحلة=${selectedStage?.code || "—"} والصف=${sourceGradeFromLibraryGradeCode(selectedGrade?.code)} والشعبة=${selectedTrack?.code || "بدون"}.`} /> : <><OptionsGrid items={visibleSubjects} selected={subjectId} onPick={setSubjectId} /><p className="text-[10px] text-slate-500 mt-1" dir="ltr">✓ subjects: {sourceSubjects.length} · library_subjects mapped: {visibleSubjects.length}</p></>}</div>}
          {step === 6 && <div className="space-y-2"><Label>ملف PDF</Label><Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />{pdfFile && <p className="text-xs text-slate-500">{pdfFile.name} — {bytes(pdfFile.size)}</p>}</div>}
          {step === 7 && <div className="space-y-2"><Label>صورة الغلاف (اختياري)</Label><Input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />{coverFile && <p className="text-xs text-slate-500">{coverFile.name}</p>}</div>}
          {step === 8 && <div className="space-y-2"><Label>اسم الكتاب</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: المرشد في الأحياء" /></div>}
          {step === 9 && <div className="space-y-2"><Label>الوصف (اختياري)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} /></div>}
          {step === 10 && <div className="space-y-3"><h3 className="font-bold text-slate-900">مراجعة ونشر</h3><div className="text-sm space-y-1 text-slate-700"><div>النظام: <b>{selectedSection?.name_ar || "—"}</b></div><div>المرحلة: <b>{selectedStage?.name_ar || "—"}</b></div><div>الصف: <b>{selectedGrade?.name_ar || "—"}</b></div><div>الشعبة: <b>{selectedTrack?.name_ar || (tracksRequired ? "—" : "بلا")}</b></div><div>المادة: <b>{selectedSubject?.name_ar || "—"}</b></div><div>العنوان: <b>{title}</b></div><div>الملف: <b>{pdfFile ? `${pdfFile.name} (${bytes(pdfFile.size)})` : "—"}</b></div></div>{busy && <div className="mt-2"><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} /></div><p className="text-xs text-slate-500 mt-1">{progress < 90 ? "جاري رفع الملف…" : progress < 100 ? "جاري الإنهاء…" : "تم"}</p></div>}</div>}
        </div>
        <div className="flex items-center justify-between pt-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => step > 1 ? setStep(step - 1) : onClose()} disabled={busy}>{step > 1 ? "السابق" : "إلغاء"}</Button>
          {step < 10 ? <Button size="sm" onClick={() => setStep(step + 1)} disabled={!nextEnabled()}>التالي <ChevronRight className="h-4 w-4 mr-1 rotate-180" /></Button> : <Button size="sm" onClick={publish} disabled={busy || !pdfFile || !selectedSubject}>{busy ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Sparkles className="h-4 w-4 ml-1" />}نشر الكتاب</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}