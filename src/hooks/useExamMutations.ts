import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EditorQuestion } from "@/components/exams/teacher/QuestionEditorCard";

export interface ExamDraftPayload {
  title: string;
  description?: string | null;
  instructions?: string | null;
  duration_minutes: number;
  start_at?: string | null;
  end_at?: string | null;
  difficulty?: "easy" | "medium" | "hard";
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  show_results_immediately?: boolean;
  show_correct_answers?: boolean;
  prevent_tab_switch?: boolean;
  require_fullscreen?: boolean;
  prevent_copy_paste?: boolean;
  max_attempts?: number;
  pass_marks?: number;
  is_ai_generated?: boolean;
  status?: "draft" | "published";
  is_published?: boolean;
  subject_id?: string;
  group_id?: string | null;
}

async function getTeacherDefaultSubject(uid: string) {
  // try latest content_group
  const { data } = await supabase
    .from("content_groups")
    .select("subject_id, id")
    .eq("teacher_id", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.subject_id) return { subject_id: data.subject_id as string, group_id: (data as any).id as string };
  const { data: a } = await supabase
    .from("teacher_assignments")
    .select("stage, grade, category")
    .eq("teacher_id", uid)
    .limit(1)
    .maybeSingle();
  if (a) {
    const { data: sub } = await supabase
      .from("subjects")
      .select("id")
      .eq("stage", a.stage)
      .eq("grade", a.grade)
      .limit(1)
      .maybeSingle();
    if (sub) return { subject_id: sub.id as string, group_id: null };
  }
  return null;
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ExamDraftPayload) => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) throw new Error("غير مسجل");
      let subject_id = payload.subject_id;
      let group_id: string | null | undefined = payload.group_id;
      if (!subject_id) {
        const def = await getTeacherDefaultSubject(uid);
        if (!def) throw new Error("لا توجد مادة مرتبطة بحسابك. أضف مجموعة محتوى أولاً.");
        subject_id = def.subject_id;
        group_id = def.group_id;
      }
      const { data, error } = await supabase
        .from("exams")
        .insert({
          teacher_id: uid,
          subject_id,
          group_id: group_id ?? null,
          title: payload.title || "امتحان جديد",
          description: payload.description ?? null,
          instructions: payload.instructions ?? null,
          duration_minutes: payload.duration_minutes ?? 60,
          total_marks: 0,
          pass_marks: payload.pass_marks ?? 50,
          start_at: payload.start_at ?? null,
          end_at: payload.end_at ?? null,
          difficulty: payload.difficulty ?? "medium",
          shuffle_questions: payload.shuffle_questions ?? true,
          shuffle_options: payload.shuffle_options ?? true,
          show_results_immediately: payload.show_results_immediately ?? true,
          show_correct_answers: payload.show_correct_answers ?? true,
          prevent_tab_switch: payload.prevent_tab_switch ?? true,
          require_fullscreen: payload.require_fullscreen ?? true,
          prevent_copy_paste: payload.prevent_copy_paste ?? true,
          max_attempts: payload.max_attempts ?? 1,
          is_ai_generated: payload.is_ai_generated ?? false,
          status: payload.status ?? "draft",
          is_published: payload.is_published ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-exams"] }),
  });
}

export function useUpdateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; patch: Partial<ExamDraftPayload & { total_marks: number }> }) => {
      const { data, error } = await supabase
        .from("exams")
        .update(params.patch as any)
        .eq("id", params.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["exam", v.id] });
    },
  });
}

export function useDeleteExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-exams"] }),
  });
}

export function useReplaceExamQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { examId: string; questions: EditorQuestion[] }) => {
      const { examId, questions } = params;
      // wipe existing questions (cascade removes options)
      const { error: delErr } = await supabase.from("exam_questions").delete().eq("exam_id", examId);
      if (delErr) throw delErr;
      if (questions.length === 0) return { total_marks: 0 };

      const rows = questions.map((q, i) => ({
        exam_id: examId,
        order_index: i,
        question_type: q.type,
        question_text: q.text,
        marks: q.marks || 1,
        difficulty: "medium" as const,
        correct_answer: q.modelAnswer ?? null,
      }));
      const { data: inserted, error } = await supabase.from("exam_questions").insert(rows).select();
      if (error) throw error;

      // insert options
      const optRows: any[] = [];
      questions.forEach((q, qi) => {
        const dbq = inserted![qi];
        if (q.type === "mcq" || q.type === "true_false") {
          q.options.forEach((o, oi) => {
            optRows.push({
              question_id: dbq.id,
              order_index: oi,
              option_text: o.text || (q.type === "true_false" ? (oi === 0 ? "صح" : "خطأ") : `الخيار ${oi + 1}`),
              is_correct: o.isCorrect,
            });
          });
        }
      });
      if (optRows.length) {
        const { error: optErr } = await supabase.from("exam_question_options").insert(optRows);
        if (optErr) throw optErr;
      }

      const total_marks = questions.reduce((a, q) => a + (q.marks || 0), 0);
      await supabase.from("exams").update({ total_marks }).eq("id", examId);
      return { total_marks };
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["exam-questions", v.examId] });
      qc.invalidateQueries({ queryKey: ["exam", v.examId] });
    },
  });
}

export function usePublishExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("exams")
        .update({ status: "published", is_published: true })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["student-exams"] });
    },
  });
}
