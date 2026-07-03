import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  X, ArrowLeft, ArrowRight, Check, UploadCloud, FileText, Image as ImageIcon,
  BookOpen, NotebookPen, ClipboardList, Landmark, Database, File as FileIcon,
  Loader2, Trash2, Sparkles, Lightbulb, ChevronDown, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Taxo = { id: string; name_ar: string; code: string };
type Grade = Taxo & { stage_id: string };
type Subject = Taxo & { stage_id: string | null; section_id: string | null };
type SubSubject = Taxo & { subject_id: string };
type SourceType = { id: string; code: string; name_ar: string; icon: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (sourceId: string) => void;
  presetTypeCode?: string | null;
  types: SourceType[];
  stages: Taxo[];
  grades: Grade[];
  sections: Taxo[];
  tracks: Taxo[];
  subjects: Taxo[];
  subSubjects: SubSubject[];
  typeCounts: Record<string, number>;
};

const TYPE_ICONS: Record<string, any> = {
  book: BookOpen, booklet: NotebookPen, notebook: NotebookPen,
  "file-text": FileText, clipboard: ClipboardList, "file-check": ClipboardList,
  landmark: Landmark, database: Database, file: FileIcon,
};
const TYPE_TAGLINES: Record<string, string> = {
  book: "منهج دراسي كامل أو كتاب مرجعي",
  booklet: "ملزمة تلخيصية أو تدريبية",
  notebook: "مذكرة معلم أو ملخص محاضرات",
  exam: "امتحان مع الحل النموذجي",
  ministry: "نموذج وزاري رسمي",
  question_bank: "بنك أسئلة مصنّف",
  images: "مجموعة صور / ملفات ممسوحة",
  other: "أي مصدر معرفي آخر",
};
const ACCEPT = ".pdf,.docx,.pptx,.txt,image/*";

type UploadFile = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?: string;
  assetId?: string;
};

