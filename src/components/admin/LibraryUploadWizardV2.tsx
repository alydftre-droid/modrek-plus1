// LibraryUploadWizardV2 — rebuilt from scratch.
// Every filter list is loaded on-demand from the real Supabase project (B).
// No hardcoded lists, no seed data, no cache. When a query returns 0 rows the
// component surfaces a full diagnostic block (table, filter, count, error).

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

// ---- Types tied to the real schema in project B ----
interface Section { id: string; code: string; name_ar: string }
interface Stage   { id: string; code: string; name_ar: string }
interface Grade   { id: string; code: string; name_ar: string; stage_id: string }
interface Track   { id: string; code: string; name_ar: string }
interface Subject { id: string; code: string; name_ar: string; stage_id: string | null; grade_id: string | null; section_id: string | null; curriculum_track: string | null }

interface QueryDiag {
  table: string;
  filter: Record<string, unknown>;
  count: number;
  error: string | null;
  ok: boolean;
}

function DiagBox({ diag, hint }: { diag: QueryDiag | null; hint?: string }) {
  if (!diag) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900" dir="ltr">
      <div className="font-bold mb-1">🔎 Diagnostics</div>
      <div><b>Table:</b> public.{diag.table}</div>
      <div><b>Filter:</b> {JSON.stringify(diag.filter)}</div>
      <div><b>Rows returned:</b> {diag.count}</div>
      <div><b>Supabase error:</b> {diag.error || "none"}</div>
      <div><b>Query status:</b> {diag.ok ? "success (0 rows)" : "failed"}</div>
      {hint && <div className="mt-1 text-amber-800">💡 {hint}</div>}
    </div>
  );
}

// ---- Live loaders ----
async function fetchSections(): Promise<{ rows: Section[]; diag: QueryDiag }> {
  const filter = { is_active: true };
  const { data, error } = await supabase
    .from("library_sections")
    .select("id,code,name_ar")
    .eq("is_active", true)
    .order("sort_order");
  return {
    rows: (data as Section[]) ?? [],
    diag: { table: "library_sections", filter, count: data?.length ?? 0, error: error?.message ?? null, ok: !error },
  };
}
async function fetchStages(): Promise<{ rows: Stage[]; diag: QueryDiag }> {
  const filter = { is_active: true };
  const { data, error } = await supabase
    .from("library_stages")
    .select("id,code,name_ar")
    .eq("is_active", true)
    .order("sort_order");
  return {
    rows: (data as Stage[]) ?? [],
    diag: { table: "library_stages", filter, count: data?.length ?? 0, error: error?.message ?? null, ok: !error },
  };
}
async function fetchGrades(stageId: string): Promise<{ rows: Grade[]; diag: QueryDiag }> {
  const filter = { is_active: true, stage_id: stageId };
  const { data, error } = await supabase
    .from("library_grades")
    .select("id,code,name_ar,stage_id")
    .eq("is_active", true)
    .eq("stage_id", stageId)
    .order("sort_order");
  return {
    rows: (data as Grade[]) ?? [],
    diag: { table: "library_grades", filter, count: data?.length ?? 0, error: error?.message ?? null, ok: !error },
  };
}
async function fetchTracks(): Promise<{ rows: Track[]; diag: QueryDiag }> {
  const filter = { is_active: true, code_not: "none" };
  const { data, error } = await supabase
    .from("library_tracks")
    .select("id,code,name_ar")
    .eq("is_active", true)
    .neq("code", "none")
    .order("sort_order");
  return {
    rows: (data as Track[]) ?? [],
    diag: { table: "library_tracks", filter, count: data?.length ?? 0, error: error?.message ?? null, ok: !error },
  };
}
// Subjects filter uses the REAL relational columns on library_subjects.
// Subjects in project B all sit under the "shared" section umbrella, so we
// accept both the selected section and the shared section.
async function fetchSubjects(args: {
  stageId: string;
  gradeId: string;
  sectionId: string;
  sharedSectionId: string | null;
  trackCode: string | null; // "literary" | "scientific" | null
}): Promise<{ rows: Subject[]; diag: QueryDiag; queryDesc: string }> {
  const sectionIds = args.sharedSectionId && args.sharedSectionId !== args.sectionId
    ? [args.sectionId, args.sharedSectionId]
    : [args.sectionId];

  let q = supabase
    .from("library_subjects")
    .select("id,code,name_ar,stage_id,grade_id,section_id,curriculum_track")
    .eq("is_active", true)
    .eq("stage_id", args.stageId)
    .eq("grade_id", args.gradeId)
    .in("section_id", sectionIds)
    .order("sort_order");

  if (args.trackCode) {
    q = q.eq("curriculum_track", args.trackCode);
  }
  const { data, error } = await q;
  const filter = { is_active: true, stage_id: args.stageId, grade_id: args.gradeId, section_id: `IN(${sectionIds.join(",")})`, curriculum_track: args.trackCode ?? "(any)" };
  const queryDesc = `SELECT id,name_ar FROM library_subjects WHERE is_active AND stage_id='${args.stageId}' AND grade_id='${args.gradeId}' AND section_id IN (${sectionIds.map((s) => `'${s}'`).join(",")})${args.trackCode ? ` AND curriculum_track='${args.trackCode}'` : ""}`;
  return {
    rows: (data as Subject[]) ?? [],
    diag: { table: "library_subjects", filter, count: data?.length ?? 0, error: error?.message ?? null, ok: !error },
    queryDesc,
  };
}

