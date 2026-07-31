import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamReviewQuestions } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CheckCircle2, XCircle, Info, CircleDot, Lightbulb, Sparkles, BookOpen } from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";

type SmartFeedback = { notes: string; explanation: string; extra: string };

function parseSmartFeedback(raw: unknown): SmartFeedback | null {
  const text = String(raw ?? "").trim();
  if (!text || text[0] !== "{") return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.v === 1 && (parsed.notes || parsed.explanation || parsed.extra)) {
      return {
        notes: String(parsed.notes || "").trim(),
        explanation: String(parsed.explanation || "").trim(),
        extra: String(parsed.extra || "").trim(),
      };
    }
  } catch { /* legacy plain text */ }
  return null;
}


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

const compactReviewText = (value: unknown, max = 90) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

export default function ExamReviewPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [], isLoading, refetch } = useExamReviewQuestions(attemptId);
  const [waitTicks, setWaitTicks] = useState(0);

  const gradableQuestions = questions.filter(
    (q: any) => q?.question_type && q.question_type !== "section",
  );
  const smartReady =
    gradableQuestions.length > 0 &&
    gradableQuestions.every((q: any) => parseSmartFeedback(q?.answer?.ai_feedback) !== null);
  const stillWaiting = !isLoading && !smartReady && waitTicks < 40;

  // First entry right after submit: smart grading may still be writing feedback.
  // Poll the same source used on re-entry instead of rendering anything legacy.
  useEffect(() => {
    if (!stillWaiting) return;
    const timer = window.setInterval(() => {
      setWaitTicks((t) => t + 1);
      void refetch();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [stillWaiting, refetch]);

  if (isLoading || stillWaiting) {
    return (
      <StudentLayout>
        <div className="p-4 space-y-3 max-w-3xl mx-auto">
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 animate-pulse text-blue-600" />
            جاري إعداد التصحيح الذكي والملاحظات الذكية...
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </StudentLayout>
    );
  }

  const showCorrect = (exam as any)?.show_correct_answers !== false;
  const answerByQ = new Map(
    questions
      .map((q: any) => q?.answer)
      .filter((answer: any) => answer?.question_id)
      .map((answer: any) => [answer.question_id, answer]),
  );


  return (
    <StudentLayout>
      <div className="container max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}><ArrowRight className="h-4 w-4 ml-1" />رجوع</Button>
          <h1 className="font-bold">مراجعة: {exam?.title}</h1>
        </div>

        {(() => {
          const nodes: JSX.Element[] = [];
          let qNum = 0;
          for (let i = 0; i < questions.length; i++) {
            const q: any = questions[i];
            if (q.question_type === "section") {
              let subCount = 0;
              let subMarks = 0;
              for (let j = i + 1; j < questions.length; j++) {
                const n: any = questions[j];
                if (n.question_type === "section") break;
                subCount++;
                subMarks += Number(n.marks || 0);
              }
              const totalMarks = Number(q.marks || 0) || subMarks;
              nodes.push(
                <div key={q.id} className="pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-extrabold text-primary">{q.question_text || "قسم"}</h2>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{subCount} أسئلة</Badge>
                      {totalMarks > 0 && <Badge variant="outline">{totalMarks} درجة</Badge>}
                    </div>
                  </div>
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
            const idx = qNum;
            qNum++;
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
                    <Badge variant="outline">{awarded} / {q.marks} درجة</Badge>
                  </div>
                  <p className="font-bold">{q.question_text}</p>

                  {(() => {
                    const isObjective = q.question_type === "mcq" || q.question_type === "true_false" || q.question_type === "fill_blank";
                    const isWrittenText = q.question_type === "short_answer" || q.question_type === "essay" || q.question_type === "fill_blank";
                    let correctText = "";
                    let studentPicked = "";
                    if (q.question_type === "mcq" || q.question_type === "true_false") {
                      const correctOpt = (q.options || []).find((o: any) => isOptionCorrectForQuestion(q, o));
                      correctText = correctOpt?.option_text || q.correct_answer || "";
                      const pickedOpt = (q.options || []).find((o: any) => a?.selected_option_ids?.includes(o.id));
                      studentPicked = pickedOpt?.option_text || "";
                    } else if (q.question_type === "fill_blank") {
                      correctText = q.correct_answer || "";
                      studentPicked = a?.answer_text || "";
                    }

                    const smart = parseSmartFeedback(a?.ai_feedback);


                    return (
                      <>
                        {(q.question_type === "mcq" || q.question_type === "true_false") && (
                          <div className="space-y-2">
                            {(q.options || []).map((opt: any) => {
                              const isSelected = a?.selected_option_ids?.includes(opt.id);
                              const optionIsCorrect = isOptionCorrectForQuestion(q, opt);
                              const isRight = showCorrect && optionIsCorrect;
                              const isWrongPick = showCorrect && isSelected && !optionIsCorrect;
                              return (
                                <div key={opt.id} className={`p-3 rounded-xl border-2 ${
                                  isRight ? "border-green-500 bg-green-500/10" :
                                  isWrongPick ? "border-red-500 bg-red-500/10" :
                                  isSelected ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                                }`}>
                                  <div className="flex items-center gap-2">
                                    {isRight ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                                     isWrongPick ? <XCircle className="h-4 w-4 text-red-600" /> :
                                     isSelected ? <CheckCircle2 className="h-4 w-4 text-primary" /> :
                                     <div className="w-4 h-4" />}
                                    <span>{opt.option_text}</span>
                                    {isSelected && <Badge variant="outline" className="ms-auto text-[10px]">إجابتك</Badge>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {(q.question_type === "short_answer" || q.question_type === "fill_blank" || q.question_type === "essay") && (
                          <div className="space-y-2">
                            <div className="p-3 rounded-xl bg-muted/40">
                              <div className="text-xs text-muted-foreground mb-1">إجابتك:</div>
                              <div className="whitespace-pre-wrap">{a?.answer_text || <span className="text-muted-foreground italic">لم تجب على هذا السؤال</span>}</div>
                            </div>
                            {showCorrect && q.correct_answer && (
                              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                                <div className="text-xs text-green-700 dark:text-green-300 mb-1">الإجابة الصحيحة / النموذجية:</div>
                                <div className="whitespace-pre-wrap">{q.correct_answer}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {smart ? (
                          <div className="space-y-3">
                            {smart.notes && (
                              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
                                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 mb-2 font-bold text-sm">
                                  <Sparkles className="h-4 w-4" />
                                  ملاحظات ذكية
                                </div>
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">{smart.notes}</div>
                              </div>
                            )}
                            {smart.explanation && (
                              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-2 font-bold text-sm">
                                  <BookOpen className="h-4 w-4" />
                                  الشرح الذكي
                                </div>
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">{smart.explanation}</div>
                              </div>
                            )}
                            {smart.extra && (
                              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 mb-2 font-bold text-sm">
                                  <Lightbulb className="h-4 w-4" />
                                  معلومة إضافية
                                </div>
                                <div className="text-sm whitespace-pre-wrap leading-relaxed">{smart.extra}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            {visibleFeedback && (
                              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                                <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">ملاحظات:</div>
                                <div className="text-sm whitespace-pre-wrap">{visibleFeedback}</div>
                              </div>
                            )}
                            {(q.explanation || autoExplain) && (
                              <Card className="bg-amber-500/5 border-amber-500/30">
                                <CardContent className="p-3 text-sm">
                                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1 font-bold">
                                    <Info className="h-4 w-4" />الشرح
                                  </div>
                                  <div className="whitespace-pre-wrap">{q.explanation || autoExplain}</div>
                                </CardContent>
                              </Card>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          }
          return nodes;
        })()}
      </div>
    </StudentLayout>
  );
}

