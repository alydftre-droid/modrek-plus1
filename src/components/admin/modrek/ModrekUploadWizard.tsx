import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  X, ArrowLeft, ArrowRight, Check, UploadCloud, FileText, Image as ImageIcon,
  BookOpen, NotebookPen, ClipboardList, Landmark, Database, File as FileIcon,
  Loader2, Trash2, Sparkles, Lightbulb, ChevronDown, CheckCircle2,
  Search, Layers, GraduationCap, Library as LibraryIcon, Tag, Calendar,
  Replace, Eye, PartyPopper, Cpu, Scan, Type, Split, Brain, UserRound,
  Pause, Play, RefreshCw, XCircle, FolderOpen, AlertTriangle, Clock, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { computeModrekFileFingerprint, registerModrekUpload } from "@/lib/modrekUpload";
import { dedupeModrekSubjects, isNoTrackCode, subjectScopeMatches } from "@/lib/modrekLibrarySubjects";
import {
  ModrekButton, ModrekPill, ModrekCard,
} from "@/features/modrek/premium";

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
type SourceType = { id: string; code: string; name_ar: string; icon: string | null };

/** Virtual option: book shared across all tracks (علمي + أدبي) — stored as track_id = null. */
const ALL_TRACKS_ID = "__all_tracks__";
const ALL_TRACKS_OPTION: Taxo = { id: ALL_TRACKS_ID, code: "none", name_ar: "الجميع (علمي وأدبي)" };



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

const TYPE_ACCENT: Record<string, { bg: string; fg: string; ring: string }> = {
  book: { bg: "#EFF6FF", fg: "#2563EB", ring: "#DBEAFE" },
  booklet: { bg: "#ECFDF5", fg: "#059669", ring: "#D1FAE5" },
  notes: { bg: "#F5F3FF", fg: "#7C3AED", ring: "#EDE9FE" },
  notebook: { bg: "#F5F3FF", fg: "#7C3AED", ring: "#EDE9FE" },
  summary: { bg: "#ECFEFF", fg: "#0891B2", ring: "#CFFAFE" },
  worksheet: { bg: "#ECFDF5", fg: "#059669", ring: "#D1FAE5" },
  exam: { bg: "#FFFBEB", fg: "#D97706", ring: "#FEF3C7" },
  ministry_model: { bg: "#F1F5F9", fg: "#334155", ring: "#E2E8F0" },
  ministry: { bg: "#F1F5F9", fg: "#334155", ring: "#E2E8F0" },
  question_bank: { bg: "#FFF1F2", fg: "#E11D48", ring: "#FFE4E6" },
  images: { bg: "#ECFEFF", fg: "#0891B2", ring: "#CFFAFE" },
  teacher_file: { bg: "#F5F3FF", fg: "#7C3AED", ring: "#EDE9FE" },
  other: { bg: "#F1F5F9", fg: "#334155", ring: "#E2E8F0" },
};

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.zip,.rar,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,text/plain,application/zip,application/x-rar-compressed";
const SUPPORTED_EXTENSIONS = ["PDF", "DOCX", "PPTX", "TXT", "ZIP", "RAR", "PNG", "JPG", "WEBP"];

const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300MB hard cap

type UploadStatus = "queued" | "uploading" | "paused" | "uploaded" | "failed" | "cancelled" | "registering";

type UploadFile = {
  id: string;
  file: File;
  relPath?: string; // for folder uploads
  status: UploadStatus;
  progress: number;
  loaded: number;
  error?: string;
  assetId?: string;
  preview?: string;
  startedAt?: number;
  speedBps?: number;
  etaSec?: number;
};

type ProcessingJobRow = {
  id: string;
  kind: string;
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  progress_pct: number | null;
  error: string | null;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  next_run_at: string | null;
  updated_at: string | null;
  created_at: string;
};