// ---- Small helper: call library-admin (used for create/update/publish only) ----
const ENV_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ENV_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "");
async function callAdmin(action: string, method: "POST" | "GET", body?: unknown) {
  const url = new URL(`${ENV_URL}/functions/v1/library-admin`);
  url.searchParams.set("action", action);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not signed in");
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

// ---- Component ----
export default function LibraryUploadWizardV2({ onClose, onDone, userId }: { onClose: () => void; onDone: () => void; userId: string }) {
  const [step, setStep] = useState(1);

  // Selections
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [sectionsDiag, setSectionsDiag] = useState<QueryDiag | null>(null);
  const [sectionsLoading, setSectionsLoading] = useState(false);

  const [stages, setStages] = useState<Stage[]>([]);
  const [stageId, setStageId] = useState("");
  const [stagesDiag, setStagesDiag] = useState<QueryDiag | null>(null);
  const [stagesLoading, setStagesLoading] = useState(false);

  const [grades, setGrades] = useState<Grade[]>([]);
  const [gradeId, setGradeId] = useState("");
  const [gradesDiag, setGradesDiag] = useState<QueryDiag | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackId, setTrackId] = useState("");
  const [tracksDiag, setTracksDiag] = useState<QueryDiag | null>(null);
  const [tracksLoading, setTracksLoading] = useState(false);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [subjectsDiag, setSubjectsDiag] = useState<QueryDiag | null>(null);
  const [subjectsQuery, setSubjectsQuery] = useState<string>("");
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const selectedSection = useMemo(() => sections.find((s) => s.id === sectionId) || null, [sections, sectionId]);
  const selectedStage   = useMemo(() => stages.find((s) => s.id === stageId) || null, [stages, stageId]);
  const selectedGrade   = useMemo(() => grades.find((g) => g.id === gradeId) || null, [grades, gradeId]);
  const selectedTrack   = useMemo(() => tracks.find((t) => t.id === trackId) || null, [tracks, trackId]);
  const selectedSubject = useMemo(() => subjects.find((s) => s.id === subjectId) || null, [subjects, subjectId]);
  const sharedSectionId = useMemo(() => sections.find((s) => s.code === "shared")?.id || null, [sections]);

  const tracksRequired = selectedStage?.code === "secondary" && selectedSection?.code === "general";

  // Load level 1 (systems / sections) on open
  useEffect(() => {
    setSectionsLoading(true);
    fetchSections().then(({ rows, diag }) => { setSections(rows); setSectionsDiag(diag); }).finally(() => setSectionsLoading(false));
    // Stages don't depend on section in the current schema, but we load only
    // after the user picks a system to match the requested dependency chain.
  }, []);

  // Load stages after picking a system
  useEffect(() => {
    if (!sectionId) { setStages([]); setStagesDiag(null); setStageId(""); return; }
    setStagesLoading(true);
    fetchStages().then(({ rows, diag }) => { setStages(rows); setStagesDiag(diag); }).finally(() => setStagesLoading(false));
  }, [sectionId]);

  // Load grades after picking a stage
  useEffect(() => {
    setGradeId(""); setTrackId(""); setSubjectId("");
    setGrades([]); setGradesDiag(null);
    if (!stageId) return;
    setGradesLoading(true);
    fetchGrades(stageId).then(({ rows, diag }) => { setGrades(rows); setGradesDiag(diag); }).finally(() => setGradesLoading(false));
  }, [stageId]);

  // Load tracks after picking a grade (only when required)
  useEffect(() => {
    setTrackId(""); setSubjectId("");
    setTracks([]); setTracksDiag(null);
    if (!gradeId) return;
    if (!tracksRequired) return; // no track needed for this stage/system
    setTracksLoading(true);
    fetchTracks().then(({ rows, diag }) => { setTracks(rows); setTracksDiag(diag); }).finally(() => setTracksLoading(false));
  }, [gradeId, tracksRequired]);

  // Load subjects after track (or grade if tracks not required)
  useEffect(() => {
    setSubjectId("");
    setSubjects([]); setSubjectsDiag(null); setSubjectsQuery("");
    if (!stageId || !gradeId || !sectionId) return;
    if (tracksRequired && !trackId) return;
    const trackCode = tracksRequired
      ? (selectedTrack?.code === "literary" ? "literary"
        : (selectedTrack?.code === "sci_science" || selectedTrack?.code === "sci_math") ? "scientific"
        : null)
      : null;
    setSubjectsLoading(true);
    fetchSubjects({
      stageId,
      gradeId,
      sectionId,
      sharedSectionId,
      trackCode,
    })
      .then(({ rows, diag, queryDesc }) => { setSubjects(rows); setSubjectsDiag(diag); setSubjectsQuery(queryDesc); })
      .finally(() => setSubjectsLoading(false));
  }, [stageId, gradeId, sectionId, trackId, tracksRequired, selectedTrack?.code, sharedSectionId]);

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

  const educationType = selectedSection?.code === "azhar" ? "أزهر"
    : selectedSection?.code === "shared" ? "both"
    : "عام";

  const publish = async () => {
    if (!pdfFile) return;
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
        subject_id: subjectId || null,
        subject_name_ar: selectedSubject?.name_ar || "",
      });
      const bookId = created.book.id;

      const uri = await uploadBookToBunny({
        file: pdfFile,
        userId,
        onProgress: (l, t) => setProgress(Math.round((l / t) * 90)),
      });
      let coverUri: string | null = null;
      if (coverFile) {
        coverUri = await uploadBookToBunny({
          file: coverFile,
          userId,
          onProgress: (l, t) => setProgress(90 + Math.round((l / t) * 4)),
        });
      }
      setProgress(95);
      await callAdmin("update", "POST", {
        id: bookId,
        pdf_path: uri,
        cover_url: coverUri,
        file_size: pdfFile.size,
      });
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
        <button
          key={it.id}
          type="button"
          onClick={() => onPick(it.id)}
          className={`h-11 rounded-lg border text-sm font-semibold px-3 text-right text-slate-900 ${selected === it.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white hover:bg-slate-50"}`}
        >
          {it.name_ar}
        </button>
      ))}
    </div>
  );

  const Empty = ({ loading, diag, hint }: { loading: boolean; diag: QueryDiag | null; hint?: string }) =>
    loading ? (
      <div className="flex items-center py-4 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل من قاعدة البيانات…</div>
    ) : (
      <>
        <p className="text-xs text-rose-600">
          {diag?.error ? "فشل الاستعلام — راجع التشخيص أدناه." : "لا توجد بيانات — راجع التشخيص أدناه."}
        </p>
        <DiagBox diag={diag} hint={hint} />
      </>
    );

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl bg-white text-slate-900 dark:bg-white dark:text-slate-900" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-slate-900">رفع كتاب جديد — خطوة {step} من 10</DialogTitle>
        </DialogHeader>

        <div className="min-h-[240px] py-2 text-slate-900">
          {step === 1 && (
            <div className="space-y-3">
              <Label className="text-slate-800">النظام التعليمي</Label>
              {sections.length === 0 ? <Empty loading={sectionsLoading} diag={sectionsDiag} hint="جدول library_sections لا يحتوي على صفوف نشطة." />
                : <OptionsGrid items={sections} selected={sectionId} onPick={setSectionId} />}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Label className="text-slate-800">المرحلة</Label>
              {stages.length === 0 ? <Empty loading={stagesLoading} diag={stagesDiag} hint="لا توجد مراحل نشطة في library_stages." />
                : <OptionsGrid items={stages} selected={stageId} onPick={setStageId} />}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <Label className="text-slate-800">الصف</Label>
              {grades.length === 0 ? <Empty loading={gradesLoading} diag={gradesDiag} hint={`لا توجد صفوف نشطة مربوطة بالمرحلة ${selectedStage?.name_ar || ""}. تحقق من library_grades.stage_id.`} />
                : <OptionsGrid items={grades} selected={gradeId} onPick={setGradeId} />}
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <Label className="text-slate-800">الشعبة {tracksRequired ? "" : "(غير مطلوبة لهذه المرحلة)"}</Label>
              {!tracksRequired ? (
                <p className="text-xs text-slate-500">هذه المرحلة/النظام لا يحتاج شعبة. اضغط التالي.</p>
              ) : tracks.length === 0 ? (
                <Empty loading={tracksLoading} diag={tracksDiag} hint="لا توجد شُعَب نشطة في library_tracks." />
              ) : (
                <OptionsGrid items={tracks} selected={trackId} onPick={setTrackId} />
              )}
            </div>
          )}
          {step === 5 && (
            <div className="space-y-3">
              <Label className="text-slate-800">المادة</Label>
              {subjectsLoading ? (
                <div className="flex items-center py-4 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري تحميل المواد…</div>
              ) : subjects.length === 0 ? (
                <>
                  <p className="text-xs text-rose-600">
                    {subjectsDiag?.error
                      ? "فشل استعلام المواد — راجع التشخيص أدناه."
                      : "لا توجد مواد مطابقة للفلتر الحالي في قاعدة البيانات."}
                  </p>
                  <DiagBox
                    diag={subjectsDiag}
                    hint={subjectsQuery ? `Executed SQL (equivalent): ${subjectsQuery}` : undefined}
                  />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                    {subjects.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSubjectId(s.id)}
                        className={`h-11 rounded-lg border text-sm font-semibold px-3 text-right text-slate-900 ${subjectId === s.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white hover:bg-slate-50"}`}
                      >
                        {s.name_ar}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1" dir="ltr">✓ {subjects.length} rows from public.library_subjects</p>
                </>
              )}
            </div>
          )}
          {step === 6 && (
            <div className="space-y-2">
              <Label>ملف PDF</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
              {pdfFile && <p className="text-xs text-slate-500">{pdfFile.name} — {bytes(pdfFile.size)}</p>}
            </div>
          )}
          {step === 7 && (
            <div className="space-y-2">
              <Label>صورة الغلاف (اختياري)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
              {coverFile && <p className="text-xs text-slate-500">{coverFile.name}</p>}
            </div>
          )}
          {step === 8 && (
            <div className="space-y-2">
              <Label>اسم الكتاب</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: المرشد في الأحياء" />
            </div>
          )}
          {step === 9 && (
            <div className="space-y-2">
              <Label>الوصف (اختياري)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>
          )}
          {step === 10 && (
            <div className="space-y-3">
              <h3 className="font-bold text-slate-900">مراجعة ونشر</h3>
              <div className="text-sm space-y-1 text-slate-700">
                <div>النظام: <b>{selectedSection?.name_ar || "—"}</b></div>
                <div>المرحلة: <b>{selectedStage?.name_ar || "—"}</b></div>
                <div>الصف: <b>{selectedGrade?.name_ar || "—"}</b></div>
                <div>الشعبة: <b>{selectedTrack?.name_ar || (tracksRequired ? "—" : "بلا")}</b></div>
                <div>المادة: <b>{selectedSubject?.name_ar || "—"}</b></div>
                <div>العنوان: <b>{title}</b></div>
                <div>الملف: <b>{pdfFile ? `${pdfFile.name} (${bytes(pdfFile.size)})` : "—"}</b></div>
              </div>
              {busy && (
                <div className="mt-2">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{progress < 90 ? "جاري رفع الملف…" : progress < 100 ? "جاري الإنهاء…" : "تم"}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => step > 1 ? setStep(step - 1) : onClose()} disabled={busy}>
            {step > 1 ? "السابق" : "إلغاء"}
          </Button>
          {step < 10 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!nextEnabled()}>
              التالي <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
            </Button>
          ) : (
            <Button size="sm" onClick={publish} disabled={busy || !pdfFile}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Sparkles className="h-4 w-4 ml-1" />}
              نشر الكتاب
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
