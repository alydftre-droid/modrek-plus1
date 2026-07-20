import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import ModrekChatWindow from "./ChatWindow";
import { createConversation, listConversations } from "./store";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  examId: string;
  attemptId: string;
  /** Auto-open the chat window instead of showing the CTA card. */
  autoOpen?: boolean;
}

/**
 * Post-exam review chat.
 *
 * Loads the ENTIRE exam + attempt + questions + student answers + grading
 * feedback from the database (never trusts the frontend) and stores it in the
 * conversation's `context_json` so the AI starts every session already
 * knowing everything about the attempt. If the student returns days later
 * from another device we reuse the SAME conversation for the same
 * (exam, attempt) pair instead of starting a blank one.
 */
export default function PostExamReviewChat({ examId, attemptId, autoOpen = false }: Props) {
  const [convId, setConvId] = useState<string | null>(null);
  const [open, setOpen] = useState(autoOpen);
  const [starting, setStarting] = useState(false);
  const bootstrapRef = useRef(false);

  const buildContextAndConversation = async (): Promise<string | null> => {
    // 1) Pull everything from the DB using ids — never trust caller state.
    const [examRes, questionsRes, attemptRes, answersRes] = await Promise.all([
      supabase
        .from("exams")
        .select("id, title, description, subject_id, total_marks, duration_minutes, source, created_at")
        .eq("id", examId)
        .maybeSingle(),
      supabase
        .rpc("get_exam_review_questions", { _attempt_id: attemptId } as any),
      supabase
        .from("exam_attempts")
        .select("id, total_score, max_score, percentage, passed, status, is_graded, time_spent_seconds, attempt_number, started_at, submitted_at")
        .eq("id", attemptId)
        .maybeSingle(),
      supabase
        .from("exam_answers")
        .select("question_id, selected_option_ids, answer_text, is_correct, marks_awarded, ai_feedback, time_spent_seconds")
        .eq("attempt_id", attemptId),
    ]);

    if (examRes.error) throw examRes.error;
    if (questionsRes.error) throw questionsRes.error;
    if (attemptRes.error) throw attemptRes.error;
    if (answersRes.error) throw answersRes.error;

    const exam = examRes.data;
    const questions = Array.isArray(questionsRes.data) ? questionsRes.data : [];
    const attempt = attemptRes.data;
    const answers = answersRes.data || [];
    if (!exam || !attempt) throw new Error("تعذر تحميل بيانات محاولة الامتحان للمراجعة");

    let subjectName: string | null = null;
    if ((exam as any)?.subject_id) {
      const { data: subj } = await supabase
        .from("subjects")
        .select("name_ar")
        .eq("id", (exam as any).subject_id)
        .maybeSingle();
      subjectName = (subj as any)?.name_ar || null;
    }

    const realQuestions = (questions || []).filter((q: any) => q.question_type !== "section");
    const answerByQuestion = new Map((answers || []).map((a: any) => [String(a.question_id), a]));
    const normalizedQuestionAnswers = (questions || [])
      .filter((q: any) => q.question_type !== "section")
      .map((q: any) => q.answer || answerByQuestion.get(String(q.id)) || null)
      .filter(Boolean);
    const correctCount = normalizedQuestionAnswers.filter((a: any) => a.is_correct === true).length;
    const wrongCount = normalizedQuestionAnswers.filter((a: any) => a.is_correct === false).length;
    const answeredIds = new Set(normalizedQuestionAnswers.map((a: any) => a.question_id));
    const unansweredCount = realQuestions.filter((q: any) => !answeredIds.has(q.id)).length;

    const context = {
      title: `مراجعة: ${exam?.title || "الامتحان"}`,
      exam_id: examId,
      attempt_id: attemptId,
      subject_name: subjectName,
      subject_id: (exam as any)?.subject_id || null,
      exam: {
        title: exam?.title,
        description: (exam as any)?.description,
        total_marks: (exam as any)?.total_marks,
        duration_minutes: (exam as any)?.duration_minutes,
        source: (exam as any)?.source,
        created_at: (exam as any)?.created_at,
      },
      attempt_summary: {
        attempt_number: (attempt as any)?.attempt_number,
        total_score: attempt?.total_score,
        max_score: attempt?.max_score,
        percentage: attempt?.percentage,
        passed: attempt?.passed,
        status: (attempt as any)?.status,
        is_graded: (attempt as any)?.is_graded,
        time_spent_seconds: (attempt as any)?.time_spent_seconds,
        started_at: (attempt as any)?.started_at,
        submitted_at: (attempt as any)?.submitted_at,
        correct_count: correctCount,
        wrong_count: wrongCount,
        unanswered_count: unansweredCount,
        total_questions: realQuestions.length,
      },
      questions: (questions || []).map((q: any) => {
        const a = q.answer || answerByQuestion.get(String(q.id));
        const qOptions = q.options || [];
        const selectedOptionTexts = qOptions
          .filter((option: any) => (a?.selected_option_ids || []).includes(option.id))
          .map((option: any) => option.option_text);
        return {
          n: q.order_index,
          id: q.id,
          type: q.question_type,
          text: q.question_text,
          correct: q.correct_answer,
          options: qOptions.map((option: any) => ({ text: option.option_text, is_correct: option.is_correct })),
          explanation: q.explanation,
          marks: q.marks,
          student_answer: a?.answer_text || selectedOptionTexts.join("، ") || null,
          is_correct: a?.is_correct ?? null,
          marks_awarded: a?.marks_awarded ?? null,
          ai_feedback: a?.ai_feedback ?? null,
          time_spent_seconds: a?.time_spent_seconds ?? null,
        };
      }),
    };

    // 2) Reuse the SAME review conversation for this (exam, attempt) if it
    //    already exists — a student returning later must land back in the
    //    same session with full memory instead of a blank chat.
    try {
      const existing = await listConversations("review");
      const match = (existing || []).find((c: any) =>
        c?.context_json?.exam_id === examId && c?.context_json?.attempt_id === attemptId,
      );
      if (match) {
        // Refresh context so late-arriving grades / feedback are included.
        await supabase
          .from("modrek_ai_conversations")
          .update({ context_json: context as any })
          .eq("id", match.id);
        return match.id;
      }
    } catch {
      // fall through to create a new conversation
    }

    const conv = await createConversation({
      assistant_type: "review",
      title: `راجع امتحانك: ${exam?.title || ""}`.slice(0, 100),
      context_json: context,
    });
    return conv.id;
  };

  const start = async () => {
    if (convId || starting) { setOpen(true); return; }
    setStarting(true);
    try {
      const id = await buildContextAndConversation();
      if (id) setConvId(id);
      setOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل مراجعة الامتحان");
    } finally {
      setStarting(false);
    }
  };

  // Auto-open path (used when navigated from "ابدأ المراجعة مع Modrek AI").
  useEffect(() => {
    if (!autoOpen || bootstrapRef.current) return;
    bootstrapRef.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  if (!open) {
    return (
      <Card className="p-4 bg-gradient-to-br from-primary/10 via-purple-500/10 to-blue-500/10 border-primary/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold">راجع امتحانك مع Modrek AI</div>
              <div className="text-xs text-muted-foreground">اسأل عن أي سؤال، اطلب شرحًا، أو أنشئ امتحانًا يركز على أخطائك.</div>
            </div>
          </div>
          <Button onClick={start} disabled={starting} size="sm">
            {starting ? "جاري..." : "ابدأ المراجعة"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden h-[600px] relative">
      <ModrekChatWindow
        assistantType="review"
        conversationId={convId || undefined}
        onConversationCreated={setConvId}
        headerTitle="راجع امتحانك مع Modrek AI"
        inline
        onBack={() => setOpen(false)}
      />
    </Card>
  );
}
