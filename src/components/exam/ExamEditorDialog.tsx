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
  BookOpen, Sparkles, CheckCircle,
  CircleDot, ToggleLeft, FileEdit, Hash, Award,
  ImagePlus, Upload,
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

const ExamEditorDialog = ({
  open, onOpenChange, subjectId, editingExam, initialQuestions, isAiGenerated, onSuccess, groupId, subjectName,
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
    toast({ title: "تمت الإضافة", description: `تم إضافة ${count} ${typeLabel(type)}` });
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
      };

      if (editingExam) {
        const { error } = await supabase.from("exams" as any).update(payload).eq("id", editingExam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exams" as any).insert(payload);
        if (error) throw error;
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
      // Process first image (can be extended for multiple)
      const file = aiImageFiles[0];
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      const response = await supabase.functions.invoke("generate-exam", {
        body: {
          subjectName: subjectName || "المادة",
          lessonTitle: aiPrompt || "",
          imageBase64: base64,
        },
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
      toast({ title: "📸 تم الاستخراج", description: `تم استخراج ${ocrQuestions.length} سؤال من الصورة - راجع الأسئلة وعدّل الإجابات` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: e.message || "فشل استخراج الأسئلة من الصورة", variant: "destructive" });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    setAiLoading(true);
    try {
      const totalCount = parseInt(aiMcqCount) + parseInt(aiTfCount) + parseInt(aiEssayCount);
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
      toast({ title: "✨ تم التوليد", description: `تم إضافة ${aiQuestions.length} سؤال بالذكاء الاصطناعي` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: e.message || "فشل توليد الأسئلة", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const typeLabel = (t: QuestionType) => {
    if (t === "mcq") return "اختيار من متعدد";
    if (t === "true_false") return "صح وخطأ";
    return "مقالي";
  };

  const typeIcon = (t: QuestionType) => {
    if (t === "mcq") return <CircleDot className="h-4 w-4" />;
    if (t === "true_false") return <ToggleLeft className="h-4 w-4" />;
    return <FileEdit className="h-4 w-4" />;
  };

  const typeColor = (t: QuestionType) => {
    if (t === "mcq") return "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800";
    if (t === "true_false") return "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800";
    return "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800";
  };

  const typeBorderColor = (t: QuestionType) => {
    if (t === "mcq") return "border-r-blue-500";
    if (t === "true_false") return "border-r-amber-500";
    return "border-r-purple-500";
  };

  // Group questions by type for display
  const mcqQuestions = questions.map((q, i) => ({ q, i })).filter(x => x.q.type === "mcq");
  const tfQuestions = questions.map((q, i) => ({ q, i })).filter(x => x.q.type === "true_false");
  const essayQuestions = questions.map((q, i) => ({ q, i })).filter(x => x.q.type === "essay");
  const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0" dir="rtl">
        {/* Beautiful Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-l from-primary/5 via-card to-card border-b px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 rounded-xl bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              {editingExam ? "تعديل الامتحان" : "إنشاء امتحان جديد"}
            </DialogTitle>
          </DialogHeader>

          {/* Exam Info Bar */}
          <div className="grid gap-3 sm:grid-cols-4 mt-4">
            <div className="sm:col-span-2">
              <Input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="عنوان الامتحان..." className="h-10 font-semibold" />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)}
                min="1" className="h-10" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">دقيقة</span>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{questions.length} سؤال</span>
              <Award className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{totalPoints} نقطة</span>
            </div>
          </div>

          {/* Date inputs */}
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">يبدأ:</Label>
              <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">ينتهي:</Label>
              <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="manual" className="gap-2">
                <BookOpen className="h-4 w-4" />
                إنشاء يدوي
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Sparkles className="h-4 w-4" />
                المساعد الذكي
              </TabsTrigger>
            </TabsList>

            {/* === Manual Tab === */}
            <TabsContent value="manual" className="space-y-6">
              {/* Quick Add Buttons */}
              <Card className="border-dashed border-2">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3 text-muted-foreground">إضافة سريعة</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { type: "mcq" as QuestionType, label: "اختيار متعدد", icon: <CircleDot className="h-3.5 w-3.5" />, color: "text-blue-600" },
                      { type: "true_false" as QuestionType, label: "صح وخطأ", icon: <ToggleLeft className="h-3.5 w-3.5" />, color: "text-amber-600" },
                      { type: "essay" as QuestionType, label: "مقالي", icon: <FileEdit className="h-3.5 w-3.5" />, color: "text-purple-600" },
                    ]).map(item => (
                      <div key={item.type} className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className={`gap-1.5 ${item.color}`}
                          onClick={() => addQuestionBatch(item.type, 1)}>
                          <Plus className="h-3 w-3" /> {item.icon} +1
                        </Button>
                        <Button variant="outline" size="sm" className={`gap-1 ${item.color}`}
                          onClick={() => addQuestionBatch(item.type, 3)}>+3</Button>
                        <Button variant="outline" size="sm" className={`gap-1 ${item.color}`}
                          onClick={() => addQuestionBatch(item.type, 5)}>+5</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Questions grouped by type */}
              {questions.length === 0 && (
                <div className="text-center py-12 space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">لم يتم إضافة أسئلة بعد</p>
                  <p className="text-sm text-muted-foreground">استخدم الأزرار أعلاه لإضافة أسئلة أو المساعد الذكي</p>
                </div>
              )}

              {/* MCQ Section */}
              {mcqQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CircleDot className="h-5 w-5 text-blue-600" />
                    <h3 className="font-bold text-blue-600">اختيار من متعدد ({mcqQuestions.length})</h3>
                  </div>
                  {mcqQuestions.map(({ q, i: qi }) => (
                    <QuestionCard key={qi} q={q} qi={qi} type="mcq"
                      typeColor={typeColor} typeBorderColor={typeBorderColor}
                      typeIcon={typeIcon} typeLabel={typeLabel}
                      updateQuestion={updateQuestion} changeQuestionType={changeQuestionType}
                      updateOption={updateOption} removeQuestion={removeQuestion}
                      questionsCount={questions.length} />
                  ))}
                </div>
              )}

              {/* T/F Section */}
              {tfQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ToggleLeft className="h-5 w-5 text-amber-600" />
                    <h3 className="font-bold text-amber-600">صح وخطأ ({tfQuestions.length})</h3>
                  </div>
                  {tfQuestions.map(({ q, i: qi }) => (
                    <QuestionCard key={qi} q={q} qi={qi} type="true_false"
                      typeColor={typeColor} typeBorderColor={typeBorderColor}
                      typeIcon={typeIcon} typeLabel={typeLabel}
                      updateQuestion={updateQuestion} changeQuestionType={changeQuestionType}
                      updateOption={updateOption} removeQuestion={removeQuestion}
                      questionsCount={questions.length} />
                  ))}
                </div>
              )}

              {/* Essay Section */}
              {essayQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-5 w-5 text-purple-600" />
                    <h3 className="font-bold text-purple-600">مقالي ({essayQuestions.length})</h3>
                  </div>
                  {essayQuestions.map(({ q, i: qi }) => (
                    <QuestionCard key={qi} q={q} qi={qi} type="essay"
                      typeColor={typeColor} typeBorderColor={typeBorderColor}
                      typeIcon={typeIcon} typeLabel={typeLabel}
                      updateQuestion={updateQuestion} changeQuestionType={changeQuestionType}
                      updateOption={updateOption} removeQuestion={removeQuestion}
                      questionsCount={questions.length} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* === AI Tab === */}
            <TabsContent value="ai" className="space-y-6">
              {/* Image Upload Section */}
              <Card className="bg-gradient-to-br from-blue-500/5 to-primary/5 border-blue-200 dark:border-blue-800">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-blue-500/10">
                      <ImagePlus className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">استخراج أسئلة من صورة</h3>
                      <p className="text-sm text-muted-foreground">ارفع صورة امتحان ورقي والمساعد الذكي يستخرج الأسئلة تلقائياً</p>
                    </div>
                  </div>

                  <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                      id="exam-image-upload"
                    />
                    <label htmlFor="exam-image-upload" className="cursor-pointer">
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium text-foreground">اضغط لرفع صورة الامتحان</p>
                      <p className="text-xs text-muted-foreground mt-1">يدعم JPG, PNG, WEBP</p>
                    </label>
                  </div>

                  {/* Image Previews */}
                  {aiImagePreviews.length > 0 && (
                    <div className="flex gap-3 flex-wrap">
                      {aiImagePreviews.map((preview, idx) => (
                        <div key={idx} className="relative group">
                          <img src={preview} alt={`صورة ${idx + 1}`}
                            className="w-24 h-24 object-cover rounded-lg border-2 border-border" />
                          <Button
                            variant="destructive" size="icon"
                            className="absolute -top-2 -left-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeImage(idx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiImagePreviews.length > 0 && (
                    <Button onClick={handleImageOcr} disabled={ocrLoading} className="w-full gap-2 h-11 bg-blue-600 hover:bg-blue-700 text-white">
                      {ocrLoading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> جاري استخراج الأسئلة من الصورة...</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> استخراج الأسئلة من الصورة</>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">أو</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Text-based AI Generation */}
              <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-primary/10">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">توليد أسئلة بالذكاء الاصطناعي</h3>
                      <p className="text-sm text-muted-foreground">اكتب وصفاً للامتحان أو الصق نص الدرس</p>
                    </div>
                  </div>

                  {/* Question counts */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <CircleDot className="h-3 w-3 text-blue-600" /> اختياري
                      </Label>
                      <Select value={aiMcqCount} onValueChange={setAiMcqCount}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0,1,2,3,5,7,10].map(n => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <ToggleLeft className="h-3 w-3 text-amber-600" /> صح/خطأ
                      </Label>
                      <Select value={aiTfCount} onValueChange={setAiTfCount}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0,1,2,3,5,7,10].map(n => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <FileEdit className="h-3 w-3 text-purple-600" /> مقالي
                      </Label>
                      <Select value={aiEssayCount} onValueChange={setAiEssayCount}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0,1,2,3,5].map(n => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">مستوى الصعوبة</Label>
                    <Select value={aiDifficulty} onValueChange={setAiDifficulty}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="سهل">سهل</SelectItem>
                        <SelectItem value="متوسط">متوسط</SelectItem>
                        <SelectItem value="صعب">صعب</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">وصف الامتحان أو نص الدرس</Label>
                    <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                      placeholder="مثال: أنشئ امتحان على درس الفاعل والمفعول به من منهج النحو للصف الثالث الثانوي... أو الصق نص الدرس هنا"
                      rows={5} className="resize-none" dir="rtl" />
                  </div>

                  <Button onClick={handleAiGenerate} disabled={aiLoading} className="w-full gap-2 h-11"
                    style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(158 64% 35%))" }}>
                    {aiLoading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> جاري التوليد...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> توليد الأسئلة بالذكاء الاصطناعي</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          {questions.length > 0 && (
            <div className="flex gap-3 pt-4 border-t mt-6 sticky bottom-0 bg-card pb-2">
              <Button variant="outline" className="flex-1 gap-2 h-11" onClick={() => handleSave(false)} disabled={saving}>
                <Save className="h-4 w-4" /> حفظ كمسودة
              </Button>
              <Button className="flex-1 gap-2 h-11" onClick={() => handleSave(true)} disabled={saving}
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(158 64% 35%))" }}>
                <Send className="h-4 w-4" /> نشر الامتحان
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Extracted Question Card Component
type QuestionCardProps = {
  q: ExamQuestion;
  qi: number;
  type: QuestionType;
  typeColor: (t: QuestionType) => string;
  typeBorderColor: (t: QuestionType) => string;
  typeIcon: (t: QuestionType) => React.ReactNode;
  typeLabel: (t: QuestionType) => string;
  updateQuestion: (i: number, field: keyof ExamQuestion, value: any) => void;
  changeQuestionType: (i: number, t: QuestionType) => void;
  updateOption: (qi: number, oi: number, v: string) => void;
  removeQuestion: (i: number) => void;
  questionsCount: number;
};

const QuestionCard = ({
  q, qi, typeColor, typeBorderColor, typeIcon, typeLabel,
  updateQuestion, changeQuestionType, updateOption, removeQuestion, questionsCount
}: QuestionCardProps) => (
  <Card className={`border-r-4 ${typeBorderColor(q.type)} shadow-sm hover:shadow-md transition-shadow`}>
    <CardContent className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge className={`${typeColor(q.type)} border text-xs gap-1`}>
            {typeIcon(q.type)} {typeLabel(q.type)}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">#{qi + 1}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-0.5">
            <Input type="number" value={q.points || 1}
              onChange={e => updateQuestion(qi, "points", parseInt(e.target.value) || 1)}
              className="w-12 h-7 text-center text-xs border-0 bg-transparent p-0" min="1" max="10" />
            <span className="text-[10px] text-muted-foreground">نقطة</span>
          </div>
          <Select value={q.type} onValueChange={(v) => changeQuestionType(qi, v as QuestionType)}>
            <SelectTrigger className="w-28 h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mcq">اختيار متعدد</SelectItem>
              <SelectItem value="true_false">صح وخطأ</SelectItem>
              <SelectItem value="essay">مقالي</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="text-destructive h-7 w-7"
            onClick={() => removeQuestion(qi)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Textarea value={q.question} onChange={e => updateQuestion(qi, "question", e.target.value)}
        placeholder="اكتب نص السؤال هنا..." rows={2} className="resize-none text-sm" dir="rtl" />

      {/* MCQ Options */}
      {q.type === "mcq" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map((opt, oi) => (
            <div key={oi} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
              q.correct_answer === opt && opt.trim() ? "bg-green-50 border-green-300 dark:bg-green-900/20" : "hover:bg-accent/50"
            }`}>
              <input type="radio" name={`correct-${qi}`}
                checked={q.correct_answer === opt && opt.trim() !== ""}
                onChange={() => updateQuestion(qi, "correct_answer", opt)}
                className="accent-green-600 shrink-0" />
              <Input value={opt} onChange={e => updateOption(qi, oi, e.target.value)}
                placeholder={`الخيار ${oi + 1}`} className="flex-1 h-8 text-sm border-0 bg-transparent" />
              {q.correct_answer === opt && opt.trim() && (
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* True/False */}
      {q.type === "true_false" && (
        <div className="flex gap-3">
          {["صح", "خطأ"].map(opt => (
            <label key={opt} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
              q.correct_answer === opt
                ? opt === "صح" ? "bg-green-50 border-green-400 dark:bg-green-900/20" : "bg-red-50 border-red-400 dark:bg-red-900/20"
                : "hover:bg-accent"
            }`}>
              <input type="radio" name={`tf-${qi}`}
                checked={q.correct_answer === opt}
                onChange={() => updateQuestion(qi, "correct_answer", opt)}
                className="accent-primary" />
              <span className="font-bold">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* Essay */}
      {q.type === "essay" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">نموذج الإجابة (يستخدم في التصحيح الذكي)</Label>
          <Textarea value={q.model_answer || ""}
            onChange={e => updateQuestion(qi, "model_answer", e.target.value)}
            placeholder="اكتب نموذج الإجابة هنا..." rows={3} className="resize-none text-sm" dir="rtl" />
        </div>
      )}
    </CardContent>
  </Card>
);

export default ExamEditorDialog;