export default function ModrekUploadWizard({
  open, onClose, onCreated, presetTypeCode,
  types, stages, grades, sections, tracks, subjects, subSubjects, typeCounts,
}: Props) {
  const [step, setStep] = useState(1);
  const [typeId, setTypeId] = useState<string>("");
  const [tax, setTax] = useState({
    stage_id: "", grade_id: "", section_id: "", track_id: "",
    subject_id: "", sub_subject_id: "", term: "", year: "",
  });
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [meta, setMeta] = useState({
    title: "", description: "", author: "", publisher: "", language: "ar", keywords: "",
  });
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdSourceId, setCreatedSourceId] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<string>("uploaded");
  const [progressPct, setProgressPct] = useState<number>(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // reset
    setStep(1);
    setTypeId(presetTypeCode ? (types.find((t) => t.code === presetTypeCode)?.id ?? "") : "");
    setTax({ stage_id: "", grade_id: "", section_id: "", track_id: "", subject_id: "", sub_subject_id: "", term: "", year: "" });
    setFiles([]);
    setMeta({ title: "", description: "", author: "", publisher: "", language: "ar", keywords: "" });
    setCreatedSourceId(null); setPipelineStage("uploaded"); setProgressPct(0);
  }, [open, presetTypeCode, types]);

  const filteredGrades = useMemo(
    () => grades.filter((g) => !tax.stage_id || g.stage_id === tax.stage_id),
    [grades, tax.stage_id],
  );
  const filteredSubSubjects = useMemo(
    () => subSubjects.filter((s) => !tax.subject_id || s.subject_id === tax.subject_id),
    [subSubjects, tax.subject_id],
  );

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.file.size, 0), [files]);

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued" as const,
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...arr]);
  };
  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // ---------- Realtime for processing screen ----------
  useEffect(() => {
    if (step !== 5 || !createdSourceId) return;
    let versionId: string | null = null;
    const loadOnce = async () => {
      const { data } = await supabase
        .from("knowledge_source_versions")
        .select("id, pipeline_stage, progress_pct")
        .eq("source_id", createdSourceId)
        .eq("is_current", true)
        .maybeSingle();
      if (data) {
        versionId = data.id;
        setPipelineStage(data.pipeline_stage);
        setProgressPct(data.progress_pct ?? 0);
      }
    };
    loadOnce();
    const iv = setInterval(loadOnce, 3000);
    return () => clearInterval(iv);
  }, [step, createdSourceId]);

  // ---------- Actions ----------
  const canNext = () => {
    if (step === 1) return !!typeId;
    if (step === 2) return true; // taxonomy optional
    if (step === 3) return files.length > 0;
    if (step === 4) return meta.title.trim().length > 0;
    return true;
  };

  const goNext = () => setStep((s) => Math.min(5, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const startProcessing = async () => {
    if (!typeId || !meta.title.trim()) { toast.error("العنوان ونوع المصدر مطلوبان"); return; }
    setSaving(true);
    try {
      // 1) Create source
      const { data: src, error: srcErr } = await supabase.from("knowledge_sources").insert({
        title: meta.title.trim(),
        description: meta.description || null,
        author: meta.author || null,
        publisher: meta.publisher || null,
        publication_year: tax.year ? parseInt(tax.year) : null,
        language: meta.language || "ar",
        source_type_id: typeId,
        stage_id: tax.stage_id || null,
        grade_id: tax.grade_id || null,
        section_id: tax.section_id || null,
        track_id: tax.track_id || null,
        subject_id: tax.subject_id || null,
        sub_subject_id: tax.sub_subject_id || null,
        term: tax.term ? parseInt(tax.term) : null,
        status: "draft",
        metadata: {
          keywords: meta.keywords
            ? meta.keywords.split(",").map((k) => k.trim()).filter(Boolean)
            : [],
        },
      }).select("id").single();
      if (srcErr) throw srcErr;

      // 2) Create initial version
      const { data: ver, error: verErr } = await supabase.from("knowledge_source_versions").insert({
        source_id: src!.id, version_number: 1, is_current: true, notes: "النسخة الأولى",
      }).select("id").single();
      if (verErr) throw verErr;

      setCreatedSourceId(src!.id);
      setStep(5);

      // 3) Upload each file to modrek-upload
      for (const f of files) {
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "uploading", progress: 20 } : x));
        try {
          const form = new FormData();
          form.append("version_id", ver!.id);
          form.append("file", f.file);
          const { error } = await supabase.functions.invoke("modrek-upload", { body: form });
          if (error) throw error;
          setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "uploaded", progress: 100 } : x));
        } catch (e: any) {
          setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "failed", error: e.message } : x));
        }
      }
      toast.success("تم رفع الملفات — بدأت المعالجة الذكية");
    } catch (e: any) {
      console.error(e); toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-6">
      <div className="bg-white w-full md:max-w-6xl md:rounded-3xl shadow-2xl flex flex-col max-h-[100vh] md:max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="relative px-5 md:px-8 py-4 md:py-5 border-b bg-gradient-to-l from-violet-50 via-white to-blue-50">
          <button onClick={onClose} className="absolute top-3 left-3 h-8 w-8 rounded-full hover:bg-white flex items-center justify-center text-slate-500">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white flex items-center justify-center shadow-lg shrink-0">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg text-slate-900">إضافة مصدر جديد لمكتبة Modrek AI</h2>
              <p className="text-xs text-slate-500 hidden md:block">ارفع ملفاتك وأضفها إلى قاعدة المعرفة — 5 خطوات فقط.</p>
            </div>
          </div>

          {/* Stepper */}
          <div className="mt-4 flex items-center gap-1 md:gap-2 overflow-x-auto pb-1">
            {[
              { n: 1, l: "نوع المصدر" }, { n: 2, l: "التصنيف" },
              { n: 3, l: "رفع الملفات" }, { n: 4, l: "المعلومات" }, { n: 5, l: "المعالجة" },
            ].map((s) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <div key={s.n} className="flex items-center gap-1 md:gap-2 shrink-0">
                  <div className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold transition",
                    done ? "bg-emerald-500 text-white" : active ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500",
                  )}>
                    {done ? <Check className="h-4 w-4" /> : s.n}
                  </div>
                  <span className={cn("text-xs font-semibold hidden md:inline", active ? "text-blue-700" : done ? "text-emerald-600" : "text-slate-500")}>{s.l}</span>
                  {s.n < 5 && <div className={cn("h-0.5 w-4 md:w-8 rounded", done ? "bg-emerald-400" : "bg-slate-200")} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 md:py-6 grid md:grid-cols-[1fr_280px] gap-6">
          <div className="min-w-0">
            {step === 1 && (
              <StepBlock title="اختر نوع المصدر" hint="حدد نوع الملف الذي ستقوم برفعه — يساعدنا هذا على تحسين المعالجة.">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {types.map((t) => {
                    const Icon = TYPE_ICONS[t.icon ?? "file"] ?? FileIcon;
                    const sel = typeId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTypeId(t.id)}
                        className={cn(
                          "relative group rounded-2xl border-2 p-4 text-right transition-all",
                          sel ? "border-blue-500 bg-blue-50/70 shadow-lg scale-[1.02]" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50",
                        )}
                      >
                        {sel && (
                          <div className="absolute top-2 left-2 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition",
                          sel ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600",
                        )}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="font-bold text-sm text-slate-900">{t.name_ar}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 min-h-[28px]">{TYPE_TAGLINES[t.code] ?? "مصدر معرفي"}</div>
                        <div className="mt-2 text-[10px] text-slate-400">{typeCounts[t.id] ?? 0} مصدر موجود</div>
                      </button>
                    );
                  })}
                </div>
              </StepBlock>
            )}

            {step === 2 && (
              <StepBlock title="التصنيف الأكاديمي" hint="يساعد الطلاب والمساعد الذكي على إيجاد المصدر بسهولة (كل الحقول اختيارية).">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="المرحلة">
                    <NativeSelect value={tax.stage_id} onChange={(v) => setTax((t) => ({ ...t, stage_id: v, grade_id: "" }))}
                      placeholder="— اختر المرحلة —" options={stages} />
                  </Field>
                  <Field label="الصف">
                    <NativeSelect value={tax.grade_id} onChange={(v) => setTax((t) => ({ ...t, grade_id: v }))}
                      placeholder="— اختر الصف —" options={filteredGrades} disabled={!tax.stage_id} />
                  </Field>
                  <Field label="القسم (عام/أزهر)">
                    <NativeSelect value={tax.section_id} onChange={(v) => setTax((t) => ({ ...t, section_id: v }))}
                      placeholder="— القسم —" options={sections} />
                  </Field>
                  <Field label="الشعبة">
                    <NativeSelect value={tax.track_id} onChange={(v) => setTax((t) => ({ ...t, track_id: v }))}
                      placeholder="— الشعبة —" options={tracks} />
                  </Field>
                  <Field label="المادة">
                    <NativeSelect value={tax.subject_id} onChange={(v) => setTax((t) => ({ ...t, subject_id: v, sub_subject_id: "" }))}
                      placeholder="— المادة —" options={subjects} />
                  </Field>
                  <Field label="المادة الفرعية">
                    <NativeSelect value={tax.sub_subject_id} onChange={(v) => setTax((t) => ({ ...t, sub_subject_id: v }))}
                      placeholder="— المادة الفرعية —" options={filteredSubSubjects} disabled={!tax.subject_id} />
                  </Field>
                  <Field label="الترم">
                    <NativeSelect value={tax.term} onChange={(v) => setTax((t) => ({ ...t, term: v }))}
                      placeholder="— الترم —" options={[{ id: "1", name_ar: "الترم الأول" }, { id: "2", name_ar: "الترم الثاني" }]} />
                  </Field>
                  <Field label="سنة الإصدار">
                    <Input type="number" min={1990} max={2100} value={tax.year} onChange={(e) => setTax((t) => ({ ...t, year: e.target.value }))} placeholder="مثال: 2025" />
                  </Field>
                </div>
              </StepBlock>
            )}

            {step === 3 && (
              <StepBlock title="رفع الملفات" hint="يمكنك رفع أكثر من ملف مرة واحدة. سيتم معالجتها جميعًا بشكل ذكي.">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(false);
                    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                  }}
                  className={cn(
                    "rounded-3xl border-2 border-dashed p-8 md:p-10 text-center transition",
                    dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/40",
                  )}
                >
                  <div className="h-16 w-16 rounded-2xl mx-auto bg-gradient-to-br from-blue-500 to-violet-600 text-white flex items-center justify-center shadow-lg mb-4">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <div className="font-bold text-lg text-slate-900">اسحب وأفلت الملفات هنا</div>
                  <div className="text-sm text-slate-500 mt-1">أو اضغط للاختيار من جهازك</div>
                  <div className="text-[11px] text-slate-400 mt-3">
                    PDF, DOCX, PPTX, TXT, PNG, JPG, JPEG, WEBP · الحد الأقصى 200MB لكل ملف
                  </div>
                  <Button className="mt-5" onClick={() => fileInput.current?.click()}>
                    <UploadCloud className="h-4 w-4 ml-2" /> اختر الملفات
                  </Button>
                  <input
                    ref={fileInput} type="file" multiple className="hidden" accept={ACCEPT}
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-slate-800">الملفات المحددة ({files.length})</div>
                    <div className="text-xs text-slate-500">{fmtBytes(totalBytes)}</div>
                  </div>
                  {files.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-400">لم يتم اختيار أي ملفات بعد</div>
                  ) : (
                    <div className="space-y-2">
                      {files.map((f) => <FileCard key={f.id} f={f} onRemove={() => removeFile(f.id)} />)}
                    </div>
                  )}
                </div>
              </StepBlock>
            )}

            {step === 4 && (
              <StepBlock title="معلومات المصدر" hint="حقول تساعد على فهرسة المصدر بشكل أفضل. العنوان مطلوب.">
                <div className="grid gap-3">
                  <Field label="عنوان المصدر *">
                    <Input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} placeholder="مثال: كتاب الفقه للصف الثالث الثانوي — الأزهر" />
                  </Field>
                  <Field label="وصف مختصر">
                    <Textarea rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} placeholder="نبذة عن محتوى المصدر ومن يستفيد منه" />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="المؤلف">
                      <Input value={meta.author} onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))} />
                    </Field>
                    <Field label="دار النشر">
                      <Input value={meta.publisher} onChange={(e) => setMeta((m) => ({ ...m, publisher: e.target.value }))} />
                    </Field>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="لغة المحتوى">
                      <NativeSelect value={meta.language} onChange={(v) => setMeta((m) => ({ ...m, language: v }))}
                        options={[{ id: "ar", name_ar: "العربية" }, { id: "en", name_ar: "الإنجليزية" }, { id: "fr", name_ar: "الفرنسية" }]}
                      />
                    </Field>
                    <Field label="كلمات مفتاحية (مفصولة بفواصل)">
                      <Input value={meta.keywords} onChange={(e) => setMeta((m) => ({ ...m, keywords: e.target.value }))} placeholder="فقه, معاملات, ثانوية" />
                    </Field>
                  </div>
                </div>
              </StepBlock>
            )}

            {step === 5 && (
              <StepBlock title="المعالجة الذكية" hint="جاري تجهيز المصدر — يمكنك متابعة التقدم لحظياً.">
                {!createdSourceId ? (
                  <ReviewCard
                    typeName={types.find((t) => t.id === typeId)?.name_ar ?? ""}
                    tax={tax} files={files}
                    stages={stages} grades={grades} sections={sections} tracks={tracks}
                    subjects={subjects} subSubjects={subSubjects}
                    meta={meta}
                    onStart={startProcessing}
                    saving={saving}
                  />
                ) : (
                  <ProcessingView
                    stage={pipelineStage}
                    pct={progressPct}
                    files={files}
                    onOpen={() => { onCreated(createdSourceId); onClose(); }}
                  />
                )}
              </StepBlock>
            )}
          </div>

          {/* Sidebar tips */}
          <aside className="hidden md:block space-y-3">
            <div className="rounded-2xl border bg-gradient-to-br from-blue-50 to-white p-4">
              <div className="flex items-center gap-2 font-bold text-sm text-blue-900">
                <Lightbulb className="h-4 w-4 text-amber-500" /> نصائح للرفع
              </div>
              <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600 list-none">
                <li className="flex gap-2"><Check className="h-3 w-3 text-emerald-500 mt-0.5" /> ملفات PDF أوضح تعطي دقة OCR أعلى.</li>
                <li className="flex gap-2"><Check className="h-3 w-3 text-emerald-500 mt-0.5" /> استخدم أسماء ملفات وصفية.</li>
                <li className="flex gap-2"><Check className="h-3 w-3 text-emerald-500 mt-0.5" /> يمكن ضغط الملفات الكبيرة قبل الرفع.</li>
                <li className="flex gap-2"><Check className="h-3 w-3 text-emerald-500 mt-0.5" /> تأكد من دقة التصنيف الأكاديمي.</li>
              </ul>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-slate-500">إحصائيات الرفع</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <SideStat label="عدد الملفات" value={files.length} />
                <SideStat label="الحجم الكلي" value={fmtBytes(totalBytes)} />
              </div>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <div className="border-t px-5 md:px-8 py-3 flex items-center justify-between bg-white">
          <Button variant="ghost" onClick={step === 1 ? onClose : goBack} disabled={saving}>
            {step === 1 ? "إلغاء" : (<><ArrowRight className="h-4 w-4 ml-1" /> رجوع</>)}
          </Button>
          <div className="text-xs text-slate-500 hidden sm:block">الخطوة {step} من 5</div>
          {step < 5 ? (
            <Button onClick={goNext} disabled={!canNext()}>
              التالي <ArrowLeft className="h-4 w-4 mr-1" />
            </Button>
          ) : !createdSourceId ? (
            <Button onClick={startProcessing} disabled={saving || !meta.title.trim()} className="bg-gradient-to-l from-violet-600 to-blue-600">
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Sparkles className="h-4 w-4 ml-2" />}
              بدء المعالجة
            </Button>
          ) : (
            <Button onClick={() => { onCreated(createdSourceId); onClose(); }}>
              فتح المصدر <ArrowLeft className="h-4 w-4 mr-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub components ----------
function StepBlock({ title, hint, children }: any) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function NativeSelect({
  value, onChange, options, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; options: { id: string; name_ar: string }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <div className={cn("relative", disabled && "opacity-60 pointer-events-none")}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 rounded-lg border border-slate-200 bg-white pr-3 pl-8 text-sm text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{placeholder ?? "— اختر —"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}
      </select>
      <ChevronDown className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

function FileCard({ f, onRemove }: { f: UploadFile; onRemove: () => void }) {
  const isImg = f.file.type.startsWith("image/");
  const Icon = isImg ? ImageIcon : FileText;
  return (
    <div className="rounded-xl border bg-white p-3 flex items-center gap-3">
      <div className="h-11 w-11 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">{f.file.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-slate-500">{fmtBytes(f.file.size)}</span>
          <span className="text-[11px] text-slate-400">·</span>
          <span className="text-[11px] text-slate-500 uppercase">{(f.file.name.split(".").pop() ?? "").slice(0, 4)}</span>
          <StatusBadge s={f.status} />
        </div>
        {f.status === "uploading" && <Progress value={f.progress} className="h-1 mt-1.5" />}
        {f.error && <div className="text-[11px] text-rose-600 mt-1">{f.error}</div>}
      </div>
      {(f.status === "queued" || f.status === "failed") && (
        <button onClick={onRemove} className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function StatusBadge({ s }: { s: UploadFile["status"] }) {
  const map: Record<string, { l: string; c: string }> = {
    queued:    { l: "في الانتظار", c: "bg-slate-100 text-slate-600" },
    uploading: { l: "جاري الرفع",  c: "bg-blue-100 text-blue-700" },
    uploaded:  { l: "تم الرفع",   c: "bg-emerald-100 text-emerald-700" },
    failed:    { l: "فشل",        c: "bg-rose-100 text-rose-700" },
  };
  const m = map[s];
  return <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", m.c)}>{m.l}</span>;
}

function SideStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-800 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function ReviewCard({ typeName, tax, files, stages, grades, sections, tracks, subjects, subSubjects, meta, onStart, saving }: any) {
  const nameOf = (arr: any[], id: string) => (id && arr.find((x) => x.id === id)?.name_ar) || "—";
  const rows: [string, string][] = [
    ["نوع المصدر", typeName || "—"],
    ["المرحلة", nameOf(stages, tax.stage_id)],
    ["الصف", nameOf(grades, tax.grade_id)],
    ["القسم", nameOf(sections, tax.section_id)],
    ["الشعبة", nameOf(tracks, tax.track_id)],
    ["المادة", nameOf(subjects, tax.subject_id)],
    ["المادة الفرعية", nameOf(subSubjects, tax.sub_subject_id)],
    ["الترم", tax.term ? `الترم ${tax.term}` : "—"],
    ["اللغة", meta.language === "ar" ? "العربية" : meta.language],
    ["عدد الملفات", String(files.length)],
    ["الحجم الكلي", fmtBytes(files.reduce((s: number, f: any) => s + f.file.size, 0))],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="font-bold text-slate-900 mb-3">مراجعة نهائية</div>
        <dl className="grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border-b border-dashed py-1.5">
              <dt className="text-slate-500 text-xs">{k}</dt>
              <dd className="font-semibold text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <Button onClick={onStart} disabled={saving} className="w-full h-12 bg-gradient-to-l from-violet-600 to-blue-600 text-base font-bold">
        {saving ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : <Sparkles className="h-5 w-5 ml-2" />}
        بدء المعالجة الذكية
      </Button>
    </div>
  );
}

const PIPE = [
  { key: "uploaded", label: "استلام الملف" },
  { key: "detecting", label: "الاكتشاف" },
  { key: "ocr", label: "OCR" },
  { key: "text_extraction", label: "استخراج النص" },
  { key: "structure_analysis", label: "تحليل البنية" },
  { key: "knowledge_extraction", label: "استخراج المعرفة" },
  { key: "embedding", label: "توليد Embeddings" },
  { key: "indexing", label: "الفهرسة" },
  { key: "completed", label: "جاهز" },
];

function ProcessingView({ stage, pct, files, onOpen }: any) {
  const idx = Math.max(0, PIPE.findIndex((p) => p.key === stage));
  const done = stage === "completed";
  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border p-5 bg-gradient-to-br", done ? "from-emerald-50 to-white border-emerald-200" : "from-blue-50 to-white")}>
        <div className="flex items-center gap-3">
          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow", done ? "bg-emerald-500" : "bg-blue-600")}>
            {done ? <CheckCircle2 className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-900">{done ? "اكتملت المعالجة" : "جاري المعالجة..."}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              المرحلة الحالية: {PIPE[idx]?.label} · {pct}%
            </div>
          </div>
        </div>
        <Progress value={pct} className="h-2 mt-4" />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {PIPE.map((p, i) => {
          const state = i < idx ? "done" : i === idx ? "active" : "pending";
          return (
            <div key={p.key} className={cn(
              "rounded-lg border p-2 text-center text-[10px]",
              state === "done" ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : state === "active" ? "bg-blue-50 border-blue-300 text-blue-700 shadow-sm"
                : "bg-slate-50 border-slate-200 text-slate-500",
            )}>
              <div className="flex justify-center mb-1">
                {state === "done" ? <Check className="h-3.5 w-3.5" />
                  : state === "active" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300" />}
              </div>
              <div className="font-medium">{p.label}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="text-xs font-bold text-slate-700 mb-2">ملفات هذا المصدر</div>
        <div className="space-y-1.5">
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span className="flex-1 truncate">{f.file.name}</span>
              <StatusBadge s={f.status} />
            </div>
          ))}
        </div>
      </div>

      <Button className="w-full" onClick={onOpen}>
        فتح صفحة المصدر لمتابعة التفاصيل <ArrowLeft className="h-4 w-4 mr-2" />
      </Button>
    </div>
  );
}

function fmtBytes(n: number) {
  if (!n) return "0 KB";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}
