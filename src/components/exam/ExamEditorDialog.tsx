import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion, QuestionType } from "./types";
import {
  Plus, Trash2, Save, Send, Loader2, Clock, FileText,
  BookOpen, Sparkles, CheckCircle2, ChevronLeft, ChevronRight,
  CircleDot, ToggleLeft, FileEdit, Hash, Award, Eye,
  ImagePlus, Upload, ListChecks, X, Check, PencilLine,
  Settings2, ClipboardCheck, Wand2, Image as ImageIcon,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  editingExam: ExamRow | null;
  initialQuestions: ExamQuestion[];
  isAiGenerated: boolean;
  onSuccess: () => void;
  groupId?: string;
  currentTerm?: string;
  subjectName?: string;
};

const emptyQuestion = (type: QuestionType = "mcq"): ExamQuestion => ({
  question: "",
  type,
  options: type === "mcq" ? ["", "", "", ""] : type === "true_false" ? ["صح", "خطأ"] : [],
  correct_answer: "",
  model_answer: "",
  points: 1,
});

// ===== Type theming - clean modern palette =====
const TYPE_THEME: Record<QuestionType, {
  label: string;
  short: string;
  icon: React.ReactNode;
  // tone tokens
  ring: string;
  bg: string;
  bgSoft: string;
  text: string;
  border: string;
  borderStrong: string;
  bar: string;
  iconBg: string;
  solid: string;
  hoverSolid: string;
}> = {
  mcq: {
    label: "اختيار من متعدد",
    short: "اختيار",
    icon: <CircleDot className="h-4 w-4" />,
    ring: "ring-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    bgSoft: "bg-sky-50/60",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200 dark:border-sky-800",
    borderStrong: "border-sky-400",
    bar: "bg-sky-500",
    iconBg: "bg-sky-100 text-sky-600",
    solid: "bg-sky-600",
    hoverSolid: "hover:bg-sky-700",
  },
  true_false: {
    label: "صح أو خطأ",
    short: "صح/خطأ",
    icon: <ToggleLeft className="h-4 w-4" />,
    ring: "ring-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    bgSoft: "bg-amber-50/60",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    borderStrong: "border-amber-400",
    bar: "bg-amber-500",
    iconBg: "bg-amber-100 text-amber-600",
    solid: "bg-amber-600",
    hoverSolid: "hover:bg-amber-700",
  },
  essay: {
    label: "سؤال مقالي",
    short: "مقالي",
    icon: <FileEdit className="h-4 w-4" />,
    ring: "ring-violet-300",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    bgSoft: "bg-violet-50/60",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-800",
    borderStrong: "border-violet-400",
    bar: "bg-violet-500",
    iconBg: "bg-violet-100 text-violet-600",
    solid: "bg-violet-600",
    hoverSolid: "hover:bg-violet-700",
  },
};

