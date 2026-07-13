import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import ModrekChatWindow from "./ChatWindow";
import { createConversation } from "./store";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  examId: string;
  attemptId: string;
}

/**
 * Post-exam review chat. Creates (once per attempt) a review conversation
 * whose context_json contains the whole exam + student answers so the AI
 * can discuss any question, explain mistakes, and generate follow-up exams.
 */
export default function PostExamReviewChat({ examId, attemptId }: Props) {
  const [convId, setConvId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (convId || starting) { setOpen(true); return; }
    setStarting(true);
    try {
      const [{ data: exam }, { data: questions }, { data: attempt }, { data: answers }] = await Promise.all([
        supabase.from("exams").select("id, title, description").eq("id", examId).maybeSingle(),
        supabase.from("exam_questions").select("id, order_index, question_type, question_text, correct_answer, explanation, marks").eq("exam_id", examId).order("order_index"),
        supabase.from("exam_attempts").select("id, total_score, max_score, percentage, passed").eq("id", attemptId).maybeSingle(),
        supabase.from("exam_answers").select("question_id, selected_option_ids, answer_text, is_correct, marks_awarded").eq("attempt_id", attemptId),
      ]);

      const questionIds = (questions || []).map((q: any) => q.id);
      const { data: realOptions } = questionIds.length
        ? await supabase.from("exam_question_options").select("id, question_id, option_text, is_correct").in("question_id", questionIds)
        : { data: [] as any[] };
      const optionsByQuestion = new Map<string, any[]>();
      (realOptions || []).forEach((option: any) => {
        optionsByQuestion.set(option.question_id, [...(optionsByQuestion.get(option.question_id) || []), option]);
      });

      const context = {
        title: `مراجعة: ${exam?.title || "الامتحان"}`,
        subject_name: exam?.title,
        exam_id: examId,
        attempt_id: attemptId,
        attempt_summary: attempt,
        questions: (questions || []).map((q: any) => {
          const a = (answers || []).find((x: any) => x.question_id === q.id);
          const qOptions = optionsByQuestion.get(q.id) || [];
          const selectedOptionTexts = qOptions
            .filter((option: any) => (a?.selected_option_ids || []).includes(option.id))
            .map((option: any) => option.option_text);
          return {
            n: q.order_index,
            type: q.question_type,
            text: q.question_text,
            correct: q.correct_answer,
            options: qOptions.map((option: any) => ({ text: option.option_text, is_correct: option.is_correct })),
            explanation: q.explanation,
            marks: q.marks,
            student_answer: a?.answer_text || selectedOptionTexts.join("، ") || null,
            is_correct: a?.is_correct ?? null,
            marks_awarded: a?.marks_awarded ?? null,
          };
        }),
      };

      const conv = await createConversation({
        assistant_type: "review",
        title: `راجع امتحانك: ${exam?.title || ""}`.slice(0, 100),
        context_json: context,
      });
      setConvId(conv.id);
      setOpen(true);
    } finally {
      setStarting(false);
    }
  };

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
        assistantType="study"
        conversationId={convId || undefined}
        onConversationCreated={setConvId}
        headerTitle="راجع امتحانك مع Modrek AI"
        inline
        onBack={() => setOpen(false)}
      />
    </Card>
  );
}
