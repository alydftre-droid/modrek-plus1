import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useExam, useExamQuestions, useAttemptAnswers, useAttempt } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CheckCircle2, XCircle, Sparkles, Save } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function TeacherAttemptDetailPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [], isLoading: qLoading } = useExamQuestions(examId);
  const { data: answers = [], refetch: refetchAnswers, isLoading: aLoading } = useAttemptAnswers(attemptId);
  const { data: attempt, refetch: refetchAttempt } = useAttempt(attemptId);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);

  const answerByQ = new Map(answers.map((a: any) => [a.question_id, a]));

  const runAiGrade = async () => {
    if (!attemptId) return;
    setAiRunning(true);
    try {
      const { error } = await supabase.functions.invoke("grade-essay", { body: { attemptId } });
      if (error) throw error;
      toast.success("تم تشغيل التصحيح الذكي");
      await Promise.all([refetchAnswers(), refetchAttempt()]);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تشغيل التصحيح الذكي");
    } finally {
      setAiRunning(false);
    }
  };

  const saveMark = async (a: any, mark: number, maxMark: number) => {
    setSavingId(a.id);
    try {
      const clamped = Math.max(0, Math.min(mark, maxMark));
      const { error } = await supabase
        .from("exam_answers")
        .update({ marks_awarded: clamped, is_correct: clamped >= maxMark })
        .eq("id", a.id);
      if (error) throw error;

      // Recalculate total
      const { data: rows } = await supabase.from("exam_answers").select("marks_awarded").eq("attempt_id", attemptId!);
      const total = (rows || []).reduce((s: number, r: any) => s + Number(r.marks_awarded || 0), 0);
      const max = Number(attempt?.max_score || exam?.total_marks || 0);
      const pct = max > 0 ? Math.round((total / max) * 10000) / 100 : 0;
      await supabase.from("exam_attempts").update({
        total_score: total,
        percentage: pct,
        passed: total >= Number(exam?.pass_marks || 0),
        is_graded: true,
        status: "graded",
        graded_at: new Date().toISOString(),
      }).eq("id", attemptId!);

      toast.success("تم حفظ الدرجة");
      await Promise.all([refetchAnswers(), refetchAttempt()]);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setSavingId(null);
    }
  };

  if (qLoading || aLoading) {
    return <TeacherSidebarLayout title="مراجعة المحاولة"><div className="p-4 max-w-3xl mx-auto space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div></TeacherSidebarLayout>;
  }

  return (
    <TeacherSidebarLayout title="مراجعة المحاولة">
      <div className="container max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(`/teacher/exams/${examId}/attempts`)}>
            <ArrowRight className="h-4 w-4 ml-1" />رجوع للمحاولات
          </Button>
          <Button onClick={runAiGrade} disabled={aiRunning} className="gap-1">
            <Sparkles className="h-4 w-4" />{aiRunning ? "جاري التصحيح..." : "تصحيح ذكي للأسئلة المقالية"}
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <h1 className="text-lg font-extrabold">{exam?.title}</h1>
            <p className="text-sm text-muted-foreground">
              الدرجة: <span className="font-bold">{attempt?.total_score ?? 0} / {attempt?.max_score ?? exam?.total_marks ?? 0}</span>
              {" "}({attempt?.percentage ?? 0}%)
              {" — "}
              الحالة: {attempt?.status === "graded" ? "مصحح" : attempt?.status === "submitted" ? "ينتظر التصحيح" : "جاري"}
            </p>
          </CardContent>
        </Card>

        {(() => {
          const nodes: JSX.Element[] = [];
          let qNum = 0;
          for (let i = 0; i < questions.length; i++) {
            const q: any = questions[i];
            if (q.question_type === "section") {
              nodes.push(
                <div key={q.id} className="pt-2">
                  <h2 className="text-lg font-extrabold text-primary">{q.question_text || "قسم"}</h2>
                </div>
              );
              continue;
            }
            const a: any = answerByQ.get(q.id);
            const isCorrect = a?.is_correct === true;
            const isWrong = a?.is_correct === false;
            const idx = qNum++;
            const isEssayLike = ["short_answer", "fill_blank", "essay"].includes(q.question_type);

            nodes.push(
              <Card key={q.id} className={`border-2 ${isCorrect ? "border-green-500/50" : isWrong ? "border-red-500/50" : "border-border"}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>{idx + 1}</Badge>
                      {isCorrect && <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 ml-1" />صحيح</Badge>}
                      {isWrong && <Badge variant="destructive"><XCircle className="h-3 w-3 ml-1" />خطأ</Badge>}
                    </div>
                    <Badge variant="outline">{Number(a?.marks_awarded || 0)} / {q.marks}</Badge>
                  </div>
                  <p className="font-bold">{q.question_text}</p>

                  {(q.question_type === "mcq" || q.question_type === "true_false") && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt: any) => {
                        const isSelected = a?.selected_option_ids?.includes(opt.id);
                        return (
                          <div key={opt.id} className={`p-3 rounded-xl border-2 ${
                            opt.is_correct ? "border-green-500 bg-green-500/10" :
                            isSelected ? "border-red-500 bg-red-500/10" : "border-border bg-muted/20"
                          }`}>
                            <div className="flex items-center gap-2">
                              {opt.is_correct ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                               isSelected ? <XCircle className="h-4 w-4 text-red-600" /> : <div className="w-4 h-4" />}
                              <span>{opt.option_text}</span>
                              {isSelected && <Badge variant="outline" className="ms-auto text-[10px]">إجابة الطالب</Badge>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isEssayLike && (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl bg-muted/40">
                        <div className="text-xs text-muted-foreground mb-1">إجابة الطالب:</div>
                        <div className="whitespace-pre-wrap">{a?.answer_text || <span className="text-muted-foreground italic">لم يجب</span>}</div>
                      </div>
                      {q.correct_answer && (
                        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                          <div className="text-xs text-green-700 mb-1">الإجابة النموذجية:</div>
                          <div className="whitespace-pre-wrap">{q.correct_answer}</div>
                        </div>
                      )}
                      {a?.ai_feedback && (
                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                          <div className="text-xs text-blue-700 mb-1">ملاحظات الذكاء الاصطناعي:</div>
                          <div className="text-sm">{a.ai_feedback}</div>
                        </div>
                      )}
                      {a && (
                        <ManualGrade
                          initial={Number(a.marks_awarded || 0)}
                          maxMark={Number(q.marks || 0)}
                          saving={savingId === a.id}
                          onSave={(m) => saveMark(a, m, Number(q.marks || 0))}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }
          return nodes;
        })()}
      </div>
    </TeacherSidebarLayout>
  );
}

function ManualGrade({ initial, maxMark, saving, onSave }: { initial: number; maxMark: number; saving: boolean; onSave: (m: number) => void }) {
  const [val, setVal] = useState(String(initial));
  return (
    <div className="flex items-center gap-2 pt-2 border-t">
      <div className="text-sm text-muted-foreground">تصحيح يدوي:</div>
      <Input
        type="number"
        min={0}
        max={maxMark}
        step="0.25"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-24"
      />
      <span className="text-sm text-muted-foreground">/ {maxMark}</span>
      <Button size="sm" onClick={() => onSave(Number(val || 0))} disabled={saving} className="gap-1">
        <Save className="h-3 w-3" />{saving ? "..." : "حفظ"}
      </Button>
    </div>
  );
}
