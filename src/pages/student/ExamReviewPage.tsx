import { useParams, useNavigate } from "react-router-dom";
import { useExam, useExamReviewQuestions, useAttemptAnswers } from "@/hooks/useExams";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CheckCircle2, XCircle, Info } from "lucide-react";
import StudentLayout from "@/components/student/StudentLayout";

export default function ExamReviewPage() {
  const { examId, attemptId } = useParams();
  const navigate = useNavigate();
  const { data: exam } = useExam(examId);
  const { data: questions = [], isLoading } = useExamReviewQuestions(attemptId);
  const { data: answers = [] } = useAttemptAnswers(attemptId);

  if (isLoading) return <StudentLayout><div className="p-4 space-y-3 max-w-3xl mx-auto"><Skeleton className="h-40" /><Skeleton className="h-40" /></div></StudentLayout>;

  const showCorrect = true;
  const answerByQ = new Map(answers.map((a: any) => [a.question_id, a]));

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
            const isCorrect = a?.is_correct === true;
            const isWrong = a?.is_correct === false;
            const idx = qNum;
            qNum++;
            nodes.push(
              <Card key={q.id} className={`border-2 ${isCorrect ? "border-green-500/50" : isWrong ? "border-red-500/50" : "border-border"}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>{idx + 1}</Badge>
                      {isCorrect && <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 ml-1" />صحيح</Badge>}
                      {isWrong && <Badge variant="destructive"><XCircle className="h-3 w-3 ml-1" />خطأ</Badge>}
                    </div>
                    <Badge variant="outline">{Number(a?.marks_awarded || 0)} / {q.marks} درجة</Badge>
                  </div>
                  <p className="font-bold">{q.question_text}</p>

                  {(q.question_type === "mcq" || q.question_type === "true_false") && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt: any) => {
                        const isSelected = a?.selected_option_ids?.includes(opt.id);
                        const isRight = showCorrect && opt.is_correct;
                        const isWrongPick = showCorrect && isSelected && !opt.is_correct;
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
                      {a?.ai_feedback && (
                        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                          <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">ملاحظات:</div>
                          <div className="text-sm">{a.ai_feedback}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {q.explanation && (
                    <Card className="bg-amber-500/5 border-amber-500/30">
                      <CardContent className="p-3 text-sm">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-1 font-bold">
                          <Info className="h-4 w-4" />الشرح
                        </div>
                        <div>{q.explanation}</div>
                      </CardContent>
                    </Card>
                  )}
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
