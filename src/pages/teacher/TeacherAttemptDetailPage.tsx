import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useExam, useExamQuestions, useAttemptAnswers, useAttempt } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CheckCircle2, XCircle, Sparkles, Save, UserRound, Trophy, FileText, Clock, CircleDot } from "lucide-react";
import TeacherSidebarLayout from "@/components/teacher/TeacherSidebarLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const normalizeReviewAnswer = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(true|yes|correct|right|صحيح)$/, "صح")
    .replace(/^(false|no|wrong|incorrect|خطا|خطأ|غير صحيح)$/, "خطأ")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ");

const booleanReviewKey = (value: unknown) => {
  const normalized = normalizeReviewAnswer(value);
  if (["صح", "صحيح", "true", "yes", "correct", "right", "1"].includes(normalized)) return "true";
  if (["خطا", "غير صحيح", "false", "no", "wrong", "incorrect", "0"].includes(normalized)) return "false";
  return null;
};

const isOptionCorrectForQuestion = (question: any, option: any) => {
  if (question?.question_type === "true_false" || question?.question_type === "tf") {
    const expected = booleanReviewKey(question?.correct_answer);
    const actual = booleanReviewKey(option?.option_text);
    if (expected && actual) return expected === actual;
  }
  return Boolean(option?.is_correct);
};

export default function TeacherAttemptDetailPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [], isLoading: qLoading } = useExamQuestions(examId);
  const { data: answers = [], refetch: refetchAnswers, isLoading: aLoading } = useAttemptAnswers(attemptId);
  const { data: attempt, refetch: refetchAttempt } = useAttempt(attemptId);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  const answerByQ = new Map(answers.map((a: any) => [a.question_id, a]));
  const questionCount = questions.filter((q: any) => q.question_type !== "section").length;
  const answeredCount = answers.filter((a: any) => String(a.answer_text || "").trim() || (Array.isArray(a.selected_option_ids) && a.selected_option_ids.length > 0)).length;

  useEffect(() => {
    if (!attempt?.student_id) return;
    supabase
      .from("profiles")
      .select("id, full_name, student_code, avatar_url")
      .eq("id", attempt.student_id)
      .maybeSingle()
      .then(({ data }) => setStudentProfile(data || null));
  }, [attempt?.student_id]);

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
      <div className="container max-w-5xl mx-auto p-4 space-y-5 pb-24">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(`/teacher/exams/${examId}/attempts`)} className="gap-1">
            <ArrowRight className="h-4 w-4" />رجوع للإحصائيات
          </Button>
          <Button onClick={runAiGrade} disabled={aiRunning} className="gap-1">
            <Sparkles className="h-4 w-4" />{aiRunning ? "جاري التصحيح..." : "تصحيح ذكي للأسئلة المقالية"}
          </Button>
        </div>

        <section className="rounded-3xl border bg-card overflow-hidden shadow-sm">
          <div className="bg-primary/10 p-5 md:p-7 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-3">
                <Badge variant="secondary" className="w-fit gap-1"><UserRound className="h-3 w-3" />مراجعة إجابة طالب</Badge>
                <div>
                  <h1 className="text-2xl md:text-3xl font-black tracking-normal">{studentProfile?.full_name || "طالب"}</h1>
                  <p className="text-sm text-muted-foreground mt-1">{exam?.title} {studentProfile?.student_code ? `• كود ${studentProfile.student_code}` : ""}</p>
                </div>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4 min-w-[180px]">
                <div className="text-xs text-muted-foreground mb-1">الدرجة النهائية</div>
                <div className="text-4xl font-black text-primary">{attempt?.percentage ?? 0}%</div>
                <div className="text-sm text-muted-foreground mt-1">{attempt?.total_score ?? 0} / {attempt?.max_score ?? exam?.total_marks ?? 0}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ReviewMetric icon={<Trophy className="h-5 w-5" />} label="الدرجة" value={`${attempt?.total_score ?? 0}/${attempt?.max_score ?? exam?.total_marks ?? 0}`} />
          <ReviewMetric icon={<FileText className="h-5 w-5" />} label="الإجابات" value={`${answeredCount}/${questionCount}`} />
          <ReviewMetric icon={<Clock className="h-5 w-5" />} label="الوقت" value={`${Math.floor(Number(attempt?.time_spent_seconds || 0) / 60)} د`} />
          <ReviewMetric icon={<CheckCircle2 className="h-5 w-5" />} label="الحالة" value={attempt?.status === "graded" ? "مصحح" : attempt?.status === "submitted" ? "تم التسليم" : "جاري"} />
        </div>

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
            const awarded = Number(a?.marks_awarded || 0);
            const maxMark = Number(q.marks || 0);
            const isCorrect = a?.is_correct === true || (maxMark > 0 && awarded >= maxMark);
            const isPartial = !isCorrect && awarded > 0;
            const isWrong = Boolean(a) && !isCorrect && !isPartial;
            const idx = qNum++;
            const isEssayLike = ["short_answer", "fill_blank", "essay"].includes(q.question_type);

            nodes.push(
              <Card key={q.id} className={`border-2 ${isCorrect ? "border-green-500/50" : isPartial ? "border-amber-500/50" : isWrong ? "border-red-500/50" : "border-border"}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>{idx + 1}</Badge>
                      {isCorrect && <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 ml-1" />صحيح</Badge>}
                      {isPartial && <Badge className="bg-amber-500 text-white"><CircleDot className="h-3 w-3 ml-1" />جزئي</Badge>}
                      {isWrong && <Badge variant="destructive"><XCircle className="h-3 w-3 ml-1" />خطأ</Badge>}
                    </div>
                    <Badge variant="outline">{awarded} / {q.marks}</Badge>
                  </div>
                  <p className="font-black whitespace-pre-wrap leading-8">{q.question_text}</p>

                  {(q.question_type === "mcq" || q.question_type === "true_false") && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt: any) => {
                        const isSelected = a?.selected_option_ids?.includes(opt.id);
                        const optionIsCorrect = isOptionCorrectForQuestion(q, opt);
                        return (
                          <div key={opt.id} className={`p-3 rounded-xl border-2 ${
                            optionIsCorrect ? "border-green-500 bg-green-500/10" :
                            isSelected ? "border-red-500 bg-red-500/10" : "border-border bg-muted/20"
                          }`}>
                            <div className="flex items-center gap-2">
                              {optionIsCorrect ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                               isSelected ? <XCircle className="h-4 w-4 text-red-600" /> : <div className="w-4 h-4" />}
                              <span>{opt.option_text}</span>
                              {isSelected && <Badge variant="outline" className="ms-auto text-[10px]">إجابة الطالب</Badge>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!a && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700">
                      لا توجد إجابة محفوظة لهذا السؤال.
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
                        <div className="p-3 rounded-xl bg-primary/10 border border-primary/30">
                          <div className="text-xs text-primary mb-1">ملاحظات التصحيح الذكي:</div>
                          <div className="text-sm">{a.ai_feedback}</div>
                        </div>
                      )}
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

function ReviewMetric({ icon, label, value }: { icon: JSX.Element; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">{icon}</div>
        <div className="text-xl font-black">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
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
