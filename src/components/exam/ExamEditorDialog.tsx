import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion, QuestionType } from "./types";
import {
  Plus, Trash2, Save, Send, Loader2, Clock,
  BookOpen, Sparkles, CheckCircle2,
  CircleDot, ToggleLeft, FileEdit, Hash, Award,
  ImagePlus, Upload, ListChecks, X,
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

// Type theming - consistent across the editor
const TYPE_THEME: Record<QuestionType, {
  label: string;
  short: string;
  icon: React.ReactNode;
  ring: string;
  bg: string;
  text: string;
  border: string;
  bar: string;
  solid: string;
  hoverSolid: string;
}> = {
  mcq: {
    label: "اختيار من متعدد",
    short: "اختيار",
    icon: <CircleDot className="h-4 w-4" />,
    ring: "ring-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200 dark:border-sky-800",
    bar: "bg-sky-500",
    solid: "bg-sky-600",
    hoverSolid: "hover:bg-sky-700",
  },
  true_false: {
    label: "صح أو خطأ",
    short: "صح/خطأ",
    icon: <ToggleLeft className="h-4 w-4" />,
    ring: "ring-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    bar: "bg-amber-500",
    solid: "bg-amber-600",
    hoverSolid: "hover:bg-amber-700",
  },
  essay: {
    label: "سؤال مقالي",
    short: "مقالي",
    icon: <FileEdit className="h-4 w-4" />,
    ring: "ring-violet-300",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200 dark:border-violet-800",
    bar: "bg-violet-500",
    solid: "bg-violet-600",
    hoverSolid: "hover:bg-violet-700",
  },
};

const ExamEditorDialog = ({
  open, onOpenChange, subjectId, editingExam, initialQuestions, isAiGenerated, onSuccess, groupId, currentTerm, subjectName,
}: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("manual");

  // AI Chat
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMcqCount, setAiMcqCount] = useState("5");
  const [aiTfCount, setAiTfCount] = useState("3");
  const [aiEssayCount, setAiEssayCount] = useState("2");
  const [aiDifficulty, setAiDifficulty] = useState("متوسط");
  const [aiImageFiles, setAiImageFiles] = useState<File[]>([]);
  const [aiImagePreviews, setAiImagePreviews] = useState<string[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingExam) {
        setTitle(editingExam.title);
        setDuration(String(editingExam.duration_minutes || 30));
        setStartAt(editingExam.start_at ? editingExam.start_at.slice(0, 16) : "");
        setEndAt(editingExam.end_at ? editingExam.end_at.slice(0, 16) : "");
        setQuestions(editingExam.questions?.map(q => ({ ...q, type: q.type || "mcq", points: q.points || 1 })) || []);
      } else {
        setTitle("");
        setDuration("30");
        setStartAt("");
        setEndAt("");
        setQuestions(initialQuestions.length > 0 ? initialQuestions.map(q => ({ ...q, type: q.type || "mcq", points: q.points || 1 })) : []);
      }
      setActiveTab("manual");
    }
  }, [open, editingExam, initialQuestions]);

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

  const addQuestionBatch = (type: QuestionType, count: number) => {
    const newQuestions = Array.from({ length: count }, () => emptyQuestion(type));
    setQuestions(prev => [...prev, ...newQuestions]);
    toast({ title: "تمت الإضافة", description: `تم إضافة ${count} ${TYPE_THEME[type].label}` });
  };

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    if (!title.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال عنوان الامتحان", variant: "destructive" });
      return false;
    }
    if (questions.length === 0) {
      toast({ title: "خطأ", description: "أضف سؤالاً واحداً على الأقل", variant: "destructive" });
      return false;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} فارغ`, variant: "destructive" });
        return false;
      }
      if (q.type === "mcq" && q.options.filter(o => o.trim()).length < 2) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} يحتاج على الأقل خيارين`, variant: "destructive" });
        return false;
      }
      if (q.type !== "essay" && !q.correct_answer?.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} بدون إجابة صحيحة`, variant: "destructive" });
        return false;
      }
      if (q.type === "essay" && !q.model_answer?.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} بدون نموذج إجابة`, variant: "destructive" });
        return false;
      }
    }
    return true;
  };

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
        questions: cleanQuestions,
        duration_minutes: parseInt(duration),
        start_at: startAt || null,
        end_at: endAt || null,
        is_published: publish,
        is_ai_generated: isAiGenerated,
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
      setActiveTab("manual");
      setAiImageFiles([]);
      setAiImagePreviews([]);
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
      setActiveTab("manual");
      toast({ title: "✨ تم التوليد", description: `تم إضافة ${aiQuestions.length} سؤال` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: e.message || "فشل توليد الأسئلة", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
  const mcqQuestions = questions.map((q, i) => ({ q, i })).filter(x => x.q.type === "mcq");
  const tfQuestions = questions.map((q, i) => ({ q, i })).filter(x => x.q.type === "true_false");
  const essayQuestions = questions.map((q, i) => ({ q, i })).filter(x => x.q.type === "essay");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-3xl w-[calc(100vw-1rem)] sm:w-[calc(100vw-3rem)] max-h-[95vh] overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* === Sticky Header === */}
        <div className="shrink-0 border-b bg-gradient-to-l from-emerald-50/60 via-card to-card dark:from-emerald-950/30">
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-3 text-lg sm:text-xl">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold">{editingExam ? "تعديل الامتحان" : "إنشاء امتحان جديد"}</span>
                {subjectName && <span className="text-xs text-muted-foreground font-normal">{subjectName}</span>}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Quick info row */}
          <div className="px-4 sm:px-6 pb-4 space-y-3">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="عنوان الامتحان..."
              className="h-11 text-base font-semibold border-2 focus-visible:border-emerald-500"
            />

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {/* Duration */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border">
                <Clock className="h-4 w-4 text-emerald-600 shrink-0" />
                <Input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  min="1"
                  className="h-7 border-0 bg-transparent p-0 font-bold text-base shadow-none focus-visible:ring-0"
                />
                <span className="text-xs text-muted-foreground shrink-0">دقيقة</span>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-around gap-1 px-3 py-2 rounded-xl bg-muted/50 border text-xs sm:text-sm">
                <div className="flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5 text-sky-600" />
                  <span className="font-bold">{questions.length}</span>
                  <span className="text-muted-foreground hidden xs:inline">سؤال</span>
                </div>
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-bold">{totalPoints}</span>
                  <span className="text-muted-foreground hidden xs:inline">نقطة</span>
                </div>
              </div>
            </div>

            {/* Schedule (collapsible feel) */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 select-none">
                <Clock className="h-3 w-3" />
                جدولة الامتحان (اختياري)
                <span className="group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">يبدأ</Label>
                  <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="h-9 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">ينتهي</Label>
                  <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="h-9 text-xs" />
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* === Scrollable body === */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-4 sm:px-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-4 h-11 p-1 bg-muted/60">
                <TabsTrigger value="manual" className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm font-bold text-sm">
                  <ListChecks className="h-4 w-4" />
                  إنشاء يدوي
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm font-bold text-sm">
                  <Sparkles className="h-4 w-4" />
                  المساعد الذكي
                </TabsTrigger>
              </TabsList>

              {/* === Manual Tab === */}
              <TabsContent value="manual" className="space-y-4 mt-0">
                {/* Quick Add - clean grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(["mcq", "true_false", "essay"] as QuestionType[]).map(type => {
                    const theme = TYPE_THEME[type];
                    return (
                      <div key={type} className={`rounded-xl border-2 ${theme.border} ${theme.bg} p-3 space-y-2`}>
                        <div className={`flex items-center gap-2 font-bold text-sm ${theme.text}`}>
                          {theme.icon}
                          {theme.label}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[1, 3, 5].map(n => (
                            <Button
                              key={n}
                              size="sm"
                              variant="outline"
                              onClick={() => addQuestionBatch(type, n)}
                              className={`h-8 px-0 text-xs font-bold border ${theme.border} ${theme.text} hover:${theme.bg} bg-card`}
                            >
                              <Plus className="h-3 w-3" />{n}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Empty state */}
                {questions.length === 0 && (
                  <div className="text-center py-10 sm:py-14 space-y-3 border-2 border-dashed rounded-2xl bg-muted/20">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                      <BookOpen className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold">ابدأ بإضافة الأسئلة</p>
                      <p className="text-xs text-muted-foreground mt-1">استخدم الأزرار أعلاه أو المساعد الذكي</p>
                    </div>
                  </div>
                )}

                {/* Sections */}
                {[
                  { type: "mcq" as QuestionType, list: mcqQuestions },
                  { type: "true_false" as QuestionType, list: tfQuestions },
                  { type: "essay" as QuestionType, list: essayQuestions },
                ].map(({ type, list }) => list.length > 0 && (
                  <div key={type} className="space-y-2.5">
                    <div className={`flex items-center gap-2 px-2 ${TYPE_THEME[type].text}`}>
                      {TYPE_THEME[type].icon}
                      <h3 className="font-bold text-sm">{TYPE_THEME[type].label}</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">{list.length}</Badge>
                    </div>
                    {list.map(({ q, i: qi }) => (
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
                ))}
              </TabsContent>

              {/* === AI Tab === */}
              <TabsContent value="ai" className="space-y-4 mt-0">
                {/* OCR */}
                <Card className="border-2 border-sky-200 dark:border-sky-800 bg-gradient-to-br from-sky-50/60 to-white dark:from-sky-950/20 dark:to-card">
                  <CardContent className="p-4 sm:p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                        <ImagePlus className="h-5 w-5 text-sky-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm sm:text-base">استخراج من صورة</h3>
                        <p className="text-xs text-muted-foreground">ارفع صورة امتحان والمساعد يستخرج الأسئلة</p>
                      </div>
                    </div>

                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" id="exam-image-upload" />
                    <label htmlFor="exam-image-upload" className="cursor-pointer block border-2 border-dashed border-sky-300 dark:border-sky-700 rounded-xl p-5 text-center hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors">
                      <Upload className="h-8 w-8 mx-auto text-sky-600 mb-2" />
                      <p className="font-medium text-sm">اضغط لرفع صورة</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">JPG, PNG, WEBP</p>
                    </label>

                    {aiImagePreviews.length > 0 && (
                      <>
                        <div className="flex gap-2 flex-wrap">
                          {aiImagePreviews.map((preview, idx) => (
                            <div key={idx} className="relative">
                              <img src={preview} alt={`صورة ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border-2 border-sky-200" />
                              <button onClick={() => removeImage(idx)} className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <Button onClick={handleImageOcr} disabled={ocrLoading} className="w-full gap-2 h-11 bg-sky-600 hover:bg-sky-700 text-white">
                          {ocrLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الاستخراج...</> : <><Sparkles className="h-4 w-4" /> استخراج الأسئلة</>}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground font-bold px-2">أو</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Text AI */}
                <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-card">
                  <CardContent className="p-4 sm:p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <Sparkles className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm sm:text-base">توليد ذكي بالـ AI</h3>
                        <p className="text-xs text-muted-foreground">اكتب وصفاً وحدد عدد الأسئلة</p>
                      </div>
                    </div>

                    {/* counts grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { type: "mcq" as QuestionType, value: aiMcqCount, set: setAiMcqCount, opts: [0,1,2,3,5,7,10] },
                        { type: "true_false" as QuestionType, value: aiTfCount, set: setAiTfCount, opts: [0,1,2,3,5,7,10] },
                        { type: "essay" as QuestionType, value: aiEssayCount, set: setAiEssayCount, opts: [0,1,2,3,5] },
                      ].map(({ type, value, set, opts }) => (
                        <div key={type} className="space-y-1.5">
                          <Label className={`text-[11px] font-semibold flex items-center gap-1 ${TYPE_THEME[type].text}`}>
                            {TYPE_THEME[type].icon}
                            <span className="truncate">{TYPE_THEME[type].short}</span>
                          </Label>
                          <Select value={value} onValueChange={set}>
                            <SelectTrigger className="h-10 font-bold"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {opts.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">مستوى الصعوبة</Label>
                      <Select value={aiDifficulty} onValueChange={setAiDifficulty}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="سهل">🟢 سهل</SelectItem>
                          <SelectItem value="متوسط">🟡 متوسط</SelectItem>
                          <SelectItem value="صعب">🔴 صعب</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">وصف الامتحان أو نص الدرس</Label>
                      <Textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="مثال: امتحان على درس الفاعل والمفعول به للصف الثالث الثانوي..."
                        rows={4}
                        className="resize-none text-sm"
                        dir="rtl"
                      />
                    </div>

                    <Button
                      onClick={handleAiGenerate}
                      disabled={aiLoading}
                      className="w-full gap-2 h-11 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20"
                    >
                      {aiLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري التوليد...</> : <><Sparkles className="h-4 w-4" /> توليد الأسئلة</>}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* === Sticky Footer Actions === */}
        {questions.length > 0 && (
          <div className="shrink-0 border-t bg-card px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="flex-1 gap-2 h-11 font-bold" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ كمسودة
            </Button>
            <Button
              className="flex-1 gap-2 h-11 font-bold bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20"
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              نشر الامتحان
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

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
    <Card className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
      {/* Top accent bar */}
      <div className={`h-1.5 ${theme.bar}`} />
      <CardContent className="p-3 sm:p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md ${theme.bg} ${theme.text} font-black text-xs border ${theme.border}`}>
              {qi + 1}
            </span>
            <Badge variant="outline" className={`gap-1 text-[11px] ${theme.text} ${theme.border}`}>
              {theme.icon}
              <span className="hidden xs:inline">{theme.short}</span>
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2 h-8 border">
              <Input
                type="number"
                value={q.points || 1}
                onChange={e => updateQuestion(qi, "points", parseInt(e.target.value) || 1)}
                className="w-9 h-6 text-center text-xs font-bold border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                min="1"
                max="10"
              />
              <span className="text-[10px] text-muted-foreground">نقطة</span>
            </div>
            <Select value={q.type} onValueChange={v => changeQuestionType(qi, v as QuestionType)}>
              <SelectTrigger className="w-24 sm:w-28 h-8 text-[11px] font-semibold"><SelectValue /></SelectTrigger>
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
          className="resize-none text-sm leading-relaxed border-2 focus-visible:border-emerald-500"
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
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
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
              { label: "صح", correct: true, color: "emerald" },
              { label: "خطأ", correct: false, color: "rose" },
            ].map(({ label, color }) => {
              const selected = q.correct_answer === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => updateQuestion(qi, "correct_answer", label)}
                  className={`px-4 py-3 rounded-xl border-2 font-bold transition-all ${
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
            <Label className="text-[11px] text-muted-foreground font-semibold">نموذج الإجابة (للتصحيح الذكي)</Label>
            <Textarea
              value={q.model_answer || ""}
              onChange={e => updateQuestion(qi, "model_answer", e.target.value)}
              placeholder="اكتب نموذج الإجابة هنا..."
              rows={3}
              className="resize-none text-sm bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800"
              dir="rtl"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExamEditorDialog;
