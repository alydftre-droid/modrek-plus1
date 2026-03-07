import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion, QuestionType } from "./types";
import { Plus, Trash2, Save, Send, GripVertical } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  editingExam: ExamRow | null;
  initialQuestions: ExamQuestion[];
  isAiGenerated: boolean;
  onSuccess: () => void;
  groupId?: string;
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
  open, onOpenChange, subjectId, editingExam, initialQuestions, isAiGenerated, onSuccess, groupId,
}: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("30");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [saving, setSaving] = useState(false);

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
        setQuestions(initialQuestions.length > 0 ? initialQuestions.map(q => ({ ...q, type: q.type || "mcq", points: q.points || 1 })) : [emptyQuestion()]);
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

  const addQuestion = (type: QuestionType = "mcq") => {
    setQuestions(prev => [...prev, emptyQuestion(type)]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    if (!title.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال عنوان الامتحان", variant: "destructive" });
      return false;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} فارغ`, variant: "destructive" });
        return false;
      }
      if (q.type === "mcq") {
        if (q.options.filter(o => o.trim()).length < 2) {
          toast({ title: "خطأ", description: `السؤال ${i + 1} يحتاج على الأقل خيارين`, variant: "destructive" });
          return false;
        }
        if (!q.correct_answer.trim()) {
          toast({ title: "خطأ", description: `السؤال ${i + 1} بدون إجابة صحيحة`, variant: "destructive" });
          return false;
        }
      }
      if (q.type === "true_false" && !q.correct_answer) {
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

      toast({ title: "تم", description: publish ? "تم نشر الامتحان بنجاح" : "تم حفظ الامتحان كمسودة" });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حفظ الامتحان", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = (t: QuestionType) => {
    if (t === "mcq") return "اختيار من متعدد";
    if (t === "true_false") return "صح وخطأ";
    return "مقالي";
  };

  const typeBadgeColor = (t: QuestionType) => {
    if (t === "mcq") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    if (t === "true_false") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editingExam ? "تعديل الامتحان" : "إنشاء امتحان جديد"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Exam Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>عنوان الامتحان</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: امتحان الدرس الأول" />
            </div>
            <div className="space-y-2">
              <Label>المدة (بالدقائق)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1" />
            </div>
            <div className="space-y-2">
              <Label>تاريخ البدء (اختياري)</Label>
              <Input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الانتهاء (اختياري)</Label>
              <Input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-lg font-semibold">الأسئلة ({questions.length})</h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => addQuestion("mcq")} className="gap-1 text-xs">
                  <Plus className="h-3 w-3" /> اختيار متعدد
                </Button>
                <Button variant="outline" size="sm" onClick={() => addQuestion("true_false")} className="gap-1 text-xs">
                  <Plus className="h-3 w-3" /> صح وخطأ
                </Button>
                <Button variant="outline" size="sm" onClick={() => addQuestion("essay")} className="gap-1 text-xs">
                  <Plus className="h-3 w-3" /> مقالي
                </Button>
              </div>
            </div>

            {questions.map((q, qi) => (
              <Card key={qi} className="border-r-4 border-r-primary/30">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span>السؤال {qi + 1}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeColor(q.type)}`}>
                        {typeLabel(q.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={q.points || 1}
                          onChange={e => updateQuestion(qi, "points", parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center text-xs"
                          min="1"
                          max="10"
                        />
                        <span className="text-xs text-muted-foreground">نقطة</span>
                      </div>
                      <Select value={q.type} onValueChange={(v) => changeQuestionType(qi, v as QuestionType)}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mcq">اختيار متعدد</SelectItem>
                          <SelectItem value="true_false">صح وخطأ</SelectItem>
                          <SelectItem value="essay">مقالي</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8"
                        onClick={() => removeQuestion(qi)} disabled={questions.length <= 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Textarea value={q.question} onChange={e => updateQuestion(qi, "question", e.target.value)}
                    placeholder="نص السؤال..." rows={2} className="resize-none" dir="rtl" />

                  {/* MCQ Options */}
                  {q.type === "mcq" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input type="radio" name={`correct-${qi}`}
                            checked={q.correct_answer === opt && opt.trim() !== ""}
                            onChange={() => updateQuestion(qi, "correct_answer", opt)}
                            className="accent-primary" />
                          <Input value={opt} onChange={e => updateOption(qi, oi, e.target.value)}
                            placeholder={`الخيار ${oi + 1}`} className="flex-1" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* True/False Options */}
                  {q.type === "true_false" && (
                    <div className="flex gap-4">
                      {["صح", "خطأ"].map(opt => (
                        <label key={opt} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                          q.correct_answer === opt ? "bg-primary/10 border-primary" : "hover:bg-accent"
                        }`}>
                          <input type="radio" name={`tf-${qi}`}
                            checked={q.correct_answer === opt}
                            onChange={() => updateQuestion(qi, "correct_answer", opt)}
                            className="accent-primary" />
                          <span className="font-medium">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Essay Model Answer */}
                  {q.type === "essay" && (
                    <div className="space-y-2">
                      <Label className="text-sm">نموذج الإجابة</Label>
                      <Textarea value={q.model_answer || ""}
                        onChange={e => updateQuestion(qi, "model_answer", e.target.value)}
                        placeholder="اكتب نموذج الإجابة هنا..." rows={3} className="resize-none" dir="rtl" />
                    </div>
                  )}

                  {q.type !== "essay" && q.correct_answer && (
                    <p className="text-xs text-green-600">✓ الإجابة الصحيحة: {q.correct_answer}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" className="flex-1 gap-2" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="h-4 w-4" /> حفظ كمسودة
            </Button>
            <Button className="flex-1 gap-2" onClick={() => handleSave(true)} disabled={saving}>
              <Send className="h-4 w-4" /> نشر الامتحان
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExamEditorDialog;
