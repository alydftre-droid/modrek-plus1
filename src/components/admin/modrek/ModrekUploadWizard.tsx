import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DSBadge, DSButton } from "@/design-system";
import {
  X, ArrowLeft, ArrowRight, Check, UploadCloud, FileText, Image as ImageIcon,
  BookOpen, NotebookPen, ClipboardList, Landmark, Database, File as FileIcon,
  Loader2, Trash2, Sparkles, Lightbulb, ChevronDown, CheckCircle2,
  Search, Layers, GraduationCap, Library as LibraryIcon, Tag, Calendar,
  Replace, Eye, PartyPopper, Zap, Cpu, Scan, Type, Split, Brain, UserRound,
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
  subjects: Subject[];
  subSubjects: SubSubject[];
  typeCounts: Record<string, number>;
};

const TYPE_ICONS: Record<string, any> = {
  book: BookOpen, booklet: NotebookPen, notes: NotebookPen, notebook: NotebookPen,
  summary: FileText, worksheet: ClipboardList, exam: ClipboardList,
  ministry_model: Landmark, ministry: Landmark, question_bank: Database,
  images: ImageIcon, teacher_file: UserRound, other: FileIcon,
  "file-text": FileText, clipboard: ClipboardList, "file-check": ClipboardList,
  landmark: Landmark, database: Database, file: FileIcon, user: UserRound,
};
const TYPE_TAGLINES: Record<string, string> = {
  book: "منهج دراسي كامل أو كتاب مرجعي",
  booklet: "ملزمة تلخيصية أو تدريبية",
  notes: "مذكرة شرح أو تجميع منظم",
  notebook: "مذكرة معلم أو ملخص محاضرات",
  summary: "ملخص سريع للمراجعة",
  worksheet: "ورقة تدريب أو مراجعة",
  exam: "امتحان مع الحل النموذجي",
  ministry_model: "نموذج رسمي أو امتحان وزارة",
  ministry: "نموذج وزاري رسمي",
  question_bank: "بنك أسئلة مصنّف",
  images: "مجموعة صور / ملفات ممسوحة",
  teacher_file: "ملف خاص بالمعلم أو التحضير",
  other: "أي مصدر معرفي آخر",
};
const TYPE_GRAD: Record<string, string> = {
  book: "from-blue-500 to-indigo-600",
  booklet: "from-emerald-500 to-teal-600",
  notes: "from-violet-500 to-purple-600",
  notebook: "from-violet-500 to-purple-600",
  summary: "from-sky-500 to-blue-600",
  worksheet: "from-lime-600 to-emerald-600",
  exam: "from-amber-500 to-orange-600",
  ministry_model: "from-slate-700 to-slate-900",
  ministry: "from-slate-700 to-slate-900",
  question_bank: "from-rose-500 to-pink-600",
  images: "from-cyan-500 to-sky-600",
  teacher_file: "from-teal-500 to-cyan-600",
  other: "from-neutral-500 to-neutral-700",
};
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.rar,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,text/plain,application/zip,application/x-rar-compressed";
const SUPPORTED_EXTENSIONS = ["PDF", "DOCX", "PPTX", "TXT", "ZIP", "RAR", "PNG", "JPG", "WEBP"];

type UploadFile = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?: string;
  assetId?: string;
  preview?: string;
  startedAt?: number;
  speedBps?: number;
};

