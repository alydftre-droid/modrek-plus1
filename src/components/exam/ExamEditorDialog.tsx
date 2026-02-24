import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ExamRow, ExamQuestion } from "./types";
import { Plus, Trash2, Save, Send, GripVertical } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectId: string;
  editingExam: ExamRow | null;
  initialQuestions: ExamQuestion[];
  isAiGenerated: boolean;
  onSuccess: () => void;
};

const emptyQuestion = (): ExamQuestion => ({
  question: "",
  options: ["", "", "", ""],
  correct_answer: "",
});

const ExamEditorDialog = ({
  open,
  onOpenChange,
  subjectId,
  editingExam,
  initialQuestions,
  isAiGenerated,
  onSuccess,
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
        setQuestions(editingExam.questions || []);
      } else {
        setTitle("");
        setDuration("30");
        setStartAt("");
        setEndAt("");
        setQuestions(initialQuestions.length > 0 ? initialQuestions : [emptyQuestion()]);
      }
    }
  }, [open, editingExam, initialQuestions]);

  const updateQuestion = (index: number, field: keyof ExamQuestion, value: any) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const opts = [...updated[qIndex].options];
      opts[oIndex] = value;
      updated[qIndex] = { ...updated[qIndex], options: opts };
      return updated;
    });
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    if (!title.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال عنوان الامتحان", variant: "destructive" });
      return false;
    }
    if (!duration || parseInt(duration) < 1) {
      toast({ title: "خطأ", description: "يرجى تحديد مدة صحيحة", variant: "destructive" });
      return false;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} فارغ`, variant: "destructive" });
        return false;
      }
      const filledOptions = q.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} يحتاج على الأقل خيارين`, variant: "destructive" });
        return false;
      }
      if (!q.correct_answer.trim()) {
        toast({ title: "خطأ", description: `السؤال ${i + 1} بدون إجابة صحيحة`, variant: "destructive" });
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
      const cleanQuestions = questions.map((q) => ({
        question: q.question.trim(),
        options: q.options.filter((o) => o.trim()),
        correct_answer: q.correct_answer.trim(),
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
      };

      if (editingExam) {
        const { error } = await supabase
          .from("exams" as any)
          .update(payload)
          .eq("id", editingExam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exams" as any).insert(payload);
        if (error) throw error;
      }

      toast({
        title: "تم",
        description: publish ? "تم نشر الامتحان بنجاح" : "تم حفظ الامتحان كمسودة",
      });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      console.error(e);
      toast({ title: "خطأ", description: "فشل حفظ الامتحان", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: امتحان الدرس الأول" />
            </div>
            <div className="space-y-2">
              <Label>المدة (بالدقائق)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min="1" />
            </div>
            <div className="space-y-2">
              <Label>تاريخ البدء (اختياري)</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الانتهاء (اختياري)</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">الأسئلة ({questions.length})</h3>
              <Button variant="outline" size="sm" onClick={addQuestion} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة سؤال
              </Button>
            </div>

            {questions.map((q, qi) => (
              <Card key={qi} className="border-r-4 border-r-primary/30">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      <span>السؤال {qi + 1}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => removeQuestion(qi)}
                      disabled={questions.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <Textarea
                    value={q.question}
                    onChange={(e) => updateQuestion(qi, "question", e.target.value)}
                    placeholder="نص السؤال..."
                    rows={2}
                    className="resize-none"
                    dir="rtl"
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qi}`}
                          checked={q.correct_answer === opt && opt.trim() !== ""}
                          onChange={() => updateQuestion(qi, "correct_answer", opt)}
                          className="accent-primary"
                        />
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            // If this was the correct answer, update it too
                            if (q.correct_answer === opt) {
                              updateQuestion(qi, "correct_answer", newVal);
                            }
                            updateOption(qi, oi, newVal);
                          }}
                          placeholder={`الخيار ${oi + 1}`}
                          className="flex-1"
                        />
                      </div>
                    ))}
                  </div>

                  {q.correct_answer && (
                    <p className="text-xs text-green-600">
                      ✓ الإجابة الصحيحة: {q.correct_answer}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              <Save className="h-4 w-4" />
              حفظ كمسودة
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              <Send className="h-4 w-4" />
              نشر الامتحان
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExamEditorDialog;