type ProcessingEventRow = {
  id: string;
  job_id: string | null;
  level: string;
  message: string;
  data: Record<string, any> | null;
  created_at: string;
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
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJobRow[]>([]);
  const [processingEvents, setProcessingEvents] = useState<ProcessingEventRow[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const lastWorkerKickRef = useRef(0);
  const queuePausedRef = useRef<boolean>(false);
  const filesRef = useRef<UploadFile[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const setQueuePausedBoth = (v: boolean) => { queuePausedRef.current = v; setQueuePaused(v); };
  const [versionIdRef, setVersionIdRef] = useState<string | null>(null);
  const uploadQueueActive = files.some((file) => ["queued", "uploading", "registering"].includes(file.status));
  const allFilesUploaded = files.length > 0 && files.every((file) => file.status === "uploaded");

  const closeSafely = () => {
    if (uploadQueueActive) {
      toast.warning("انتظر اكتمال رفع كل الملفات قبل إغلاق النافذة حتى لا يتوقف الرفع");
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setTypeId(presetTypeCode ? (types.find((t) => t.code === presetTypeCode)?.id ?? "") : "");
    setTax({ stage_id: "", grade_id: "", section_id: "", track_id: "", subject_id: "", sub_subject_id: "", term: "", year: "" });
    setFiles([]);
    setMeta({ title: "", description: "", author: "", publisher: "", language: "ar", keywords: "" });
    setCreatedSourceId(null); setPipelineStage("uploaded"); setProgressPct(0); setProcessingError(null); setProcessingJobs([]); setProcessingEvents([]);
    setVersionIdRef(null); setQueuePausedBoth(false);
    xhrRefs.current.forEach((x) => { try { x.abort(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); } }); xhrRefs.current.clear();
  }, [open, presetTypeCode, types]);

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);
  useEffect(() => { filesRef.current = files; }, [files]);

  const filteredGrades = useMemo(
    () => grades.filter((g) => !tax.stage_id || g.stage_id === tax.stage_id),
    [grades, tax.stage_id],
  );
  const filteredSubjects = useMemo(() => {
    const sectionCodeById = new Map(sections.map((section) => [section.id, section.code]));
    const selectedSectionCode = sections.find((s) => s.id === tax.section_id)?.code;
    const selectedTrackCode = tax.track_id === ALL_TRACKS_ID ? "none" : tracks.find((t) => t.id === tax.track_id)?.code;

    const visibleSubjects = subjects.filter((subject) => subjectScopeMatches(subject, {
      stageId: tax.stage_id,
      gradeId: tax.grade_id,
      sectionId: tax.section_id,
      selectedSectionCode,
      selectedTrackCode,
      sectionCodeById,
    }));
    return dedupeModrekSubjects(visibleSubjects, selectedTrackCode, tax.section_id);
  }, [subjects, sections, tracks, tax.stage_id, tax.grade_id, tax.section_id, tax.track_id]);
  const filteredSubSubjects = useMemo(
    () => subSubjects.filter((s) => !tax.subject_id || s.subject_id === tax.subject_id),
    [subSubjects, tax.subject_id],
  );
  const selectedTrackCode = useMemo(
    () => (tax.track_id === ALL_TRACKS_ID ? "none" : tracks.find((track) => track.id === tax.track_id)?.code),
    [tracks, tax.track_id],
  );


  /** Education systems (عام / أزهري / مشترك) that really carry subjects in the chosen stage/grade. */
  const availableSections = useMemo(() => {
    const scoped = subjects.filter((subject) =>
      (!tax.stage_id || !subject.stage_id || subject.stage_id === tax.stage_id)
      && (!tax.grade_id || !subject.grade_id || subject.grade_id === tax.grade_id));
    const usedIds = new Set(scoped.map((subject) => subject.section_id).filter(Boolean) as string[]);
    const sharedId = sections.find((section) => section.code === "shared")?.id;
    // A "shared" subject is available for both عام and أزهري, so keep those options visible.
    const list = sections.filter((section) => usedIds.has(section.id)
      || (sharedId && usedIds.has(sharedId) && (section.code === "general" || section.code === "azhar")));
    return list.length ? list : sections;
  }, [subjects, sections, tax.stage_id, tax.grade_id]);

  /** Tracks (شعب) that really exist for the chosen stage/grade/system. */
  const availableTracks = useMemo(() => {
    const sectionCodeById = new Map(sections.map((section) => [section.id, section.code]));
    const selectedSectionCode = sections.find((s) => s.id === tax.section_id)?.code;
    const scoped = subjects.filter((subject) => subjectScopeMatches(subject, {
      stageId: tax.stage_id,
      gradeId: tax.grade_id,
      sectionId: tax.section_id,
      selectedSectionCode,
      selectedTrackCode: null,
      sectionCodeById,
    }));
    const usedTracks = new Set(scoped.map((s) => s.curriculum_track).filter(Boolean) as string[]);
    if (!usedTracks.size) return [];
    const real = tracks.filter((track) => {
      if (track.code === "literary") return usedTracks.has("literary");
      if (["scientific", "sci_science", "sci_math"].includes(track.code)) return usedTracks.has("scientific");
      return usedTracks.has(track.code);
    });
    return real.length ? [ALL_TRACKS_OPTION, ...real] : [];
  }, [subjects, sections, tracks, tax.stage_id, tax.grade_id, tax.section_id]);


  // Drop a selected track that no longer belongs to the current stage/grade/system.
  useEffect(() => {
    if (!tax.track_id) return;
    if (availableTracks.some((track) => track.id === tax.track_id)) return;
    setTax((t) => ({ ...t, track_id: "", subject_id: "", sub_subject_id: "" }));
  }, [availableTracks, tax.track_id]);


  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.file.size, 0), [files]);

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const accepted: UploadFile[] = [];
    let rejectedTooBig = 0;
    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE) { rejectedTooBig++; continue; }
      const relPath = (file as any).webkitRelativePath || undefined;
      accepted.push({
        id: crypto.randomUUID(),
        file,
        relPath,
        status: "queued",
        progress: 0,
        loaded: 0,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    }
    if (rejectedTooBig > 0) toast.error(`تم تجاهل ${rejectedTooBig} ملف يتجاوز 300MB`);
    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
  };
  const removeFile = (id: string) => {
    const xhr = xhrRefs.current.get(id);
    if (xhr) { try { xhr.abort(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); } xhrRefs.current.delete(id); }
    setFiles((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((x) => x.id !== id);
    });
  };
  const replaceFile = (id: string, newFile: File) => setFiles((prev) => prev.map((x) => {
    if (x.id !== id) return x;
    if (x.preview) URL.revokeObjectURL(x.preview);
    return {
      ...x, file: newFile, status: "queued" as UploadStatus, progress: 0, loaded: 0, error: undefined,
      preview: newFile.type.startsWith("image/") ? URL.createObjectURL(newFile) : undefined,
    };
  }));

  const pauseFile = (id: string) => {
    const xhr = xhrRefs.current.get(id);
    if (xhr) { try { xhr.abort(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); } xhrRefs.current.delete(id); }
    setFiles((prev) => prev.map((x) => x.id === id && (x.status === "uploading" || x.status === "queued") ? { ...x, status: "paused" } : x));
  };
  const resumeFile = (id: string) => {
    setFiles((prev) => prev.map((x) => x.id === id && (x.status === "paused" || x.status === "failed" || x.status === "cancelled") ? { ...x, status: "queued", progress: 0, loaded: 0, error: undefined } : x));
  };
  const cancelFile = (id: string) => {
    const xhr = xhrRefs.current.get(id);
    if (xhr) { try { xhr.abort(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); } xhrRefs.current.delete(id); }
    setFiles((prev) => prev.map((x) => x.id === id ? { ...x, status: "cancelled" as UploadStatus, error: "أُلغي بواسطة المستخدم" } : x));
  };
  const cancelAll = () => {
    xhrRefs.current.forEach((xhr) => { try { xhr.abort(); } catch (err) { /* non-fatal */ console.debug("[swallowed]", err); } });
    xhrRefs.current.clear();
    setQueuePausedBoth(true);
    setFiles((prev) => prev.map((x) => (x.status === "uploading" || x.status === "queued") ? { ...x, status: "cancelled" as UploadStatus, error: "أُلغيت الطابور" } : x));
  };

  useEffect(() => {
    if (step !== 5 || !createdSourceId) return;
    const loadOnce = async () => {
      const { data } = await supabase
        .from("knowledge_source_versions")
        .select("id, pipeline_stage, progress_pct, error_message, pipeline_completed_at")
        .eq("source_id", createdSourceId)
        .eq("is_current", true)
        .maybeSingle();
      if (data) {
        setPipelineStage(data.pipeline_stage);
        setProgressPct(data.progress_pct ?? 0);
        setProcessingError(data.error_message ?? null);
        const { data: jobsData } = await supabase
          .from("processing_jobs")
          .select("id, kind, status, attempts, max_attempts, progress_pct, error, input, output, next_run_at, updated_at, created_at")
          .eq("version_id", data.id)
          .order("stage_order", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(80);
        const jobs = (jobsData ?? []) as ProcessingJobRow[];
        setProcessingJobs(jobs);
        if (jobs.length) {
          const { data: eventsData } = await supabase
            .from("processing_events")
            .select("id, job_id, level, message, data, created_at")
            .in("job_id", jobs.map((job) => job.id))
            .order("created_at", { ascending: false })
            .limit(60);
          setProcessingEvents((eventsData ?? []) as ProcessingEventRow[]);
        } else {
          setProcessingEvents([]);
        }
        const shouldKickWorker = allFilesUploaded && !["completed", "failed"].includes(data.pipeline_stage) && !data.pipeline_completed_at;
        if (shouldKickWorker && Date.now() - lastWorkerKickRef.current > 12_000) {
          lastWorkerKickRef.current = Date.now();
          void supabase.functions.invoke("modrek-worker", { body: {} }).catch(() => null);
        }
      }
    };
    loadOnce();
    const iv = setInterval(loadOnce, 3000);
    return () => clearInterval(iv);
  }, [step, createdSourceId, allFilesUploaded]);

  const runWorkerNow = async () => {
    const { error } = await supabase.functions.invoke("modrek-worker", { body: {} });
    if (error) toast.error(error.message || "تعذر تشغيل عامل المعالجة");
    else toast.success("تم تشغيل عامل المعالجة");
  };

  const canNext = () => {
    if (step === 1) return !!typeId;
    if (step === 2) return true;
    if (step === 3) return files.length > 0;
    if (step === 4) return meta.title.trim().length > 0;
    return true;
  };

  const goNext = () => setStep((s) => Math.min(5, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  // Uploads one file. Aborts cleanly if paused/cancelled. Returns true if uploaded.
  const uploadOne = useCallback(async (fileId: string, versionId: string): Promise<boolean> => {
    const target = filesRef.current.find((x) => x.id === fileId);
    if (!target) return false;
    const startedAt = Date.now();
    setFiles((prev) => prev.map((x) => x.id === fileId ? { ...x, status: "uploading" as UploadStatus, progress: 0, loaded: 0, startedAt, speedBps: 0, etaSec: undefined, error: undefined } : x));
    try {
      const sha = await computeModrekFileFingerprint(target.file);
      const safeName = target.file.name.replace(/[^\w.\-]+/g, "_");
      const seg = (id: string, list: { id: string; code: string }[]) => {
        const found = list.find((x) => x.id === id);
        return (found?.code || "unknown").replace(/[^\w-]+/g, "_");
      };
      const stageSeg = tax.stage_id ? seg(tax.stage_id, stages) : "general";
      const gradeSeg = tax.grade_id ? seg(tax.grade_id, grades) : "any-grade";
      const subjectSeg = tax.subject_id ? seg(tax.subject_id, subjects) : "any-subject";
      const typeSeg = (types.find((t) => t.id === typeId)?.code || "misc").replace(/[^\w-]+/g, "_");
      const bunnyPath = `modrek/${stageSeg}/${gradeSeg}/${subjectSeg}/${typeSeg}/${sha}/${safeName}`;

      const { uploadToBunnyStorage } = await import("@/lib/bunnyStorage");
      await uploadToBunnyStorage(
        target.file, bunnyPath,
        (loaded, total) => {
          const pct = Math.max(1, Math.min(99, Math.round((loaded / total) * 100)));
          const elapsed = Math.max(0.5, (Date.now() - startedAt) / 1000);
          const speed = loaded / elapsed;
          const remaining = Math.max(0, total - loaded);
          const eta = speed > 0 ? remaining / speed : undefined;
          setFiles((prev) => prev.map((x) => x.id === fileId ? { ...x, progress: pct, loaded, speedBps: Math.round(speed), etaSec: eta } : x));
        },
        null,
        (xhr) => xhrRefs.current.set(fileId, xhr),
      );

      xhrRefs.current.delete(fileId);
      setFiles((prev) => prev.map((x) => x.id === fileId ? { ...x, status: "registering" as UploadStatus, progress: 99 } : x));

      await registerModrekUpload({
        version_id: versionId, bunny_path: bunnyPath,
        filename: target.file.name, mime: target.file.type || "application/octet-stream",
        size: target.file.size, sha256: sha,
      });

      const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
      setFiles((prev) => prev.map((x) => x.id === fileId ? { ...x, status: "uploaded" as UploadStatus, progress: 100, speedBps: Math.round(x.file.size / elapsed), etaSec: 0 } : x));
      return true;
    } catch (e: any) {
      xhrRefs.current.delete(fileId);
      const isAbort = e?.message === "UPLOAD_ABORTED";
      // If it was aborted because pause was requested, don't mark failed
      setFiles((prev) => prev.map((x) => {
        if (x.id !== fileId) return x;
        if (isAbort && x.status === "paused") return x;
        if (isAbort && x.status === "cancelled") return x;
        return { ...x, status: "failed" as UploadStatus, error: e?.message || "فشل الرفع" };
      }));
      return false;
    }
  }, [stages, grades, subjects, tax, types, typeId]);

  // Sequential queue processor — kicks whenever there's a queued file and queue isn't paused
  useEffect(() => {
    if (!versionIdRef) return;
    if (queuePaused) return;
    const anyUploading = files.some((f) => f.status === "uploading" || f.status === "registering");
    if (anyUploading) return;
    const next = files.find((f) => f.status === "queued");
    if (!next) return;
    void uploadOne(next.id, versionIdRef);
  }, [files, queuePaused, versionIdRef, uploadOne]);

  const startProcessing = async () => {
    if (!typeId || !meta.title.trim()) { toast.error("العنوان ونوع المصدر مطلوبان"); return; }
    if (files.length === 0) { toast.error("أضف ملفًا واحدًا على الأقل"); return; }
    setSaving(true);
    try {
      const { data: src, error: srcErr } = await supabase.from("knowledge_sources").insert({
        title: meta.title.trim(), description: meta.description || null,
        author: meta.author || null, publisher: meta.publisher || null,
        publication_year: tax.year ? parseInt(tax.year) : null,
        language: meta.language || "ar", source_type_id: typeId,
        stage_id: tax.stage_id || null, grade_id: tax.grade_id || null,
        section_id: tax.section_id || null, track_id: isNoTrackCode(selectedTrackCode) ? null : (tax.track_id || null),
        subject_id: tax.subject_id || null, sub_subject_id: tax.sub_subject_id || null,
        term: tax.term ? parseInt(tax.term) : null, status: "draft",
        metadata: { keywords: meta.keywords ? meta.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [] },
      }).select("id").single();
      if (srcErr) throw srcErr;

      const { data: ver, error: verErr } = await supabase.from("knowledge_source_versions").insert({
        source_id: src!.id, version_number: 1, is_current: true, notes: "النسخة الأولى",
      }).select("id").single();
      if (verErr) throw verErr;

      setCreatedSourceId(src!.id);
      setVersionIdRef(ver!.id);
      setQueuePausedBoth(false);
      // reset stuck states to queued so the effect picks them up
      setFiles((prev) => prev.map((x) => x.status === "failed" || x.status === "cancelled" ? { ...x, status: "queued" as UploadStatus, progress: 0, loaded: 0, error: undefined } : x));
      setStep(5);
      toast.success("بدأت طابور الرفع — رفع تسلسلي مع تتبع لحظي");
    } catch (e: any) {
      console.error(e); toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const stepProgress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-4 animate-in fade-in duration-200 [font-family:Cairo,system-ui,sans-serif]"
    >
      <div className="bg-white w-full md:max-w-6xl md:rounded-[24px] shadow-[0_24px_60px_rgba(15,23,42,0.24)] flex flex-col max-h-[100vh] md:max-h-[95vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 border border-[#E5E7EB]">
        {/* Header */}
        <div className="relative px-5 md:px-8 pt-5 pb-4 border-b border-[#E5E7EB] bg-white">
          <button
            onClick={closeSafely}
            aria-label="إغلاق"
            className="absolute top-4 left-4 h-9 w-9 rounded-[10px] bg-[#F1F5F9] text-[#334155] hover:bg-[#FEF2F2] hover:text-[#DC2626] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#EF4444]/20 flex items-center justify-center transition-all"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-[16px] bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white flex items-center justify-center shadow-[0_10px_28px_rgba(37,99,235,0.35)] shrink-0">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-lg md:text-xl text-[#0F172A]">إضافة مصدر جديد</h2>
                <ModrekPill tone="purple" icon={Sparkles}>Modrek AI</ModrekPill>
              </div>
              <p className="text-[12px] text-[#94A3B8] mt-0.5 hidden md:block">
                خطوة {step} من {STEPS.length} — {STEPS[step - 1]?.label}
              </p>
            </div>
          </div>

          {/* Stepper */}
          <div className="mt-5">
            <div className="relative">
              <div className="absolute top-5 right-0 left-0 h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-[#3B82F6] to-[#2563EB] transition-all duration-500"
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
                        done && "border-[#22C55E] text-white bg-[#22C55E] shadow-[0_6px_16px_rgba(34,197,94,0.30)]",
                        active && "border-[#2563EB] text-white bg-gradient-to-br from-[#3B82F6] to-[#2563EB] shadow-[0_8px_20px_rgba(37,99,235,0.35)] scale-110 ring-4 ring-[#EFF6FF]",
                        !done && !active && "border-[#E5E7EB] text-[#94A3B8]",
                      )}>
                        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={cn(
                        "text-[10px] md:text-[11px] font-bold text-center leading-tight transition",
                        active ? "text-[#2563EB]" : done ? "text-[#059669]" : "text-[#94A3B8]",
                      )}>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6 grid md:grid-cols-[1fr_280px] gap-6 bg-[#F8FAFC]">
          <div className="min-w-0" key={step}>
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">

              {step === 1 && (
                <StepBlock title="اختر نوع المصدر" hint="حدد نوع الملف الذي ستقوم برفعه — يساعدنا هذا على تحسين المعالجة.">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {types.map((t) => {
                      const Icon = TYPE_ICONS[t.code] ?? FileIcon;
                      const sel = typeId === t.id;
                      const accent = TYPE_ACCENT[t.code] ?? TYPE_ACCENT.other;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setTypeId(t.id)}
                          className={cn(
                            "relative group text-right rounded-[18px] bg-white border p-4 min-h-[168px] transition-all duration-200",
                            "shadow-[0_4px_16px_rgba(37,99,235,0.05)]",
                            sel
                              ? "border-[#2563EB] shadow-[0_12px_32px_rgba(37,99,235,0.20)] -translate-y-1"
                              : "border-[#E5E7EB] hover:border-[#93C5FD] hover:shadow-[0_10px_28px_rgba(37,99,235,0.10)] hover:-translate-y-0.5",
                          )}
                        >
                          {sel && (
                            <div className="absolute top-2 left-2 h-6 w-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(34,197,94,0.35)] animate-in zoom-in-50 duration-200">
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </div>
                          )}
                          <div
                            className={cn(
                              "h-12 w-12 rounded-[14px] flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-110 ring-1",
                              sel && "scale-110",
                            )}
                            style={{ background: accent.bg, color: accent.fg, boxShadow: `inset 0 0 0 1px ${accent.ring}` }}
                          >
                            <Icon className="h-6 w-6" />
                          </div>
                          <div className="font-extrabold text-[14px] text-[#0F172A]">{t.name_ar}</div>
                          <div className="text-[11.5px] text-[#94A3B8] mt-1 line-clamp-2 min-h-[28px] leading-relaxed">
                            {TYPE_TAGLINES[t.code] ?? "مصدر معرفي"}
                          </div>
                          <div className="mt-3 pt-2 border-t border-[#F1F5F9] flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#475569] tabular-nums">
                              {typeCounts[t.id] ?? 0} مصدر
                            </span>
                            <div className={cn("h-2 w-2 rounded-full transition", sel ? "bg-[#2563EB] shadow-[0_0_0_4px_rgba(37,99,235,0.15)]" : "bg-[#CBD5E1]")} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </StepBlock>
              )}

              {step === 2 && (
                <StepBlock title="التصنيف الأكاديمي" hint="اختر النظام والمرحلة أولاً — تتحدّث القوائم تلقائياً.">
                  <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <TaxonomyCount label="الأقسام" value={availableSections.length} icon={LibraryIcon} accent="blue" />
                    <TaxonomyCount label="المراحل" value={stages.length} icon={GraduationCap} accent="emerald" />
                    <TaxonomyCount label="الصفوف" value={filteredGrades.length || grades.length} icon={BookOpen} accent="amber" />
                    <TaxonomyCount label="المواد" value={filteredSubjects.length} icon={Layers} accent="purple" />
                  </div>
                  <ModrekCard>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="النظام التعليمي" required>
                        <SearchSelect value={tax.section_id}
                          onChange={(v) => setTax((t) => ({ ...t, section_id: v, subject_id: "", sub_subject_id: "" }))}
                          placeholder="عام / أزهري / مشترك" options={availableSections} />
                      </Field>
                      <Field label="المرحلة">
                        <SearchSelect value={tax.stage_id}
                          onChange={(v) => setTax((t) => ({ ...t, stage_id: v, grade_id: "", track_id: "", subject_id: "", sub_subject_id: "" }))}
                          placeholder="اختر المرحلة" options={stages} />
                      </Field>
                      <Field label="الصف">
                        <SearchSelect value={tax.grade_id} onChange={(v) => setTax((t) => ({ ...t, grade_id: v, subject_id: "", sub_subject_id: "" }))}
                          placeholder={tax.stage_id ? "اختر الصف" : "اختر المرحلة أولاً"}
                          options={filteredGrades} disabled={!tax.stage_id} />
                      </Field>
                      <Field label="الشعبة (علمي / أدبي)">
                        <SearchSelect value={tax.track_id} onChange={(v) => setTax((t) => ({ ...t, track_id: v, subject_id: "", sub_subject_id: "" }))}
                          placeholder={availableTracks.length ? "اختر الشعبة" : "لا توجد شعب لهذه المرحلة"}
                          options={availableTracks} disabled={availableTracks.length === 0} />
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
                          <Calendar className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
                          <input
                            type="number" min={1990} max={2100} value={tax.year}
                            onChange={(e) => setTax((t) => ({ ...t, year: e.target.value }))}
                            placeholder="مثال: 2025"
                            className={INPUT_CLS + " pr-10"}
                          />
                        </div>
                      </Field>
                    </div>
                  </ModrekCard>
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
                      "relative overflow-hidden rounded-[20px] border-2 border-dashed p-8 md:p-12 text-center transition-all duration-200 cursor-pointer group bg-white",
                      dragOver
                        ? "border-[#2563EB] bg-[#EFF6FF] ring-4 ring-[#DBEAFE]"
                        : "border-[#BFDBFE] hover:border-[#2563EB] hover:bg-[#F8FAFC]",
                    )}
                  >
                    {/* subtle cloud accent */}
                    <div className="absolute -top-16 -left-16 h-40 w-40 rounded-full bg-[#DBEAFE] opacity-40 blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-[#EDE9FE] opacity-40 blur-3xl pointer-events-none" />

                    <div className={cn(
                      "relative h-20 w-20 rounded-[20px] mx-auto bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white flex items-center justify-center shadow-[0_16px_40px_rgba(37,99,235,0.35)] mb-4 transition-transform duration-300",
                      dragOver ? "scale-110" : "group-hover:scale-105",
                    )}>
                      <UploadCloud className="h-10 w-10" />
                    </div>
                    <div className="relative font-extrabold text-xl text-[#0F172A]">
                      {dragOver ? "أفلت الملفات هنا" : "اسحب وأفلت الملفات"}
                    </div>
                    <div className="relative text-[13px] text-[#94A3B8] mt-1.5">أو اضغط للاختيار من جهازك</div>
                    <div className="relative mt-5 flex justify-center gap-2 flex-wrap">
                      <ModrekButton
                        icon={UploadCloud} size="lg" variant="primary"
                        onClick={(e) => { e.stopPropagation(); fileInput.current?.click(); }}
                      >
                        اختر الملفات
                      </ModrekButton>
                      <ModrekButton
                        icon={FolderOpen} size="lg" variant="secondary"
                        onClick={(e) => { e.stopPropagation(); folderInput.current?.click(); }}
                      >
                        اختر مجلدًا كاملاً
                      </ModrekButton>
                    </div>
                    <div className="relative mt-4 flex items-center justify-center gap-1.5 flex-wrap">
                      {SUPPORTED_EXTENSIONS.map((ext) => (
                        <ModrekPill key={ext} tone="slate" size="sm">{ext}</ModrekPill>
                      ))}
                    </div>
                    <div className="relative text-[11px] text-[#94A3B8] mt-3">حد أقصى 300MB لكل ملف · رفع تسلسلي مع طابور ذكي</div>
                    <input
                      ref={fileInput} type="file" multiple className="hidden" accept={ACCEPT}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                    />
                    <input
                      ref={folderInput} type="file" multiple className="hidden"
                      // @ts-expect-error webkitdirectory is a browser attribute
                      webkitdirectory="" directory=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                    />
                  </div>

                  {files.length > 0 && (
                    <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <div className="font-bold text-sm text-[#0F172A] flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#2563EB]" />
                          الملفات في الطابور
                          <ModrekPill tone="blue" size="sm">{files.length}</ModrekPill>
                          <ModrekPill tone="slate" size="sm">{fmtBytes(totalBytes)}</ModrekPill>
                        </div>
                        {createdSourceId && (
                          <div className="flex items-center gap-1.5">
                            {queuePaused ? (
                              <ModrekButton size="sm" variant="success" icon={Play} onClick={() => setQueuePausedBoth(false)}>
                                استئناف الطابور
                              </ModrekButton>
                            ) : (
                              <ModrekButton size="sm" variant="warning" icon={Pause} onClick={() => setQueuePausedBoth(true)}>
                                إيقاف الطابور
                              </ModrekButton>
                            )}
                            <ModrekButton size="sm" variant="danger" icon={XCircle} onClick={cancelAll}>
                              إلغاء الكل
                            </ModrekButton>
                          </div>
                        )}
                      </div>
                      <div className="grid gap-2">
                        {files.map((f) => (
                          <FileCard
                            key={f.id} f={f}
                            onRemove={() => removeFile(f.id)}
                            onReplace={(newFile) => replaceFile(f.id, newFile)}
                            onPause={() => pauseFile(f.id)}
                            onResume={() => resumeFile(f.id)}
                            onCancel={() => cancelFile(f.id)}
                            onRetry={() => resumeFile(f.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </StepBlock>
              )}

              {step === 4 && (
                <StepBlock title="معلومات المصدر" hint="حقول تساعد على فهرسة المصدر بشكل أفضل. العنوان مطلوب.">
                  <ModrekCard className="grid gap-4">
                    <Field label="عنوان المصدر" required>
                      <input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
                        placeholder="مثال: كتاب الفقه للصف الثالث الثانوي — الأزهر"
                        className={INPUT_CLS + " h-12 text-[15px] font-bold"} />
                    </Field>
                    <Field label="وصف مختصر">
                      <Textarea rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
                        placeholder="نبذة عن محتوى المصدر ومن يستفيد منه"
                        className="resize-none rounded-[12px] border-[#E5E7EB] bg-white focus-visible:ring-4 focus-visible:ring-[#2563EB]/10 focus-visible:border-[#2563EB]" />
                    </Field>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="المؤلف">
                        <input value={meta.author} onChange={(e) => setMeta((m) => ({ ...m, author: e.target.value }))} className={INPUT_CLS} />
                      </Field>
                      <Field label="دار النشر">
                        <input value={meta.publisher} onChange={(e) => setMeta((m) => ({ ...m, publisher: e.target.value }))} className={INPUT_CLS} />
                      </Field>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="لغة المحتوى">
                        <SearchSelect value={meta.language} onChange={(v) => setMeta((m) => ({ ...m, language: v }))}
                          options={[{ id: "ar", name_ar: "العربية", code: "ar" }, { id: "en", name_ar: "الإنجليزية", code: "en" }, { id: "fr", name_ar: "الفرنسية", code: "fr" }]}
                        />
                      </Field>
                      <Field label="كلمات مفتاحية">
                        <input value={meta.keywords} onChange={(e) => setMeta((m) => ({ ...m, keywords: e.target.value }))}
                          placeholder="فقه, معاملات, ثانوية" className={INPUT_CLS} />
                      </Field>
                    </div>
                  </ModrekCard>
                </StepBlock>
              )}

              {step === 5 && (
                <StepBlock title={createdSourceId ? "المعالجة الذكية" : "المراجعة النهائية"} hint={createdSourceId ? "جاري تجهيز المصدر — يمكنك متابعة التقدم لحظياً." : "راجع كل شيء قبل بدء المعالجة."}>
                  {!createdSourceId ? (
                    <ReviewCard
                      typeName={types.find((t) => t.id === typeId)?.name_ar ?? ""}
                      tax={tax} files={files}
                      stages={stages} grades={grades} sections={sections} tracks={[ALL_TRACKS_OPTION, ...tracks]}
                      subjects={subjects} subSubjects={subSubjects}
                      meta={meta} onStart={startProcessing} saving={saving}
                    />
                  ) : (
                      <ProcessingView
                        stage={pipelineStage} pct={progressPct} files={files} canOpen={allFilesUploaded}
                        error={processingError} jobs={processingJobs} events={processingEvents} onRunWorker={runWorkerNow}
                      onOpen={() => { onCreated(createdSourceId); onClose(); }}
                    />
                  )}
                </StepBlock>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="hidden md:block space-y-3">
            <div className="rounded-[16px] bg-gradient-to-br from-[#FFFBEB] to-white border border-[#FEF3C7] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-[10px] bg-[#FEF3C7] text-[#B45309] flex items-center justify-center">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <div className="font-extrabold text-[13px] text-[#B45309]">نصائح ذكية</div>
              </div>
              <ul className="space-y-2 text-[12px] text-[#78350F] list-none">
                <TipItem>ملفات PDF أوضح تعطي دقة OCR أعلى</TipItem>
                <TipItem>استخدم أسماء ملفات وصفية للأرشفة</TipItem>
                <TipItem>يمكن ضغط الملفات الكبيرة قبل الرفع</TipItem>
                <TipItem>تأكد من دقة التصنيف الأكاديمي</TipItem>
              </ul>
            </div>
            <div className="rounded-[16px] bg-white border border-[#E5E7EB] p-4">
              <div className="text-[11px] font-extrabold text-[#94A3B8] uppercase tracking-wider mb-3">إحصائيات الرفع</div>
              <div className="grid grid-cols-2 gap-2">
                <SideStat label="الملفات" value={files.length} icon={FileText} accent="blue" />
                <SideStat label="الحجم" value={fmtBytes(totalBytes)} icon={Database} accent="purple" />
              </div>
            </div>
            {typeId && (
              <div className="rounded-[16px] bg-gradient-to-br from-[#EFF6FF] to-white border border-[#DBEAFE] p-4">
                <div className="text-[11px] font-extrabold text-[#2563EB] uppercase tracking-wider">النوع المحدد</div>
                <div className="mt-1.5 font-extrabold text-[#0F172A] text-[15px]">
                  {types.find((t) => t.id === typeId)?.name_ar}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="border-t border-[#E5E7EB] px-5 md:px-8 py-4 flex items-center justify-between bg-white gap-3">
          <ModrekButton
            variant="secondary" onClick={step === 1 ? closeSafely : goBack} disabled={saving || (step === 5 && uploadQueueActive)}
            icon={step === 1 ? undefined : ArrowRight}
          >
            {step === 1 ? "إلغاء" : "رجوع"}
          </ModrekButton>
          <div className="hidden sm:flex items-center gap-1.5">
            {STEPS.map((s) => (
              <div key={s.n} className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                step === s.n ? "w-6 bg-gradient-to-l from-[#3B82F6] to-[#2563EB]"
                  : step > s.n ? "w-1.5 bg-[#22C55E]" : "w-1.5 bg-[#E5E7EB]",
              )} />
            ))}
          </div>
          {step < 5 ? (
            <ModrekButton
              variant="primary" onClick={goNext} disabled={!canNext()}
              icon={ArrowLeft} iconPosition="end" className="min-w-[110px]"
            >
              التالي
            </ModrekButton>
          ) : !createdSourceId ? (
            <ModrekButton
              variant="primary" onClick={startProcessing} disabled={saving || !meta.title.trim()}
              icon={Sparkles} loading={saving} className="min-w-[170px]"
            >
              بدء المعالجة
            </ModrekButton>
          ) : (
            <ModrekButton
              variant="success" onClick={() => { if (allFilesUploaded) { onCreated(createdSourceId); onClose(); } else toast.warning("انتظر اكتمال الرفع أولاً"); }} disabled={!allFilesUploaded}
              icon={ArrowLeft} iconPosition="end" className="min-w-[140px]"
            >
              فتح المصدر
            </ModrekButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

const INPUT_CLS =
  "w-full h-11 rounded-[12px] bg-white border border-[#E5E7EB] px-3 text-[13px] font-semibold text-[#0F172A] placeholder:text-[#94A3B8] placeholder:font-normal " +
  "transition-all duration-150 hover:border-[#93C5FD] focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10";

function StepBlock({ title, hint, children }: any) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[20px] font-extrabold text-[#0F172A] tracking-tight">{title}</h3>
        {hint && <p className="text-[13px] text-[#94A3B8] mt-1 leading-relaxed">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-bold text-[#334155] flex items-center gap-1">
        {label}
        {required && <span className="text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}

function TaxonomyCount({ label, value, icon: Icon, accent }: any) {
  const styles: Record<string, { bg: string; fg: string; ring: string }> = {
    blue: { bg: "#EFF6FF", fg: "#2563EB", ring: "#DBEAFE" },
    emerald: { bg: "#ECFDF5", fg: "#059669", ring: "#D1FAE5" },
    amber: { bg: "#FFFBEB", fg: "#D97706", ring: "#FEF3C7" },
    purple: { bg: "#F5F3FF", fg: "#7C3AED", ring: "#EDE9FE" },
  };
  const s = styles[accent] ?? styles.blue;
  return (
    <div className="rounded-[14px] bg-white border border-[#E5E7EB] p-3 flex items-center gap-3 shadow-[0_4px_12px_rgba(37,99,235,0.04)]">
      <div
        className="h-10 w-10 rounded-[12px] flex items-center justify-center ring-1"
        style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-[#94A3B8] truncate">{label}</div>
        <div className="text-[17px] font-extrabold text-[#0F172A] tabular-nums leading-none mt-0.5">
          {Number(value || 0).toLocaleString("ar-EG")}
        </div>
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
          "w-full h-11 rounded-[12px] bg-white border pr-3 pl-9 text-[13px] text-right transition-all flex items-center justify-between gap-2",
          "focus:outline-none focus:ring-4 focus:ring-[#2563EB]/10 disabled:bg-[#F8FAFC] disabled:cursor-not-allowed",
          open ? "border-[#2563EB]" : "border-[#E5E7EB] hover:border-[#93C5FD]",
        )}
      >
        <span className={cn("truncate", selected ? "text-[#0F172A] font-bold" : "text-[#94A3B8] font-normal")}>
          {selected?.name_ar ?? placeholder ?? "اختر"}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-[#94A3B8] transition-transform shrink-0", open && "rotate-180 text-[#2563EB]")} />
      </button>
      {open && (
        <div className="absolute z-30 top-full right-0 left-0 mt-1.5 rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.15)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {options.length > 5 && (
            <div className="p-2 border-b border-[#F1F5F9] relative bg-[#F8FAFC]">
              <Search className="h-3.5 w-3.5 absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="بحث..."
                className="w-full h-9 rounded-[10px] border border-[#E5E7EB] bg-white pr-8 pl-2 text-[12px] font-semibold text-[#0F172A] focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-[#94A3B8]">لا نتائج</div>
            ) : filtered.map((o) => {
              const active = value === o.id;
              return (
                <button
                  key={o.id} type="button"
                  onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] text-right transition-colors",
                    active
                      ? "bg-[#EFF6FF] text-[#1D4ED8] font-extrabold"
                      : "text-[#334155] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-semibold",
                  )}
                >
                  <span className="truncate">{o.name_ar}</span>
                  {active && <Check className="h-4 w-4 text-[#2563EB] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FileCard({ f, onRemove, onReplace, onPause, onResume, onCancel, onRetry }: {
  f: UploadFile; onRemove: () => void; onReplace: (newFile: File) => void;
  onPause?: () => void; onResume?: () => void; onCancel?: () => void; onRetry?: () => void;
}) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const ext = (f.file.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
  const isImg = !!f.preview;
  const accent: { bg: string; fg: string; ring: string } = isImg
    ? { bg: "#ECFEFF", fg: "#0891B2", ring: "#CFFAFE" }
    : ext === "PDF" ? { bg: "#FEF2F2", fg: "#DC2626", ring: "#FEE2E2" }
    : ext === "DOCX" ? { bg: "#EFF6FF", fg: "#2563EB", ring: "#DBEAFE" }
    : ext === "PPTX" ? { bg: "#FFFBEB", fg: "#D97706", ring: "#FEF3C7" }
    : { bg: "#F1F5F9", fg: "#334155", ring: "#E2E8F0" };

  const isActive = f.status === "uploading" || f.status === "registering";
  const canRetry = f.status === "failed" || f.status === "cancelled" || f.status === "paused";
  const canEdit = f.status === "queued" || f.status === "failed" || f.status === "cancelled";

  return (
    <div className={cn(
      "group relative rounded-[14px] bg-white border p-3 flex items-center gap-3 transition-all",
      f.status === "uploaded" && "border-[#A7F3D0] bg-[#F0FDF4]",
      f.status === "failed" && "border-[#FECACA] bg-[#FEF2F2]",
      f.status === "cancelled" && "border-[#E5E7EB] bg-[#F8FAFC] opacity-70",
      f.status === "paused" && "border-[#FEF3C7] bg-[#FFFBEB]",
      isActive && "border-[#93C5FD] shadow-[0_8px_20px_rgba(37,99,235,0.10)]",
      !isActive && f.status !== "uploaded" && f.status !== "failed" && f.status !== "paused" && f.status !== "cancelled" && "border-[#E5E7EB] hover:border-[#93C5FD]",
    )}>
      {isImg ? (
        <img src={f.preview} alt="" className="h-14 w-14 rounded-[12px] object-cover ring-1 ring-[#E5E7EB] shrink-0" />
      ) : (
        <div
          className="h-14 w-14 rounded-[12px] flex flex-col items-center justify-center shrink-0 ring-1"
          style={{ background: accent.bg, color: accent.fg, boxShadow: `inset 0 0 0 1px ${accent.ring}` }}
        >
          <FileText className="h-5 w-5" />
          <span className="text-[9px] font-extrabold mt-0.5">{ext}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-[#0F172A] truncate" title={f.relPath || f.file.name}>
          {f.relPath || f.file.name}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] text-[#94A3B8] font-semibold">{fmtBytes(f.file.size)}</span>
          <span className="text-[#CBD5E1]">·</span>
          <ModrekPill tone="slate" size="sm">{ext}</ModrekPill>
          <StatusBadge s={f.status} />
        </div>
        {(isActive || f.status === "paused") && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Progress value={f.progress} className="h-1.5 flex-1 min-w-[120px]" />
            <span className="text-[11px] font-bold text-[#2563EB] tabular-nums">{f.progress}%</span>
            {isActive && (
              <>
                <span className="text-[10px] font-bold text-[#94A3B8] tabular-nums flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> {fmtBytes(f.speedBps ?? 0)}/ث
                </span>
                {f.etaSec != null && f.etaSec > 0 && (
                  <span className="text-[10px] font-bold text-[#94A3B8] tabular-nums flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {fmtEta(f.etaSec)}
                  </span>
                )}
              </>
            )}
          </div>
        )}
        {f.error && <div className="text-[11px] text-[#DC2626] mt-1 font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {f.error}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isActive && onPause && (
          <button onClick={onPause} title="إيقاف مؤقت" aria-label="إيقاف مؤقت"
            className="h-9 w-9 rounded-[10px] bg-[#FFFBEB] text-[#B45309] hover:bg-[#FEF3C7] flex items-center justify-center transition-colors ring-1 ring-[#FEF3C7]">
            <Pause className="h-4 w-4" />
          </button>
        )}
        {isActive && onCancel && (
          <button onClick={onCancel} title="إلغاء" aria-label="إلغاء"
            className="h-9 w-9 rounded-[10px] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center transition-colors ring-1 ring-[#FEE2E2]">
            <XCircle className="h-4 w-4" />
          </button>
        )}
        {canRetry && (onResume || onRetry) && (
          <button onClick={onResume ?? onRetry} title="إعادة المحاولة" aria-label="إعادة المحاولة"
            className="h-9 w-9 rounded-[10px] bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] flex items-center justify-center transition-colors ring-1 ring-[#D1FAE5]">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {canEdit && (
          <>
            <button
              onClick={() => replaceInput.current?.click()}
              title="استبدال" aria-label="استبدال الملف"
              className="h-9 w-9 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] flex items-center justify-center transition-colors ring-1 ring-[#DBEAFE]"
            >
              <Replace className="h-4 w-4" />
            </button>
            <button
              onClick={onRemove}
              title="حذف" aria-label="حذف الملف"
              className="h-9 w-9 rounded-[10px] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center transition-colors ring-1 ring-[#FEE2E2]"
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

function StatusBadge({ s }: { s: UploadStatus }) {
  const map: Record<UploadStatus, { l: string; tone: "slate" | "blue" | "emerald" | "red" | "amber" | "purple" }> = {
    queued: { l: "في الانتظار", tone: "slate" },
    uploading: { l: "جاري الرفع", tone: "blue" },
    registering: { l: "تسجيل...", tone: "purple" },
    paused: { l: "متوقف مؤقتًا", tone: "amber" },
    uploaded: { l: "تم الرفع", tone: "emerald" },
    failed: { l: "فشل", tone: "red" },
    cancelled: { l: "أُلغي", tone: "slate" },
  };
  const m = map[s];
  return <ModrekPill tone={m.tone} size="sm">{m.l}</ModrekPill>;
}

function TipItem({ children }: any) {
  return (
    <li className="flex gap-2 items-start">
      <div className="h-4 w-4 rounded-full bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-[#FDE68A]">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </div>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function SideStat({ label, value, icon: Icon, accent }: any) {
  const styles: Record<string, { bg: string; fg: string; ring: string }> = {
    blue: { bg: "#EFF6FF", fg: "#2563EB", ring: "#DBEAFE" },
    purple: { bg: "#F5F3FF", fg: "#7C3AED", ring: "#EDE9FE" },
  };
  const s = styles[accent] ?? styles.blue;
  return (
    <div className="rounded-[12px] bg-white border border-[#E5E7EB] p-2.5">
      <div
        className="h-7 w-7 rounded-[8px] flex items-center justify-center mb-1.5 ring-1"
        style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-[10px] text-[#94A3B8] font-bold">{label}</div>
      <div className="text-[14px] font-extrabold text-[#0F172A] tabular-nums">{value}</div>
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
      <ModrekCard>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-[12px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center ring-1 ring-[#DBEAFE]">
            <Eye className="h-4 w-4" />
          </div>
          <div className="font-extrabold text-[15px] text-[#0F172A]">مراجعة نهائية</div>
        </div>
        <div className="rounded-[14px] bg-gradient-to-br from-[#EFF6FF] to-white border border-[#DBEAFE] p-4 mb-3">
          <div className="text-[10px] font-extrabold text-[#2563EB] uppercase tracking-wider">عنوان المصدر</div>
          <div className="mt-1 font-extrabold text-[#0F172A] text-[17px]">{meta.title || "—"}</div>
          {meta.description && <div className="mt-1 text-[13px] text-[#475569] line-clamp-2">{meta.description}</div>}
        </div>
        <dl className="grid md:grid-cols-2 gap-x-6 gap-y-1">
          {rows.map(([k, v, Icon]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5 border-b border-dashed border-[#F1F5F9] last:border-0">
              <dt className="text-[12px] text-[#475569] font-bold flex items-center gap-2">
                <span className="h-7 w-7 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {k}
              </dt>
              <dd className="text-[12px] font-extrabold text-[#0F172A] truncate max-w-[55%]">{v}</dd>
            </div>
          ))}
        </dl>
      </ModrekCard>
      <ModrekButton
        variant="primary" size="lg" onClick={onStart} disabled={saving}
        loading={saving} icon={Sparkles} fullWidth
      >
        بدء المعالجة الذكية
      </ModrekButton>
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

function formatDiagnosticData(data: Record<string, any> | null | undefined) {
  if (!data) return null;
  const useful = {
    category: data.category,
    file: data.file,
    function: data.function,
    line: data.line,
    rawMessage: data.rawMessage,
    next_run_at: data.next_run_at,
    attempts: data.attempts,
    max_attempts: data.max_attempts,
  };
  return Object.fromEntries(Object.entries(useful).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function ProcessingView({ stage, pct, files, onOpen, canOpen, error, jobs = [], events = [], onRunWorker }: any) {
  const idx = Math.max(0, PIPE.findIndex((p) => p.key === stage));
  const done = stage === "completed";
  const failed = stage === "failed";
  const visibleJobs = [...jobs].reverse().slice(0, 8).reverse();
  const problemJobs = jobs.filter((job: ProcessingJobRow) => ["failed", "retrying", "running"].includes(job.status)).slice(-6);
  const latestProblemEvent = events.find((event: ProcessingEventRow) => event.level === "error" || event.level === "warn") ?? null;
  const latestData = formatDiagnosticData(latestProblemEvent?.data);
  return (
    <div className="space-y-5">
      <div className={cn(
        "relative overflow-hidden rounded-[20px] p-6 border",
        failed ? "bg-gradient-to-br from-[#FEF2F2] to-white border-[#FECACA]"
          : done ? "bg-gradient-to-br from-[#ECFDF5] to-white border-[#A7F3D0]"
          : "bg-gradient-to-br from-[#EFF6FF] to-white border-[#DBEAFE]",
      )}>
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-[#DBEAFE] opacity-50 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[#EDE9FE] opacity-50 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className={cn(
            "h-16 w-16 rounded-[18px] flex items-center justify-center text-white shadow-[0_12px_28px_rgba(37,99,235,0.30)]",
            failed ? "bg-gradient-to-br from-[#EF4444] to-[#DC2626]"
              : done ? "bg-gradient-to-br from-[#34D399] to-[#22C55E]"
              : "bg-gradient-to-br from-[#3B82F6] to-[#2563EB]",
          )}>
            {failed ? <XCircle className="h-7 w-7" /> : done ? <PartyPopper className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[17px] text-[#0F172A]">
              {failed ? "توقفت المعالجة بسبب خطأ" : done ? "🎉 اكتملت المعالجة بنجاح" : "جاري المعالجة الذكية..."}
            </div>
            <div className="text-[13px] text-[#475569] mt-0.5">
              {PIPE[idx]?.desc} · <span className="font-bold tabular-nums text-[#2563EB]">{pct}%</span>
            </div>
          </div>
        </div>
        <div className="relative mt-5">
          <Progress value={pct} className="h-2.5" />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-[14px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-right">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-[#991B1B]">سبب توقف المعالجة</div>
            <div className="mt-1 break-words text-[12px] font-semibold leading-6 text-[#B91C1C]">{error}</div>
          </div>
        </div>
      )}

      {(problemJobs.length > 0 || latestProblemEvent) && (
        <ModrekCard className="border-[#FDE68A] bg-gradient-to-br from-[#FFFBEB] to-white">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#FEF3C7] text-[#B45309]">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-[#92400E]">تشخيص الفشل المباشر</div>
              <div className="text-[11px] font-semibold text-[#B45309]">يعرض المرحلة، الملف، المحاولة، وسبب مزود الذكاء أو المهلة بدقة.</div>
            </div>
          </div>

          {latestProblemEvent && (
            <div className="mb-3 rounded-[12px] border border-[#FDE68A] bg-white p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold text-[#92400E]">
                <ModrekPill tone={latestProblemEvent.level === "error" ? "red" : "amber"} size="sm">{latestProblemEvent.level}</ModrekPill>
                <span>{latestProblemEvent.message}</span>
                <span className="mr-auto text-[#94A3B8]" dir="ltr">{new Date(latestProblemEvent.created_at).toLocaleTimeString("ar-EG")}</span>
              </div>
              {latestData && Object.keys(latestData).length > 0 && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-[10px] bg-[#0F172A] p-3 text-left text-[10px] leading-5 text-white" dir="ltr">
                  {JSON.stringify(latestData, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="space-y-2">
            {problemJobs.map((job: ProcessingJobRow) => (
              <div key={job.id} className="rounded-[12px] border border-[#F1F5F9] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ModrekPill tone={job.status === "failed" ? "red" : job.status === "retrying" ? "amber" : "blue"} size="sm">{job.status}</ModrekPill>
                  <span className="text-[12px] font-extrabold text-[#0F172A]">{job.kind}</span>
                  {job.input?.page_from && <span className="text-[11px] font-bold text-[#475569]">صفحات {job.input.page_from}-{job.input.page_to ?? job.input.page_from}</span>}
                  <span className="mr-auto text-[10px] font-bold text-[#94A3B8]">محاولة {job.attempts ?? 0}/{job.max_attempts ?? 3}</span>
                </div>
                {job.error && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-[10px] bg-[#FEF2F2] p-2 text-left text-[10px] leading-5 text-[#991B1B]" dir="ltr">{job.error}</pre>}
                {job.next_run_at && job.status === "retrying" && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#B45309]">
                    <Clock className="h-3.5 w-3.5" /> إعادة تلقائية: {new Date(job.next_run_at).toLocaleTimeString("ar-EG")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ModrekCard>
      )}

      <div className="flex flex-wrap gap-2">
        <ModrekButton variant="warning" size="md" icon={RefreshCw} onClick={onRunWorker}>
          تشغيل عامل المعالجة الآن
        </ModrekButton>
        <ModrekButton
          variant="success" size="md" onClick={canOpen ? onOpen : undefined}
          disabled={!canOpen}
          icon={Eye}
        >
          {canOpen ? "فتح صفحة المصدر" : "انتظر اكتمال رفع الملفات"}
        </ModrekButton>
      </div>

      <ModrekCard>
        {visibleJobs.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {visibleJobs.map((job: ProcessingJobRow) => (
              <div key={job.id} className="rounded-[12px] border border-[#F1F5F9] bg-white p-2">
                <div className="truncate text-[10px] font-extrabold text-[#475569]">{job.kind}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <ModrekPill tone={job.status === "failed" ? "red" : job.status === "retrying" ? "amber" : job.status === "succeeded" ? "emerald" : job.status === "running" ? "blue" : "slate"} size="sm">
                    {job.status}
                  </ModrekPill>
                  <span className="text-[10px] font-bold text-[#94A3B8]">{job.progress_pct ?? 0}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] font-extrabold text-[#94A3B8] uppercase tracking-wider mb-3">مراحل المعالجة</div>
        <div className="space-y-1">
          {PIPE.map((p, i) => {
            const state = done || i < idx ? "done" : i === idx ? "active" : "pending";
            const Icon = p.icon;
            return (
              <div key={p.key} className={cn(
                "flex items-center gap-3 p-2.5 rounded-[12px] transition-all",
                state === "active" && "bg-[#EFF6FF]",
              )}>
                <div className={cn(
                  "h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 transition-all",
                  state === "done" && "bg-[#22C55E] text-white shadow-[0_4px_12px_rgba(34,197,94,0.30)]",
                  state === "active" && "bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-white shadow-[0_8px_20px_rgba(37,99,235,0.30)] ring-4 ring-[#DBEAFE]",
                  state === "pending" && "bg-[#F1F5F9] text-[#94A3B8]",
                )}>
                  {state === "done" ? <Check className="h-4 w-4" strokeWidth={3} />
                    : state === "active" ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-[13px] font-bold",
                    state === "done" ? "text-[#047857]"
                      : state === "active" ? "text-[#1D4ED8]"
                      : "text-[#94A3B8]")}>
                    {p.label}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] truncate">{p.desc}</div>
                </div>
                {failed && state === "active" && <ModrekPill tone="red" size="sm">فشل</ModrekPill>}
                {!failed && state === "active" && <ModrekPill tone="blue" size="sm">جارٍ الآن</ModrekPill>}
                {state === "done" && <ModrekPill tone="emerald" size="sm">✓ تمّ</ModrekPill>}
              </div>
            );
          })}
        </div>
      </ModrekCard>

      <ModrekCard>
        <div className="text-[11px] font-extrabold text-[#94A3B8] uppercase tracking-wider mb-3">ملفات المصدر</div>
        <div className="space-y-1.5">
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 text-[12px] p-2.5 rounded-[10px] hover:bg-[#F8FAFC] transition-colors">
              <span className="h-8 w-8 rounded-[10px] bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center ring-1 ring-[#DBEAFE]">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate font-bold text-[#0F172A]">{f.file.name}</span>
              <StatusBadge s={f.status} />
            </div>
          ))}
        </div>
      </ModrekCard>

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

function fmtEta(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}د ${rem}ث`;
  const h = Math.floor(m / 60);
  return `${h}س ${m % 60}د`;
}