const STEPS = [
  { n: 1, label: "نوع المصدر", icon: Layers },
  { n: 2, label: "التصنيف", icon: GraduationCap },
  { n: 3, label: "رفع الملفات", icon: UploadCloud },
  { n: 4, label: "المعلومات", icon: Tag },
  { n: 5, label: "المعالجة", icon: Sparkles },
];

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
  const replaceRef = useRef<{ id: string; input: HTMLInputElement | null }>({ id: "", input: null });

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTypeId(presetTypeCode ? (types.find((t) => t.code === presetTypeCode)?.id ?? "") : "");
    setTax({ stage_id: "", grade_id: "", section_id: "", track_id: "", subject_id: "", sub_subject_id: "", term: "", year: "" });
    setFiles([]);
    setMeta({ title: "", description: "", author: "", publisher: "", language: "ar", keywords: "" });
    setCreatedSourceId(null); setPipelineStage("uploaded"); setProgressPct(0);
  }, [open, presetTypeCode, types]);

  // clean object URLs
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  const filteredGrades = useMemo(
    () => grades.filter((g) => !tax.stage_id || g.stage_id === tax.stage_id),
    [grades, tax.stage_id],
  );
  const filteredSubjects = useMemo(() => {
    const sectionCode = sections.find((s) => s.id === tax.section_id)?.code;
    return subjects.filter((s) => {
      if (tax.stage_id && s.stage_id && s.stage_id !== tax.stage_id) return false;
      if (tax.section_id) {
        if (sectionCode === "shared") return true;
        if (s.section_id && s.section_id !== tax.section_id) return false;
      }
      return true;
    });
  }, [subjects, sections, tax.stage_id, tax.section_id]);
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
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setFiles((prev) => [...prev, ...arr]);
  };
  const removeFile = (id: string) => setFiles((prev) => {
    const f = prev.find((x) => x.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    return prev.filter((x) => x.id !== id);
  });
  const replaceFile = (id: string, newFile: File) => setFiles((prev) => prev.map((x) => {
    if (x.id !== id) return x;
    if (x.preview) URL.revokeObjectURL(x.preview);
    return {
      ...x, file: newFile, status: "queued", progress: 0, error: undefined,
      preview: newFile.type.startsWith("image/") ? URL.createObjectURL(newFile) : undefined,
    };
  }));

  useEffect(() => {
    if (step !== 5 || !createdSourceId) return;
    const loadOnce = async () => {
      const { data } = await supabase
        .from("knowledge_source_versions")
        .select("id, pipeline_stage, progress_pct")
        .eq("source_id", createdSourceId)
        .eq("is_current", true)
        .maybeSingle();
      if (data) {
        setPipelineStage(data.pipeline_stage);
        setProgressPct(data.progress_pct ?? 0);
      }
    };
    loadOnce();
    const iv = setInterval(loadOnce, 3000);
    return () => clearInterval(iv);
  }, [step, createdSourceId]);

  const canNext = () => {
    if (step === 1) return !!typeId;
    if (step === 2) return true;
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
          keywords: meta.keywords ? meta.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
        },
      }).select("id").single();
      if (srcErr) throw srcErr;

      const { data: ver, error: verErr } = await supabase.from("knowledge_source_versions").insert({
        source_id: src!.id, version_number: 1, is_current: true, notes: "النسخة الأولى",
      }).select("id").single();
      if (verErr) throw verErr;

      setCreatedSourceId(src!.id);
      setStep(5);

      for (const f of files) {
        const startedAt = Date.now();
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "uploading", progress: 8, startedAt, speedBps: 0 } : x));
        const progressTimer = window.setInterval(() => {
          setFiles((prev) => prev.map((x) => {
            if (x.id !== f.id || x.status !== "uploading") return x;
            const elapsed = Math.max(1, (Date.now() - (x.startedAt ?? startedAt)) / 1000);
            return { ...x, progress: Math.min(92, x.progress + 7), speedBps: Math.round((x.file.size * Math.min(x.progress, 92) / 100) / elapsed) };
          }));
        }, 450);
        try {
          const form = new FormData();
          form.append("version_id", ver!.id);
          form.append("file", f.file);
          const { error } = await supabase.functions.invoke("modrek-upload", { body: form });
          if (error) throw error;
          window.clearInterval(progressTimer);
          const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
          setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: "uploaded", progress: 100, speedBps: Math.round(x.file.size / elapsed) } : x));
        } catch (e: any) {
          window.clearInterval(progressTimer);
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

  const stepProgress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-md flex items-stretch md:items-center justify-center md:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full md:max-w-6xl md:rounded-[20px] shadow-[0_24px_60px_rgba(15,23,42,0.22)] flex flex-col max-h-[100vh] md:max-h-[95vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 border border-[#E2E8F0]">
        {/* Header */}
        <div className="relative px-5 md:px-8 pt-5 pb-3 border-b bg-white">
            <button
            onClick={onClose}
              aria-label="إغلاق"
              className="absolute top-4 left-4 h-9 w-9 rounded-full hover:bg-[#F1F5F9] active:bg-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 flex items-center justify-center text-[#475569] transition"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 via-violet-600 to-fuchsia-600 text-white flex items-center justify-center shadow-lg shrink-0 ring-4 ring-violet-100">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-lg md:text-xl text-slate-900">إضافة مصدر جديد</h2>
                <DSBadge tone="purple" className="text-[10px]">
                  <Sparkles className="h-3 w-3 ml-1" /> Modrek AI
                </DSBadge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 hidden md:block">
                خطوة {step} من {STEPS.length} — {STEPS[step - 1]?.label}
              </p>
            </div>
          </div>

          {/* Modern stepper */}
          <div className="mt-5">
            <div className="relative">
              <div className="absolute top-5 right-0 left-0 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-blue-500 via-violet-500 to-fuchsia-500 transition-all duration-500 ease-out"
                  style={{ width: `${stepProgress}%` }}
                />
              </div>
              <div className="relative grid grid-cols-5 gap-1">
                {STEPS.map((s) => {
                  const done = step > s.n;
                  const active = step === s.n;
                  const Icon = s.icon;
                  return (
                    <div key={s.n} className="flex flex-col items-center gap-1.5">
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 bg-white",
                        done && "border-emerald-500 text-emerald-600 shadow-md",
                        active && "border-blue-600 text-white bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg scale-110 ring-4 ring-blue-100",
                        !done && !active && "border-slate-200 text-slate-400",
                      )}>
                        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={cn(
                        "text-[10px] md:text-xs font-bold text-center leading-tight transition",
                        active ? "text-blue-700" : done ? "text-emerald-600" : "text-slate-400",
                      )}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6 grid md:grid-cols-[1fr_280px] gap-6 bg-gradient-to-br from-slate-50/50 via-white to-blue-50/20">
          <div className="min-w-0" key={step}>
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            {step === 1 && (
              <StepBlock title="اختر نوع المصدر" hint="حدد نوع الملف الذي ستقوم برفعه — يساعدنا هذا على تحسين المعالجة.">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {types.map((t) => {
                    const Icon = TYPE_ICONS[t.code] ?? TYPE_ICONS[t.icon ?? "file"] ?? FileIcon;
                    const sel = typeId === t.id;
                    const grad = TYPE_GRAD[t.code] ?? TYPE_GRAD.other;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTypeId(t.id)}
                        className={cn(
                          "relative group overflow-hidden rounded-2xl border-2 p-4 text-right transition-all duration-300",
                          sel
                            ? "border-blue-500 shadow-xl -translate-y-1 bg-gradient-to-br from-blue-50/80 to-violet-50/80"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5",
                        )}
                      >
                        {sel && (
                          <div className="absolute top-2 left-2 h-6 w-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-200">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </div>
                        )}
                        <div className={cn(
                          "h-14 w-14 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center mb-3 shadow-md transition-transform duration-300 group-hover:scale-110",
                          grad, sel && "scale-110",
                        )}>
                          <Icon className="h-7 w-7" />
                        </div>
                        <div className="font-bold text-sm text-slate-900">{t.name_ar}</div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 min-h-[28px] leading-relaxed">{TYPE_TAGLINES[t.code] ?? "مصدر معرفي"}</div>
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-500">{typeCounts[t.id] ?? 0} مصدر</span>
                          <div className={cn("h-1.5 w-1.5 rounded-full", sel ? "bg-blue-500 animate-pulse" : "bg-slate-300")} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </StepBlock>
            )}

            {step === 2 && (
              <StepBlock title="التصنيف الأكاديمي" hint="اختر النظام أولاً — تتحدّث القوائم تلقائياً بحسب اختيارك.">
                <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <TaxonomyCount label="الأقسام" value={sections.length} icon={LibraryIcon} tone="blue" />
                  <TaxonomyCount label="المراحل" value={stages.length} icon={GraduationCap} tone="emerald" />
                  <TaxonomyCount label="الصفوف" value={filteredGrades.length || grades.length} icon={BookOpen} tone="amber" />
                  <TaxonomyCount label="المواد" value={filteredSubjects.length} icon={Layers} tone="rose" />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="النظام التعليمي" required>
                    <SearchSelect value={tax.section_id}
                      onChange={(v) => setTax((t) => ({ ...t, section_id: v, subject_id: "", sub_subject_id: "" }))}
                      placeholder="عام / أزهري / مشترك" options={sections} />
                  </Field>
                  <Field label="المرحلة">
                    <SearchSelect value={tax.stage_id}
                      onChange={(v) => setTax((t) => ({ ...t, stage_id: v, grade_id: "", subject_id: "", sub_subject_id: "" }))}
                      placeholder="اختر المرحلة" options={stages} />
                  </Field>
                  <Field label="الصف">
                    <SearchSelect value={tax.grade_id} onChange={(v) => setTax((t) => ({ ...t, grade_id: v }))}
                      placeholder={tax.stage_id ? "اختر الصف" : "اختر المرحلة أولاً"}
                      options={filteredGrades} disabled={!tax.stage_id} />
                  </Field>
                  <Field label="الشعبة (علمي / أدبي)">
                    <SearchSelect value={tax.track_id} onChange={(v) => setTax((t) => ({ ...t, track_id: v }))}
                      placeholder="اختر الشعبة" options={tracks} />
                  </Field>
                  <Field label="المادة">
                    <SearchSelect value={tax.subject_id}
                      onChange={(v) => setTax((t) => ({ ...t, subject_id: v, sub_subject_id: "" }))}
                      placeholder={filteredSubjects.length ? "اختر المادة" : "لا توجد مواد لهذا التصنيف"}
                      options={filteredSubjects}
                      disabled={filteredSubjects.length === 0} />
                  </Field>
                  <Field label="المادة الفرعية">
                    <SearchSelect value={tax.sub_subject_id} onChange={(v) => setTax((t) => ({ ...t, sub_subject_id: v }))}
                      placeholder={tax.subject_id ? (filteredSubSubjects.length ? "اختر" : "لا توجد مواد فرعية") : "اختر المادة أولاً"}
                      options={filteredSubSubjects} disabled={!tax.subject_id || filteredSubSubjects.length === 0} />
                  </Field>
                  <Field label="الترم">
                    <SearchSelect value={tax.term} onChange={(v) => setTax((t) => ({ ...t, term: v }))}
                      placeholder="الترم" options={[{ id: "1", name_ar: "الترم الأول", code: "1" }, { id: "2", name_ar: "الترم الثاني", code: "2" }]} />
                  </Field>
                  <Field label="سنة الإصدار">
                    <div className="relative">
                      <Calendar className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <Input type="number" min={1990} max={2100} value={tax.year}
                        onChange={(e) => setTax((t) => ({ ...t, year: e.target.value }))}
                        placeholder="مثال: 2025" className="pr-10 h-11" />
                    </div>
                  </Field>
                </div>
              </StepBlock>
            )}

            {step === 3 && (
              <StepBlock title="رفع الملفات" hint="اسحب وأفلت أو اختر — يمكنك رفع أكثر من ملف مرة واحدة.">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(false);
                    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInput.current?.click()}
                  className={cn(
                    "relative overflow-hidden rounded-3xl border-2 border-dashed p-8 md:p-12 text-center transition-all duration-300 cursor-pointer group",
                    dragOver
                      ? "border-blue-500 bg-blue-50 scale-[1.01] shadow-inner"
                      : "border-slate-300 bg-gradient-to-br from-slate-50 to-white hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-md",
                  )}
                >
                  {dragOver && (
                    <>
                      <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />
                      <div className="absolute inset-4 border-2 border-dashed border-blue-400 rounded-2xl pointer-events-none animate-pulse" />
                    </>
                  )}
                  <div className={cn(
                    "h-20 w-20 rounded-3xl mx-auto bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-500 text-white flex items-center justify-center shadow-2xl shadow-blue-200 mb-4 transition-transform duration-300",
                    dragOver ? "scale-110 rotate-6" : "group-hover:scale-105",
                  )}>
                    <UploadCloud className="h-10 w-10" />
                  </div>
                  <div className="font-black text-xl text-slate-900">
                    {dragOver ? "أفلت الملفات هنا" : "اسحب وأفلت الملفات"}
                  </div>
                   <div className="text-sm text-slate-500 mt-1.5">أو اضغط للاختيار من جهازك</div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); fileInput.current?.click(); }}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-800 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-blue-200"
                  >
                    <UploadCloud className="h-5 w-5" />
                    اختر الملفات / Browse Files
                  </button>
                  <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                    {SUPPORTED_EXTENSIONS.map((ext) => (
                      <span key={ext} className="text-[10px] font-bold px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600">{ext}</span>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-3">حد أقصى 200MB لكل ملف · رفع متعدد مدعوم</div>
                  <input
                    ref={fileInput} type="file" multiple className="hidden" accept={ACCEPT}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                  />
                </div>

                {files.length > 0 && (
                  <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        الملفات المحددة
                        <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">{files.length}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-semibold">{fmtBytes(totalBytes)}</div>
                    </div>
                    <div className="grid gap-2">
                      {files.map((f) => (
                        <FileCard
                          key={f.id} f={f}
                          onRemove={() => removeFile(f.id)}
                          onReplace={(newFile) => replaceFile(f.id, newFile)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </StepBlock>
            )}

            {step === 4 && (
              <StepBlock title="معلومات المصدر" hint="حقول تساعد على فهرسة المصدر بشكل أفضل. العنوان مطلوب.">
                <div className="grid gap-4">
                  <Field label="عنوان المصدر" required>
                    <Input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
                      placeholder="مثال: كتاب الفقه للصف الثالث الثانوي — الأزهر"
                      className="h-11 text-base font-semibold" />
                  </Field>
                  <Field label="وصف مختصر">
                    <Textarea rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
                      placeholder="نبذة عن محتوى المصدر ومن يستفيد منه" className="resize-none" />
                  </Field>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="المؤلف">
                      <Input value={meta.author} onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))} className="h-11" />
                    </Field>
                    <Field label="دار النشر">
                      <Input value={meta.publisher} onChange={(e) => setMeta((m) => ({ ...m, publisher: e.target.value }))} className="h-11" />
                    </Field>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="لغة المحتوى">
                      <SearchSelect value={meta.language} onChange={(v) => setMeta((m) => ({ ...m, language: v }))}
                        options={[{ id: "ar", name_ar: "العربية", code: "ar" }, { id: "en", name_ar: "الإنجليزية", code: "en" }, { id: "fr", name_ar: "الفرنسية", code: "fr" }]}
                      />
                    </Field>
                    <Field label="كلمات مفتاحية">
                      <Input value={meta.keywords} onChange={(e) => setMeta((m) => ({ ...m, keywords: e.target.value }))}
                        placeholder="فقه, معاملات, ثانوية" className="h-11" />
                    </Field>
                  </div>
                </div>
              </StepBlock>
            )}

            {step === 5 && (
              <StepBlock title={createdSourceId ? "المعالجة الذكية" : "المراجعة النهائية"} hint={createdSourceId ? "جاري تجهيز المصدر — يمكنك متابعة التقدم لحظياً." : "راجع كل شيء قبل بدء المعالجة."}>
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
          </div>

          {/* Sidebar */}
          <aside className="hidden md:block space-y-3">
            <div className="rounded-2xl border bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow">
                  <Lightbulb className="h-4 w-4" />
                </div>
                نصائح ذكية
              </div>
              <ul className="mt-3 space-y-2 text-[11px] text-slate-700 list-none">
                <TipItem>ملفات PDF أوضح تعطي دقة OCR أعلى</TipItem>
                <TipItem>استخدم أسماء ملفات وصفية للأرشفة</TipItem>
                <TipItem>يمكن ضغط الملفات الكبيرة قبل الرفع</TipItem>
                <TipItem>تأكد من دقة التصنيف الأكاديمي</TipItem>
              </ul>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">إحصائيات الرفع</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SideStat label="الملفات" value={files.length} icon={FileText} tone="blue" />
                <SideStat label="الحجم" value={fmtBytes(totalBytes)} icon={Database} tone="violet" />
              </div>
            </div>
            {typeId && (
              <div className="rounded-2xl border bg-gradient-to-br from-blue-50 to-violet-50 p-4 shadow-sm">
                <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">النوع المحدد</div>
                <div className="mt-2 font-bold text-slate-900">
                  {types.find((t) => t.id === typeId)?.name_ar}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="border-t px-5 md:px-8 py-3.5 flex items-center justify-between bg-white gap-3">
          <DSButton
            variant="ghost" onClick={step === 1 ? onClose : goBack} disabled={saving}
            className="hover:bg-slate-100"
          >
            {step === 1 ? "إلغاء" : (<><ArrowRight className="h-4 w-4 ml-1" /> رجوع</>)}
          </DSButton>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
            {STEPS.map((s) => (
              <div key={s.n} className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                step === s.n ? "w-6 bg-gradient-to-l from-blue-500 to-violet-500"
                  : step > s.n ? "w-1.5 bg-emerald-500" : "w-1.5 bg-slate-200",
              )} />
            ))}
          </div>
          {step < 5 ? (
            <DSButton
              onClick={goNext} disabled={!canNext()}
              className="min-w-[110px]"
            >
              التالي <ArrowLeft className="h-4 w-4 mr-1" />
            </DSButton>
          ) : !createdSourceId ? (
            <DSButton
              onClick={startProcessing} disabled={saving || !meta.title.trim()}
              className="min-w-[160px] bg-[#7C3AED] hover:bg-[#6D28D9] focus-visible:ring-[#7C3AED]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Sparkles className="h-4 w-4 ml-2" />}
              بدء المعالجة
            </DSButton>
          ) : (
            <DSButton
              onClick={() => { onCreated(createdSourceId); onClose(); }}
              className="bg-[#059669] hover:bg-[#047857] focus-visible:ring-[#059669] min-w-[140px]"
            >
              فتح المصدر <ArrowLeft className="h-4 w-4 mr-1" />
            </DSButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub components ----------
function StepBlock({ title, hint, children }: any) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-black text-slate-900">{title}</h3>
        {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function TaxonomyCount({ label, value, icon: Icon, tone }: any) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
  };
  return (
    <div className={cn("rounded-2xl border p-3 flex items-center gap-3", tones[tone] ?? tones.blue)}>
      <div className="h-9 w-9 rounded-xl bg-white/80 flex items-center justify-center shadow-sm shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold opacity-75 truncate">{label}</div>
        <div className="text-lg font-black tabular-nums">{Number(value || 0).toLocaleString("ar-EG")}</div>
      </div>
    </div>
  );
}

function SearchSelect({
  value, onChange, options, placeholder, disabled,
}: {
  value: string; onChange: (v: string) => void;
  options: { id: string; name_ar: string; code?: string }[];
  placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = q ? options.filter((o) => o.name_ar.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div ref={ref} className={cn("relative", disabled && "opacity-50 pointer-events-none")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "w-full h-11 rounded-[10px] border bg-white pr-3 pl-9 text-sm text-right transition-all flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:bg-[#F1F5F9] disabled:cursor-not-allowed",
          open ? "border-[#2563EB] ring-2 ring-[#2563EB]/20" : "border-[#E2E8F0] hover:border-[#CBD5E1]",
        )}
      >
        <span className={cn("truncate", selected ? "text-slate-900 font-semibold" : "text-slate-400 font-normal")}>
          {selected?.name_ar ?? placeholder ?? "اختر"}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 top-full right-0 left-0 mt-1.5 rounded-xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {options.length > 5 && (
            <div className="p-2 border-b bg-slate-50 relative">
              <Search className="h-3.5 w-3.5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="بحث..."
                className="w-full h-8 rounded-lg border border-slate-200 bg-white pr-8 pl-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">لا نتائج</div>
            ) : filtered.map((o) => {
              const active = value === o.id;
              return (
                <button
                  key={o.id} type="button"
                  onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-right transition",
                    active ? "bg-[#EFF6FF] text-[#1D4ED8] font-bold" : "text-[#334155] hover:bg-[#F1F5F9]",
                  )}
                >
                  <span className="truncate">{o.name_ar}</span>
                  {active && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FileCard({ f, onRemove, onReplace }: {
  f: UploadFile; onRemove: () => void; onReplace: (newFile: File) => void;
}) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const ext = (f.file.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
  const isImg = !!f.preview;
  const iconGrad = isImg ? "from-cyan-500 to-sky-600" :
    ext === "PDF" ? "from-rose-500 to-red-600" :
    ext === "DOCX" ? "from-blue-500 to-indigo-600" :
    ext === "PPTX" ? "from-orange-500 to-amber-600" :
    "from-slate-400 to-slate-600";

  return (
    <div className="group relative rounded-2xl border-2 bg-white p-3 flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all">
      {isImg ? (
        <img src={f.preview} alt="" className="h-14 w-14 rounded-xl object-cover ring-2 ring-slate-100 shrink-0" />
      ) : (
        <div className={cn("h-14 w-14 rounded-xl bg-gradient-to-br text-white flex flex-col items-center justify-center shrink-0 shadow", iconGrad)}>
          <FileText className="h-5 w-5" />
          <span className="text-[9px] font-black mt-0.5">{ext}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-800 truncate">{f.file.name}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-slate-500 font-semibold">{fmtBytes(f.file.size)}</span>
          <span className="text-slate-300">·</span>
          <span className="text-[10px] text-slate-500 font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100">{ext}</span>
          <StatusBadge s={f.status} />
        </div>
        {f.status === "uploading" && (
          <div className="mt-2 flex items-center gap-2">
            <Progress value={f.progress} className="h-1.5 flex-1" />
            <span className="text-[10px] font-bold text-blue-600 tabular-nums">{f.progress}%</span>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums">{fmtBytes(f.speedBps ?? 0)}/ث</span>
          </div>
        )}
        {f.error && <div className="text-[11px] text-rose-600 mt-1 font-semibold">⚠ {f.error}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {(f.status === "queued" || f.status === "failed") && (
          <>
            <button
              onClick={() => replaceInput.current?.click()}
              title="استبدال"
              aria-label="استبدال الملف"
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition"
            >
              <Replace className="h-4 w-4" />
            </button>
            <button
              onClick={onRemove}
              title="حذف"
              aria-label="حذف الملف"
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <input
              ref={replaceInput} type="file" className="hidden" accept={ACCEPT}
              onChange={(e) => { if (e.target.files?.[0]) onReplace(e.target.files[0]); e.target.value = ""; }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: UploadFile["status"] }) {
  const map: Record<string, { l: string; c: string; icon?: any }> = {
    queued:    { l: "في الانتظار", c: "bg-slate-100 text-slate-600" },
    uploading: { l: "جاري الرفع",  c: "bg-blue-100 text-blue-700" },
    uploaded:  { l: "تم الرفع",   c: "bg-emerald-100 text-emerald-700" },
    failed:    { l: "فشل",        c: "bg-rose-100 text-rose-700" },
  };
  const m = map[s];
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold", m.c)}>{m.l}</span>;
}

function TipItem({ children }: any) {
  return (
    <li className="flex gap-2 items-start">
      <div className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </div>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function SideStat({ label, value, icon: Icon, tone }: any) {
  const tones: any = {
    blue: "from-blue-500 to-indigo-600",
    violet: "from-violet-500 to-fuchsia-600",
  };
  return (
    <div className="rounded-xl bg-slate-50 border p-2.5">
      <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br text-white flex items-center justify-center mb-1.5", tones[tone])}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="text-[10px] text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-black text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}

function ReviewCard({ typeName, tax, files, stages, grades, sections, tracks, subjects, subSubjects, meta, onStart, saving }: any) {
  const nameOf = (arr: any[], id: string) => (id && arr.find((x) => x.id === id)?.name_ar) || "—";
  const rows: [string, string, any][] = [
    ["نوع المصدر", typeName || "—", Layers],
    ["المرحلة", nameOf(stages, tax.stage_id), GraduationCap],
    ["الصف", nameOf(grades, tax.grade_id), BookOpen],
    ["القسم", nameOf(sections, tax.section_id), LibraryIcon],
    ["الشعبة", nameOf(tracks, tax.track_id), Tag],
    ["المادة", nameOf(subjects, tax.subject_id), BookOpen],
    ["المادة الفرعية", nameOf(subSubjects, tax.sub_subject_id), Tag],
    ["الترم", tax.term ? `الترم ${tax.term}` : "—", Calendar],
    ["اللغة", meta.language === "ar" ? "العربية" : meta.language, Type],
    ["عدد الملفات", String(files.length), FileText],
    ["الحجم الكلي", fmtBytes(files.reduce((s: number, f: any) => s + f.file.size, 0)), Database],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-blue-100 bg-gradient-to-br from-blue-50/40 via-white to-violet-50/40 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center">
            <Eye className="h-4 w-4" />
          </div>
          <div className="font-black text-slate-900">مراجعة نهائية</div>
        </div>
        <div className="rounded-xl bg-white border p-4 mb-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">عنوان المصدر</div>
          <div className="mt-1 font-black text-slate-900 text-lg">{meta.title || "—"}</div>
          {meta.description && <div className="mt-1 text-sm text-slate-600 line-clamp-2">{meta.description}</div>}
        </div>
        <dl className="grid md:grid-cols-2 gap-x-4 gap-y-1">
          {rows.map(([k, v, Icon]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-slate-200 last:border-0">
              <dt className="text-xs text-slate-500 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                {k}
              </dt>
              <dd className="text-xs font-bold text-slate-800 truncate max-w-[60%]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <DSButton
        onClick={onStart} disabled={saving}
        className="w-full h-14 bg-[#7C3AED] hover:bg-[#6D28D9] focus-visible:ring-[#7C3AED] text-base font-black"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin ml-2" /> : <Sparkles className="h-5 w-5 ml-2" />}
        بدء المعالجة الذكية
      </DSButton>
    </div>
  );
}

const PIPE = [
  { key: "uploaded", label: "استلام الملف", icon: UploadCloud, desc: "استقبال الملفات ورفعها للتخزين" },
  { key: "detecting", label: "الاكتشاف", icon: Scan, desc: "تحديد نوع المستند ولغته" },
  { key: "ocr", label: "OCR", icon: Eye, desc: "استخراج النص من الصور" },
  { key: "text_extraction", label: "استخراج النص", icon: Type, desc: "استخراج النص الخام" },
  { key: "structure_analysis", label: "تحليل البنية", icon: Split, desc: "تقسيم الوحدات والدروس" },
  { key: "knowledge_extraction", label: "استخراج المعرفة", icon: Brain, desc: "أسئلة وتعريفات وأمثلة" },
  { key: "embedding", label: "توليد Embeddings", icon: Cpu, desc: "تحويل النص لمتجهات ذكية" },
  { key: "indexing", label: "الفهرسة", icon: Database, desc: "حفظ في قاعدة المعرفة" },
  { key: "completed", label: "جاهز", icon: CheckCircle2, desc: "المصدر جاهز للاستخدام" },
];

function ProcessingView({ stage, pct, files, onOpen }: any) {
  const idx = Math.max(0, PIPE.findIndex((p) => p.key === stage));
  const done = stage === "completed";
  return (
    <div className="space-y-5">
      <div className={cn(
        "relative overflow-hidden rounded-3xl border-2 p-6 transition-all",
        done ? "bg-gradient-to-br from-emerald-50 via-white to-teal-50 border-emerald-200"
          : "bg-gradient-to-br from-blue-50 via-white to-violet-50 border-blue-200",
      )}>
        <div className="absolute top-0 left-0 w-40 h-40 bg-blue-400/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/3" />
        <div className="absolute bottom-0 right-0 w-40 h-40 bg-violet-400/10 rounded-full blur-3xl translate-y-1/2 translate-x-1/3" />
        <div className="relative flex items-center gap-4">
          <div className={cn(
            "h-16 w-16 rounded-2xl flex items-center justify-center text-white shadow-xl ring-4",
            done ? "bg-gradient-to-br from-emerald-500 to-teal-600 ring-emerald-100"
              : "bg-gradient-to-br from-blue-600 to-violet-600 ring-blue-100",
          )}>
            {done ? <PartyPopper className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-lg text-slate-900">
              {done ? "🎉 اكتملت المعالجة بنجاح" : "جاري المعالجة الذكية..."}
            </div>
            <div className="text-sm text-slate-600 mt-0.5">
              {PIPE[idx]?.desc} · <span className="font-bold tabular-nums">{pct}%</span>
            </div>
          </div>
        </div>
        <div className="relative mt-5">
          <Progress value={pct} className="h-3" />
        </div>
      </div>

      {/* Vertical timeline */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-amber-500" /> مراحل المعالجة
        </div>
        <div className="space-y-1">
          {PIPE.map((p, i) => {
            const state = i < idx ? "done" : i === idx ? "active" : "pending";
            const Icon = p.icon;
            return (
              <div key={p.key} className={cn(
                "flex items-center gap-3 p-2.5 rounded-xl transition-all",
                state === "active" && "bg-gradient-to-l from-blue-50 to-transparent",
              )}>
                <div className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                  state === "done" && "bg-emerald-500 text-white shadow",
                  state === "active" && "bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg ring-4 ring-blue-100",
                  state === "pending" && "bg-slate-100 text-slate-400",
                )}>
                  {state === "done" ? <Check className="h-4 w-4" strokeWidth={3} />
                    : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-bold",
                    state === "done" ? "text-emerald-700"
                      : state === "active" ? "text-blue-700"
                      : "text-slate-500")}>
                    {p.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{p.desc}</div>
                </div>
                {state === "active" && (
                  <span className="text-[10px] font-bold text-blue-600 px-2 py-0.5 rounded-full bg-blue-100">جارٍ الآن</span>
                )}
                {state === "done" && (
                  <span className="text-[10px] font-bold text-emerald-600 px-2 py-0.5 rounded-full bg-emerald-100">✓ تمّ</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">ملفات المصدر</div>
        <div className="space-y-1.5">
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-slate-50">
              <FileText className="h-3.5 w-3.5 text-slate-400" />
              <span className="flex-1 truncate font-semibold text-slate-700">{f.file.name}</span>
              <StatusBadge s={f.status} />
            </div>
          ))}
        </div>
      </div>

      <DSButton
        className="w-full h-12 bg-[#059669] hover:bg-[#047857] focus-visible:ring-[#059669] font-bold"
        onClick={onOpen}
      >
        <Eye className="h-4 w-4 ml-2" />
        فتح صفحة المصدر لمتابعة التفاصيل
        <ArrowLeft className="h-4 w-4 mr-2" />
      </DSButton>
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