// ===== Wizard steps =====
type StepId = "info" | "method" | "questions" | "settings" | "review";
const STEPS: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "info", label: "المعلومات", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "method", label: "الطريقة", icon: <Wand2 className="h-3.5 w-3.5" /> },
  { id: "questions", label: "الأسئلة", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { id: "settings", label: "الإعدادات", icon: <Settings2 className="h-3.5 w-3.5" /> },
  { id: "review", label: "المراجعة", icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
];

const ExamEditorDialog = ({
  open, onOpenChange, subjectId, editingExam, initialQuestions, isAiGenerated, onSuccess, groupId, currentTerm, subjectName,
}: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  // ===== Form state =====
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [passingScore, setPassingScore] = useState("60");
  const [difficulty, setDifficulty] = useState("متوسط");
  const [showResults, setShowResults] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState("1");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  // ===== Wizard / method =====
  const [step, setStep] = useState<StepId>("info");
  const [method, setMethod] = useState<"manual" | "image" | "ai" | null>(null);

  // ===== AI / OCR state =====
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMcqCount, setAiMcqCount] = useState("5");
  const [aiTfCount, setAiTfCount] = useState("3");
  const [aiEssayCount, setAiEssayCount] = useState("2");
  const [aiDifficulty, setAiDifficulty] = useState("متوسط");
  const [aiImageFiles, setAiImageFiles] = useState<File[]>([]);
  const [aiImagePreviews, setAiImagePreviews] = useState<string[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);

  // ===== Reset on open =====
  useEffect(() => {
    if (open) {
      if (editingExam) {
        setTitle(editingExam.title);
        setDescription(editingExam.description || "");
        setDuration(String(editingExam.duration_minutes || 30));
        setStartAt(editingExam.start_at ? editingExam.start_at.slice(0, 16) : "");
        setEndAt(editingExam.end_at ? editingExam.end_at.slice(0, 16) : "");
        setQuestions(editingExam.questions?.map(q => ({ ...q, type: q.type || "mcq", points: q.points || 1 })) || []);
        setMethod("manual");
        setStep("questions");
      } else {
        setTitle("");
        setDescription("");
        setDuration("30");
        setPassingScore("60");
        setDifficulty("متوسط");
        setShowResults(true);
        setShuffleQuestions(false);
        setMaxAttempts("1");
        setStartAt("");
        setEndAt("");
        setMethod(null);
        setStep("info");
        setQuestions(initialQuestions.length > 0 ? initialQuestions.map(q => ({ ...q, type: q.type || "mcq", points: q.points || 1 })) : []);
        if (initialQuestions.length > 0) {
          setMethod("manual");
          setStep("questions");
        }
      }
    }
  }, [open, editingExam, initialQuestions]);

  // ===== Question helpers =====
  const updateQuestion = (index: number, field: keyof ExamQuestion, value: any) => {
    setQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const changeQuestionType = (index: number, newType: QuestionType) => {
    setQuestions(prev => {
      const updated = [...prev];
      const q = updated[index];
      updated[index] = {
        ...q,
        type: newType,
        options: newType === "mcq" ? ["", "", "", ""] : newType === "true_false" ? ["صح", "خطأ"] : [],
        correct_answer: newType === "essay" ? "" : q.correct_answer,
        model_answer: newType === "essay" ? (q.model_answer || "") : "",
      };
      return updated;
    });
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions(prev => {
      const updated = [...prev];
      const opts = [...updated[qIndex].options];
      const oldOpt = opts[oIndex];
      opts[oIndex] = value;
      updated[qIndex] = {
        ...updated[qIndex],
        options: opts,
        correct_answer: updated[qIndex].correct_answer === oldOpt ? value : updated[qIndex].correct_answer,
      };
      return updated;
    });
  };

  const addQuestion = (type: QuestionType) => {
    setQuestions(prev => [...prev, emptyQuestion(type)]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  // ===== Validation =====
  const validate = (): boolean => {
    if (!title.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال عنوان الامتحان", variant: "destructive" });
      setStep("info");
      return false;
    }
    if (questions.length === 0) {
      toast({ title: "خطأ", description: "أضف سؤالاً واحداً على الأقل", variant: "destructive" });
      setStep("questions");
      return false;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} فارغ`, variant: "destructive" });
        setStep("questions");
        return false;
      }
      if (q.type === "mcq" && q.options.filter(o => o.trim()).length < 2) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} يحتاج على الأقل خيارين`, variant: "destructive" });
        setStep("questions");
        return false;
      }
      if (q.type !== "essay" && !q.correct_answer?.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} بدون إجابة صحيحة`, variant: "destructive" });
        setStep("questions");
        return false;
      }
      if (q.type === "essay" && !q.model_answer?.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} بدون نموذج إجابة`, variant: "destructive" });
        setStep("questions");
        return false;
      }
    }
    return true;
  };

  // ===== Save =====
  const handleSave = async (publish: boolean) => {
    if (!validate()) return;
    if (!user) return;
    setSaving(true);
    try {
      const cleanQuestions = questions.map(q => ({
        question: q.question.trim(),
        type: q.type || "mcq",
        options: q.type === "essay" ? [] : q.options.filter(o => o.trim()),
        correct_answer: q.type === "essay" ? "" : q.correct_answer.trim(),
        model_answer: q.type === "essay" ? (q.model_answer || "").trim() : "",
        points: q.points || 1,
      }));

      const payload: any = {
        subject_id: subjectId,
        title: title.trim(),
        description: description.trim() || null,
        questions: cleanQuestions,
        duration_minutes: parseInt(duration),
        start_at: startAt || null,
        end_at: endAt || null,
        is_published: publish,
        is_ai_generated: isAiGenerated || method === "ai",
        created_by: user.id,
        group_id: groupId || null,
        term: currentTerm || editingExam?.term || "term1",
      };

      if (editingExam) {
        const { error } = await supabase.from("exams" as any).update(payload).eq("id", editingExam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exams" as any).insert(payload);
        if (error) throw error;
      }

      if (publish && !editingExam) {
        try {
          await supabase.functions.invoke("send-content-notification", {
            body: { teacherId: user.id, subjectId, contentType: "exam", contentTitle: title.trim() },
          });
        } catch (notifErr) {
          console.error("Notification error:", notifErr);
        }
      }

      toast({ title: "تم ✓", description: publish ? "تم نشر الامتحان بنجاح" : "تم حفظ الامتحان كمسودة" });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حفظ الامتحان", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ===== Image / OCR =====
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setAiImageFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAiImagePreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setAiImageFiles(prev => prev.filter((_, i) => i !== index));
    setAiImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageOcr = async () => {
    if (aiImageFiles.length === 0) {
      toast({ title: "خطأ", description: "يرجى رفع صورة الامتحان أولاً", variant: "destructive" });
      return;
    }
    setOcrLoading(true);
    try {
      const file = aiImageFiles[0];
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const chunkSize = 8192;
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
      }
      const base64 = btoa(binary);

      const response = await supabase.functions.invoke("generate-exam", {
        body: { subjectName: subjectName || "المادة", lessonTitle: aiPrompt || "", imageBase64: base64 },
      });

      if (response.error) throw new Error(response.error.message);

      let data = response.data;
      if (typeof data === "string") data = JSON.parse(data);
      if (!data?.questions?.length) throw new Error("لم يتم استخراج أسئلة من الصورة");

      const ocrQuestions = data.questions.map((q: any) => ({
        ...q,
        type: q.type || "mcq",
        points: q.points || 1,
        options: q.options || [],
        correct_answer: q.correct_answer || "",
        model_answer: q.model_answer || "",
      }));

      setQuestions(prev => [...prev, ...ocrQuestions]);
      setAiImageFiles([]);
      setAiImagePreviews([]);
      setStep("questions");
      toast({ title: "📸 تم الاستخراج", description: `تم استخراج ${ocrQuestions.length} سؤال - راجع الإجابات` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: e.message || "فشل استخراج الأسئلة", variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const totalCount = parseInt(aiMcqCount) + parseInt(aiTfCount) + parseInt(aiEssayCount);
      if (totalCount === 0) {
        toast({ title: "خطأ", description: "اختر عدد الأسئلة أولاً", variant: "destructive" });
        return;
      }
      const response = await supabase.functions.invoke("generate-exam", {
        body: {
          subjectName: subjectName || "المادة",
          lessonTitle: aiPrompt || subjectName || "المادة",
          lessonText: aiPrompt,
          questionCount: totalCount,
          difficulty: aiDifficulty,
          mcqCount: parseInt(aiMcqCount),
          tfCount: parseInt(aiTfCount),
          essayCount: parseInt(aiEssayCount),
        },
      });

      if (response.error) throw new Error(response.error.message);

      let data = response.data;
      if (typeof data === "string") data = JSON.parse(data);
      if (!data?.questions?.length) throw new Error("لم يتم استلام أسئلة");

      const aiQuestions = data.questions.map((q: any) => ({
        ...q,
        type: q.type || "mcq",
        points: q.points || 1,
        options: q.options || [],
        correct_answer: q.correct_answer || "",
        model_answer: q.model_answer || "",
      }));

      setQuestions(prev => [...prev, ...aiQuestions]);
      setStep("questions");
      toast({ title: "✨ تم التوليد", description: `تم إضافة ${aiQuestions.length} سؤال` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: e.message || "فشل توليد الأسئلة", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  // ===== Computed =====
  const totalPoints = useMemo(() => questions.reduce((s, q) => s + (q.points || 1), 0), [questions]);
  const counts = useMemo(() => ({
    mcq: questions.filter(q => q.type === "mcq").length,
    tf: questions.filter(q => q.type === "true_false").length,
    essay: questions.filter(q => q.type === "essay").length,
  }), [questions]);

  // ===== Step navigation =====
  const stepIndex = STEPS.findIndex(s => s.id === step);
  const canGoNext = (): boolean => {
    if (step === "info") return title.trim().length > 0;
    if (step === "method") return method !== null;
    if (step === "questions") return questions.length > 0;
    return true;
  };
  const goNext = () => {
    if (!canGoNext()) {
      if (step === "info") toast({ title: "تنبيه", description: "أدخل عنوان الامتحان للمتابعة", variant: "destructive" });
      else if (step === "method") toast({ title: "تنبيه", description: "اختر طريقة الإنشاء للمتابعة", variant: "destructive" });
      else if (step === "questions") toast({ title: "تنبيه", description: "أضف سؤالاً واحداً على الأقل", variant: "destructive" });
      return;
    }
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1].id);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-3xl w-[calc(100vw-0.75rem)] sm:w-[calc(100vw-3rem)] max-h-[96vh] overflow-hidden flex flex-col bg-slate-50 dark:bg-background"
        dir="rtl"
      >
        {/* ============ Header ============ */}
        <div className="shrink-0 bg-white dark:bg-card border-b">
          <DialogHeader className="px-4 sm:px-6 pt-4 pb-3">
            <DialogTitle className="flex items-center gap-3 text-base sm:text-lg">
              <div className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)", boxShadow: "0 6px 16px rgba(139,92,246,0.35)" }}>
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-black truncate">{editingExam ? "تعديل الامتحان" : "إنشاء امتحان جديد"}</span>
                {subjectName && <span className="text-[11px] text-muted-foreground font-normal truncate">{subjectName}</span>}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="px-3 sm:px-6 pb-3">
            <Stepper steps={STEPS} currentIndex={stepIndex} onJump={(i) => {
              // allow jumping back freely
              if (i <= stepIndex) setStep(STEPS[i].id);
            }} />
          </div>
        </div>

        {/* ============ Body (scrollable) ============ */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-3 sm:px-6 py-4 space-y-4">

            {/* ============ STEP: INFO ============ */}
            {step === "info" && (
              <Card className="border-2 shadow-sm">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  <SectionHeader
                    icon={<FileText className="h-4 w-4" />}
                    title="معلومات الامتحان"
                    desc="ابدأ بكتابة العنوان ووصف مختصر"
                    color="violet"
                  />

                  <div className="space-y-2">
                    <Label className="text-xs font-bold flex items-center gap-1">
                      عنوان الامتحان <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="مثال: امتحان نهاية الفصل الأول"
                      className="h-12 text-base font-semibold border-2 focus-visible:border-violet-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">وصف الامتحان (اختياري)</Label>
                    <Textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="اكتب وصفاً مختصراً عن الامتحان أو أهدافه..."
                      rows={3}
                      className="resize-none text-sm border-2"
                      dir="rtl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold flex items-center gap-1">
                        <Clock className="h-3 w-3 text-violet-500" /> المدة
                      </Label>
                      <div className="flex items-center gap-2 rounded-xl border-2 bg-card px-3 h-12">
                        <Input
                          type="number"
                          value={duration}
                          onChange={e => setDuration(e.target.value)}
                          min="1"
                          className="h-8 border-0 bg-transparent p-0 font-black text-lg shadow-none focus-visible:ring-0"
                        />
                        <span className="text-xs text-muted-foreground">دقيقة</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold flex items-center gap-1">
                        <Award className="h-3 w-3 text-amber-500" /> درجة النجاح
                      </Label>
                      <div className="flex items-center gap-2 rounded-xl border-2 bg-card px-3 h-12">
                        <Input
                          type="number"
                          value={passingScore}
                          onChange={e => setPassingScore(e.target.value)}
                          min="1" max="100"
                          className="h-8 border-0 bg-transparent p-0 font-black text-lg shadow-none focus-visible:ring-0"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============ STEP: METHOD ============ */}
            {step === "method" && (
              <div className="space-y-3">
                <SectionHeader
                  icon={<Wand2 className="h-4 w-4" />}
                  title="اختر طريقة إنشاء الأسئلة"
                  desc="يمكنك تغيير الطريقة لاحقاً وإضافة المزيد"
                  color="violet"
                />

                <MethodCard
                  selected={method === "manual"}
                  onClick={() => { setMethod("manual"); }}
                  color="violet"
                  icon={<PencilLine className="h-6 w-6" />}
                  title="إنشاء يدوي"
                  desc="أضف الأسئلة بنفسك وتحكم كامل في كل تفاصيل الامتحان"
                  cta="إنشاء يدوي"
                />

                <MethodCard
                  selected={method === "image"}
                  onClick={() => { setMethod("image"); }}
                  color="sky"
                  icon={<ImageIcon className="h-6 w-6" />}
                  title="رفع صورة لامتحان أو صفحة"
                  desc="ارفع صورة لامتحان أو صفحة والمساعد الذكي سيستخرج الأسئلة منها"
                  cta="رفع صورة"
                />

                <MethodCard
                  selected={method === "ai"}
                  onClick={() => { setMethod("ai"); }}
                  color="emerald"
                  icon={<Sparkles className="h-6 w-6" />}
                  title="كتابة وصف أو شرح الدرس"
                  desc="اكتب وصفاً للدرس والمساعد الذكي سيقوم بإنشاء أسئلة مناسبة"
                  cta="استخدم الذكاء الاصطناعي"
                />
              </div>
            )}

            {/* ============ STEP: QUESTIONS ============ */}
            {step === "questions" && (
              <>
                {/* If method is image or ai and no questions yet, show that flow */}
                {method === "image" && questions.length === 0 && (
                  <ImageMethodPanel
                    aiImagePreviews={aiImagePreviews}
                    handleImageUpload={handleImageUpload}
                    removeImage={removeImage}
                    handleImageOcr={handleImageOcr}
                    ocrLoading={ocrLoading}
                  />
                )}

                {method === "ai" && questions.length === 0 && (
                  <AiMethodPanel
                    aiPrompt={aiPrompt} setAiPrompt={setAiPrompt}
                    aiMcqCount={aiMcqCount} setAiMcqCount={setAiMcqCount}
                    aiTfCount={aiTfCount} setAiTfCount={setAiTfCount}
                    aiEssayCount={aiEssayCount} setAiEssayCount={setAiEssayCount}
                    aiDifficulty={aiDifficulty} setAiDifficulty={setAiDifficulty}
                    aiLoading={aiLoading}
                    onGenerate={handleAiGenerate}
                  />
                )}

                {/* Manual or after generation - show question list + add buttons */}
                {(method === "manual" || questions.length > 0) && (
                  <>
                    <SectionHeader
                      icon={<ListChecks className="h-4 w-4" />}
                      title="الأسئلة"
                      desc={`إجمالي ${questions.length} سؤال • ${totalPoints} نقطة`}
                      color="violet"
                    />

                    {/* Add question quick row */}
                    <Card className="border-2 border-dashed">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-[11px] font-bold text-muted-foreground text-center">إضافة سؤال جديد</p>
                        <div className="grid grid-cols-3 gap-2">
                          {(["mcq", "true_false", "essay"] as QuestionType[]).map(type => {
                            const theme = TYPE_THEME[type];
                            return (
                              <button
                                key={type}
                                onClick={() => addQuestion(type)}
                                className={`group flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border-2 ${theme.border} ${theme.bg} hover:scale-[1.02] active:scale-[0.98] transition-all`}
                              >
                                <div className={`h-9 w-9 rounded-xl ${theme.iconBg} flex items-center justify-center`}>
                                  {theme.icon}
                                </div>
                                <span className={`text-[11px] font-black ${theme.text} text-center leading-tight`}>{theme.short}</span>
                              </button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Empty state */}
                    {questions.length === 0 && (
                      <div className="text-center py-10 space-y-3 border-2 border-dashed rounded-2xl bg-white dark:bg-card">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-violet-600" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">ابدأ بإضافة الأسئلة</p>
                          <p className="text-xs text-muted-foreground mt-1">اختر نوع السؤال من الأعلى</p>
                        </div>
                      </div>
                    )}

                    {/* Questions list */}
                    <div className="space-y-3">
                      {questions.map((q, qi) => (
                        <QuestionCard
                          key={qi}
                          q={q}
                          qi={qi}
                          updateQuestion={updateQuestion}
                          changeQuestionType={changeQuestionType}
                          updateOption={updateOption}
                          removeQuestion={removeQuestion}
                        />
                      ))}
                    </div>

                    {/* Add more methods - quick switch */}
                    {questions.length > 0 && (
                      <Card className="border bg-violet-50/40 dark:bg-violet-950/10">
                        <CardContent className="p-3 grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="h-10 gap-1.5 text-xs font-bold border-sky-300 text-sky-700 hover:bg-sky-50"
                            onClick={() => { setMethod("image"); setQuestions([]); }}
                          >
                            <ImageIcon className="h-3.5 w-3.5" /> استخراج من صورة
                          </Button>
                          <Button
                            variant="outline"
                            className="h-10 gap-1.5 text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => { setMethod("ai"); setQuestions([]); }}
                          >
                            <Sparkles className="h-3.5 w-3.5" /> توليد بالذكاء
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </>
            )}

            {/* ============ STEP: SETTINGS ============ */}
            {step === "settings" && (
              <Card className="border-2 shadow-sm">
                <CardContent className="p-4 sm:p-5 space-y-5">
                  <SectionHeader
                    icon={<Settings2 className="h-4 w-4" />}
                    title="إعدادات الامتحان"
                    desc="ضبط طريقة العرض والمحاولات"
                    color="violet"
                  />

                  {/* Schedule */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-violet-500" /> جدولة الامتحان (اختياري)
                    </Label>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">يبدأ في</Label>
                        <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="h-11 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">ينتهي في</Label>
                        <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="h-11 text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold">عدد المحاولات</Label>
                      <Select value={maxAttempts} onValueChange={setMaxAttempts}>
                        <SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">محاولة واحدة</SelectItem>
                          <SelectItem value="2">محاولتان</SelectItem>
                          <SelectItem value="3">3 محاولات</SelectItem>
                          <SelectItem value="999">غير محدود</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold">مستوى الصعوبة</Label>
                      <Select value={difficulty} onValueChange={setDifficulty}>
                        <SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="سهل">🟢 سهل</SelectItem>
                          <SelectItem value="متوسط">🟡 متوسط</SelectItem>
                          <SelectItem value="صعب">🔴 صعب</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Toggles */}
                  <ToggleRow
                    label="إظهار النتائج للطلاب"
                    desc="يتمكن الطلاب من رؤية نتائجهم بعد الانتهاء"
                    checked={showResults}
                    onChange={setShowResults}
                  />
                  <ToggleRow
                    label="ترتيب الأسئلة عشوائياً"
                    desc="عرض الأسئلة بترتيب مختلف لكل طالب"
                    checked={shuffleQuestions}
                    onChange={setShuffleQuestions}
                  />
                </CardContent>
              </Card>
            )}

            {/* ============ STEP: REVIEW ============ */}
            {step === "review" && (
              <ReviewPanel
                title={title}
                description={description}
                subjectName={subjectName}
                duration={duration}
                passingScore={passingScore}
                difficulty={difficulty}
                counts={counts}
                totalPoints={totalPoints}
                questionsCount={questions.length}
                startAt={startAt}
                endAt={endAt}
                maxAttempts={maxAttempts}
                showResults={showResults}
                shuffleQuestions={shuffleQuestions}
              />
            )}
          </div>
        </div>

        {/* ============ Footer Navigation ============ */}
        <div className="shrink-0 bg-white dark:bg-card border-t px-3 sm:px-6 py-3 space-y-2">
          {/* Mini summary */}
          {questions.length > 0 && step !== "review" && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {questions.length} سؤال</span>
              <span className="flex items-center gap-1"><Award className="h-3 w-3" /> {totalPoints} نقطة</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {duration} د</span>
            </div>
          )}

          {step !== "review" ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 px-3 font-bold"
                onClick={goBack}
                disabled={stepIndex === 0}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="hidden sm:inline">السابق</span>
              </Button>
              <Button
                className="flex-1 h-11 font-black gap-1 text-white shadow-lg"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)", boxShadow: "0 6px 16px rgba(139,92,246,0.35)" }}
                onClick={goNext}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2 h-11 font-bold"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ كمسودة
              </Button>
              <Button
                className="flex-1 gap-2 h-11 font-black text-white shadow-lg"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)", boxShadow: "0 6px 16px rgba(139,92,246,0.35)" }}
                onClick={() => handleSave(true)}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                حفظ ونشر الامتحان
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ====================================================================
// Stepper
// ====================================================================
const Stepper = ({ steps, currentIndex, onJump }: {
  steps: { id: StepId; label: string; icon: React.ReactNode }[];
  currentIndex: number;
  onJump: (index: number) => void;
}) => {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-1 px-1">
      {steps.map((s, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        return (
          <div key={s.id} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onJump(i)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                active
                  ? "text-white shadow-md"
                  : done
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                  : "bg-muted text-muted-foreground"
              }`}
              style={active ? { background: "linear-gradient(135deg,#8b5cf6,#6366f1)" } : undefined}
            >
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                active ? "bg-white/25" : done ? "bg-violet-200 dark:bg-violet-900" : "bg-card"
              }`}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-3 rounded-full ${done ? "bg-violet-400" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ====================================================================
// Section header
// ====================================================================
const SectionHeader = ({ icon, title, desc, color = "violet" }: {
  icon: React.ReactNode; title: string; desc?: string; color?: "violet" | "sky" | "emerald";
}) => {
  const palette = {
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300",
    sky: "bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
  }[color];
  return (
    <div className="flex items-center gap-2.5">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${palette}`}>{icon}</div>
      <div className="min-w-0">
        <h3 className="font-black text-sm">{title}</h3>
        {desc && <p className="text-[11px] text-muted-foreground truncate">{desc}</p>}
      </div>
    </div>
  );
};

// ====================================================================
// Method card
// ====================================================================
const MethodCard = ({ selected, onClick, color, icon, title, desc, cta }: {
  selected: boolean;
  onClick: () => void;
  color: "violet" | "sky" | "emerald";
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
}) => {
  const palette = {
    violet: { ring: "ring-violet-500", border: "border-violet-300", bg: "bg-violet-50 dark:bg-violet-950/20", iconBg: "bg-violet-100 text-violet-600", btn: "linear-gradient(135deg,#8b5cf6,#6366f1)" },
    sky: { ring: "ring-sky-500", border: "border-sky-300", bg: "bg-sky-50 dark:bg-sky-950/20", iconBg: "bg-sky-100 text-sky-600", btn: "linear-gradient(135deg,#38bdf8,#3b82f6)" },
    emerald: { ring: "ring-emerald-500", border: "border-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/20", iconBg: "bg-emerald-100 text-emerald-600", btn: "linear-gradient(135deg,#34d399,#10b981)" },
  }[color];

  return (
    <button
      onClick={onClick}
      className={`w-full text-right rounded-2xl border-2 p-4 transition-all bg-white dark:bg-card ${
        selected ? `${palette.ring} ring-4 ring-offset-2 ring-offset-slate-50 dark:ring-offset-background ${palette.border}` : `${palette.border} hover:scale-[1.01]`
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${palette.iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-black text-sm mb-1">{title}</h4>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
        </div>
        {selected && (
          <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-white"
            style={{ background: palette.btn }}>
            <Check className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <div
        className="mt-3 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold"
        style={{ background: palette.btn }}
      >
        {cta}
      </div>
    </button>
  );
};

// ====================================================================
// Toggle row
// ====================================================================
const ToggleRow = ({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-all shrink-0 ${
        checked ? "bg-violet-500" : "bg-muted-foreground/30"
      }`}
    >
      <div
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-all ${
          checked ? "right-0.5" : "right-[22px]"
        }`}
      />
    </button>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-xs">{label}</p>
      <p className="text-[10px] text-muted-foreground">{desc}</p>
    </div>
  </div>
);

// ====================================================================
// Image method panel
// ====================================================================
const ImageMethodPanel = ({ aiImagePreviews, handleImageUpload, removeImage, handleImageOcr, ocrLoading }: any) => (
  <Card className="border-2 border-sky-200 dark:border-sky-800 bg-gradient-to-br from-sky-50/60 to-white dark:from-sky-950/20 dark:to-card">
    <CardContent className="p-4 sm:p-5 space-y-4">
      <SectionHeader
        icon={<ImagePlus className="h-4 w-4" />}
        title="استخراج الأسئلة من صورة"
        desc="ارفع صورة امتحان والمساعد يستخرج الأسئلة"
        color="sky"
      />

      <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" id="exam-image-upload" />
      <label
        htmlFor="exam-image-upload"
        className="cursor-pointer block border-2 border-dashed border-sky-300 dark:border-sky-700 rounded-2xl p-6 text-center hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors bg-white dark:bg-card"
      >
        <div className="h-14 w-14 mx-auto rounded-2xl bg-sky-100 flex items-center justify-center mb-3">
          <Upload className="h-7 w-7 text-sky-600" />
        </div>
        <p className="font-bold text-sm">اضغط لرفع صورة الامتحان</p>
        <p className="text-[11px] text-muted-foreground mt-1">JPG, PNG, WEBP</p>
      </label>

      {aiImagePreviews.length > 0 && (
        <>
          <div className="flex gap-2 flex-wrap">
            {aiImagePreviews.map((preview: string, idx: number) => (
              <div key={idx} className="relative">
                <img src={preview} alt={`صورة ${idx + 1}`} className="w-20 h-20 object-cover rounded-xl border-2 border-sky-200" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            onClick={handleImageOcr}
            disabled={ocrLoading}
            className="w-full gap-2 h-12 text-white font-black"
            style={{ background: "linear-gradient(135deg,#38bdf8,#3b82f6)", boxShadow: "0 6px 16px rgba(56,189,248,0.35)" }}
          >
            {ocrLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الاستخراج...</> : <><Sparkles className="h-4 w-4" /> استخراج الأسئلة الآن</>}
          </Button>
        </>
      )}
    </CardContent>
  </Card>
);

// ====================================================================
// AI method panel
// ====================================================================
const AiMethodPanel = ({
  aiPrompt, setAiPrompt, aiMcqCount, setAiMcqCount, aiTfCount, setAiTfCount,
  aiEssayCount, setAiEssayCount, aiDifficulty, setAiDifficulty, aiLoading, onGenerate,
}: any) => (
  <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-card">
    <CardContent className="p-4 sm:p-5 space-y-4">
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="توليد ذكي بالذكاء الاصطناعي"
        desc="اكتب وصف الدرس وحدد الأسئلة"
        color="emerald"
      />

      {/* counts grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { type: "mcq" as QuestionType, value: aiMcqCount, set: setAiMcqCount, opts: [0,1,2,3,5,7,10] },
          { type: "true_false" as QuestionType, value: aiTfCount, set: setAiTfCount, opts: [0,1,2,3,5,7,10] },
          { type: "essay" as QuestionType, value: aiEssayCount, set: setAiEssayCount, opts: [0,1,2,3,5] },
        ].map(({ type, value, set, opts }) => (
          <div key={type} className="space-y-1.5">
            <Label className={`text-[11px] font-bold flex items-center gap-1 ${TYPE_THEME[type].text}`}>
              {TYPE_THEME[type].icon}
              <span className="truncate">{TYPE_THEME[type].short}</span>
            </Label>
            <Select value={value} onValueChange={set}>
              <SelectTrigger className="h-11 font-black"><SelectValue /></SelectTrigger>
              <SelectContent>
                {opts.map((n: number) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold">مستوى الصعوبة</Label>
        <Select value={aiDifficulty} onValueChange={setAiDifficulty}>
          <SelectTrigger className="h-11 font-bold"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="سهل">🟢 سهل</SelectItem>
            <SelectItem value="متوسط">🟡 متوسط</SelectItem>
            <SelectItem value="صعب">🔴 صعب</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold">وصف الامتحان أو نص الدرس</Label>
        <Textarea
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          placeholder="مثال: امتحان على درس الفاعل والمفعول به للصف الثالث الثانوي..."
          rows={4}
          className="resize-none text-sm border-2"
          dir="rtl"
        />
      </div>

      <Button
        onClick={onGenerate}
        disabled={aiLoading}
        className="w-full gap-2 h-12 text-white font-black"
        style={{ background: "linear-gradient(135deg,#34d399,#10b981)", boxShadow: "0 6px 16px rgba(52,211,153,0.35)" }}
      >
        {aiLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري التوليد...</> : <><Sparkles className="h-4 w-4" /> توليد الأسئلة الآن</>}
      </Button>
    </CardContent>
  </Card>
);

// ====================================================================
// Review panel
// ====================================================================
const ReviewPanel = ({
  title, description, subjectName, duration, passingScore, difficulty,
  counts, totalPoints, questionsCount, startAt, endAt, maxAttempts, showResults, shuffleQuestions,
}: any) => (
  <div className="space-y-3">
    <SectionHeader
      icon={<ClipboardCheck className="h-4 w-4" />}
      title="مراجعة الامتحان"
      desc="تأكد من جميع البيانات قبل النشر"
      color="violet"
    />

    {/* Hero summary */}
    <Card className="overflow-hidden border-2 border-violet-200 dark:border-violet-800">
      <div className="h-2" style={{ background: "linear-gradient(90deg,#8b5cf6,#6366f1)" }} />
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-[11px] font-bold text-violet-600 mb-1">عنوان الامتحان</p>
          <h3 className="font-black text-base">{title || "—"}</h3>
          {subjectName && <p className="text-xs text-muted-foreground mt-0.5">{subjectName}</p>}
        </div>
        {description && (
          <div>
            <p className="text-[11px] font-bold text-violet-600 mb-1">الوصف</p>
            <p className="text-xs text-foreground leading-relaxed">{description}</p>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Stats grid */}
    <div className="grid grid-cols-2 gap-2">
      <StatBox icon={<Hash className="h-4 w-4" />} label="عدد الأسئلة" value={String(questionsCount)} color="violet" />
      <StatBox icon={<Award className="h-4 w-4" />} label="الدرجة الكلية" value={String(totalPoints)} color="amber" />
      <StatBox icon={<Clock className="h-4 w-4" />} label="المدة" value={`${duration} د`} color="sky" />
      <StatBox icon={<CheckCircle2 className="h-4 w-4" />} label="درجة النجاح" value={`${passingScore}%`} color="emerald" />
    </div>

    {/* Question types breakdown */}
    <Card className="border-2">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-black">توزيع الأسئلة</p>
        {[
          { key: "mcq", label: "اختيار من متعدد", count: counts.mcq, type: "mcq" as QuestionType },
          { key: "tf", label: "صح أو خطأ", count: counts.tf, type: "true_false" as QuestionType },
          { key: "essay", label: "مقالي", count: counts.essay, type: "essay" as QuestionType },
        ].map(({ key, label, count, type }) => {
          const theme = TYPE_THEME[type];
          const pct = questionsCount > 0 ? (count / questionsCount) * 100 : 0;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={`flex items-center gap-1.5 font-bold ${theme.text}`}>
                  {theme.icon} {label}
                </span>
                <span className="font-black">{count}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${theme.bar} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>

    {/* Settings summary */}
    <Card className="border-2">
      <CardContent className="p-4 space-y-2">
        <p className="text-xs font-black mb-2">الإعدادات</p>
        <SettingRow label="مستوى الصعوبة" value={difficulty} />
        <SettingRow label="عدد المحاولات" value={maxAttempts === "999" ? "غير محدود" : `${maxAttempts}`} />
        <SettingRow label="إظهار النتائج" value={showResults ? "مفعّل" : "معطّل"} />
        <SettingRow label="ترتيب عشوائي" value={shuffleQuestions ? "مفعّل" : "معطّل"} />
        {startAt && <SettingRow label="يبدأ في" value={new Date(startAt).toLocaleString("ar-EG")} />}
        {endAt && <SettingRow label="ينتهي في" value={new Date(endAt).toLocaleString("ar-EG")} />}
      </CardContent>
    </Card>
  </div>
);

const StatBox = ({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: "violet" | "amber" | "sky" | "emerald";
}) => {
  const palette = {
    violet: "bg-violet-100 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300",
    sky: "bg-sky-100 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300",
  }[color];
  return (
    <Card className="border-2">
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${palette}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground font-bold">{label}</p>
          <p className="text-base font-black truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-bold">{value}</span>
  </div>
);

// ====================================================================
// Question Card
// ====================================================================
type QuestionCardProps = {
  q: ExamQuestion;
  qi: number;
  updateQuestion: (i: number, field: keyof ExamQuestion, value: any) => void;
  changeQuestionType: (i: number, t: QuestionType) => void;
  updateOption: (qi: number, oi: number, v: string) => void;
  removeQuestion: (i: number) => void;
};

const QuestionCard = ({ q, qi, updateQuestion, changeQuestionType, updateOption, removeQuestion }: QuestionCardProps) => {
  const theme = TYPE_THEME[q.type];

  return (
    <Card className="overflow-hidden border-2 shadow-sm hover:shadow-md transition-all bg-white dark:bg-card">
      <div className={`h-1.5 ${theme.bar}`} />
      <CardContent className="p-3 sm:p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg ${theme.iconBg} font-black text-sm`}>
              {qi + 1}
            </span>
            <Badge variant="outline" className={`gap-1 text-[11px] ${theme.text} ${theme.border} font-bold`}>
              {theme.icon}
              <span>{theme.short}</span>
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2 h-8 border">
              <Input
                type="number"
                value={q.points || 1}
                onChange={e => updateQuestion(qi, "points", parseInt(e.target.value) || 1)}
                className="w-9 h-6 text-center text-xs font-black border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                min="1"
                max="10"
              />
              <span className="text-[10px] text-muted-foreground font-bold">نقطة</span>
            </div>
            <Select value={q.type} onValueChange={v => changeQuestionType(qi, v as QuestionType)}>
              <SelectTrigger className="w-[100px] h-8 text-[11px] font-bold"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mcq">اختيار متعدد</SelectItem>
                <SelectItem value="true_false">صح وخطأ</SelectItem>
                <SelectItem value="essay">مقالي</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 h-8 w-8"
              onClick={() => removeQuestion(qi)}
              aria-label="حذف"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Question text */}
        <Textarea
          value={q.question}
          onChange={e => updateQuestion(qi, "question", e.target.value)}
          placeholder="اكتب نص السؤال..."
          rows={2}
          className={`resize-none text-sm leading-relaxed border-2 focus-visible:${theme.borderStrong}`}
          dir="rtl"
        />

        {/* MCQ */}
        {q.type === "mcq" && (
          <div className="space-y-2">
            {q.options.map((opt, oi) => {
              const isCorrect = q.correct_answer === opt && opt.trim() !== "";
              return (
                <div
                  key={oi}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${
                    isCorrect ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-900/20" : "bg-card border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => opt.trim() && updateQuestion(qi, "correct_answer", opt)}
                    className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center font-black text-xs transition-all ${
                      isCorrect ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/30 text-muted-foreground"
                    }`}
                    aria-label="تحديد كإجابة صحيحة"
                  >
                    {isCorrect ? <CheckCircle2 className="h-4 w-4" /> : String.fromCharCode(1571 + oi)}
                  </button>
                  <Input
                    value={opt}
                    onChange={e => updateOption(qi, oi, e.target.value)}
                    placeholder={`الخيار ${oi + 1}`}
                    className="flex-1 h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                  />
                  {isCorrect && (
                    <Badge className="bg-emerald-500 text-white text-[10px] shrink-0">الإجابة الصحيحة</Badge>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground px-1">اضغط على الدائرة لاختيار الإجابة الصحيحة</p>
          </div>
        )}

        {/* True/False */}
        {q.type === "true_false" && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "صح", color: "emerald" },
              { label: "خطأ", color: "rose" },
            ].map(({ label, color }) => {
              const selected = q.correct_answer === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => updateQuestion(qi, "correct_answer", label)}
                  className={`px-4 py-3 rounded-xl border-2 font-black transition-all ${
                    selected
                      ? color === "emerald"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-900/20"
                        : "bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-900/20"
                      : "bg-card border-border hover:border-muted-foreground/40"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Essay */}
        {q.type === "essay" && (
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground font-bold">نموذج الإجابة (للتصحيح الذكي)</Label>
            <Textarea
              value={q.model_answer || ""}
              onChange={e => updateQuestion(qi, "model_answer", e.target.value)}
              placeholder="اكتب نموذج الإجابة هنا..."
              rows={3}
              className="resize-none text-sm bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 border-2"
              dir="rtl"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExamEditorDialog;
