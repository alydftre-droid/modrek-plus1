import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Exam, ExamQuestion, ExamAttempt } from "@/types/exam";

// ----- STUDENT -----
export function useStudentExams() {
  return useQuery({
    queryKey: ["student-exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*, subjects(name, category, stage, grade)")
        .eq("is_published", true)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useExam(examId: string | undefined) {
  return useQuery({
    queryKey: ["exam", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*, subjects(name, category)")
        .eq("id", examId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useExamQuestions(examId: string | undefined) {
  return useQuery({
    queryKey: ["exam-questions", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data: qs, error } = await supabase
        .from("exam_questions")
        .select("*, options:exam_question_options(*)")
        .eq("exam_id", examId!)
        .order("order_index");
      if (error) throw error;
      return (qs || []) as ExamQuestion[];
    },
  });
}

// Student-safe loader. Uses a SECURITY DEFINER RPC that strips correct answers,
// explanations, and is_correct flags so they can never reach the client during an active exam.
export function useStudentExamQuestions(examId: string | undefined) {
  return useQuery({
    queryKey: ["student-exam-questions", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: examId! } as any);
      if (error) throw error;
      return ((data as any) || []) as ExamQuestion[];
    },
  });
}

export function useMyAttempts(examId?: string) {
  return useQuery({
    queryKey: ["my-attempts", examId || "all"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      let q = supabase.from("exam_attempts").select("*").eq("student_id", uid).order("started_at", { ascending: false });
      if (examId) q = q.eq("exam_id", examId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ExamAttempt[];
    },
  });
}

export function useStartAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (examId: string) => {
      const { data, error } = await supabase.rpc("start_exam_attempt", { _exam_id: examId } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-attempts"] }),
  });
}

export function useSaveAnswer() {
  return useMutation({
    mutationFn: async (params: {
      attemptId: string;
      questionId: string;
      selectedOptionIds?: string[];
      answerText?: string;
      timeSpent?: number;
      flagged?: boolean;
    }) => {
      const { data, error } = await supabase.rpc("save_exam_answer", {
        _attempt_id: params.attemptId,
        _question_id: params.questionId,
        _selected_option_ids: params.selectedOptionIds || [],
        _answer_text: params.answerText || null,
        _time_spent: params.timeSpent || 0,
        _flagged: params.flagged || false,
      } as any);
      if (error) throw error;
      return data;
    },
  });
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { attemptId: string; tabSwitches?: number; fullscreenExits?: number }) => {
      const { data, error } = await supabase.rpc("submit_exam_attempt", {
        _attempt_id: params.attemptId,
        _tab_switches: params.tabSwitches || 0,
        _fullscreen_exits: params.fullscreenExits || 0,
      } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attempts"] });
      qc.invalidateQueries({ queryKey: ["exam-stats"] });
    },
  });
}

export function useStudentStats() {
  return useQuery({
    queryKey: ["exam-stats"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return null;
      const { data } = await supabase.from("exam_statistics").select("*").eq("student_id", uid).maybeSingle();
      return data as any;
    },
  });
}

export function useExamLeaderboard(examId: string | undefined) {
  return useQuery({
    queryKey: ["leaderboard", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_leaderboard", { _exam_id: examId!, _limit: 50 } as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useAttemptAnswers(attemptId: string | undefined) {
  return useQuery({
    queryKey: ["attempt-answers", attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_answers").select("*").eq("attempt_id", attemptId!);
      if (error) throw error;
      return data || [];
    },
  });
}

// ----- TEACHER -----
export function useTeacherExams() {
  return useQuery({
    queryKey: ["teacher-exams"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("exams")
        .select("*, subjects(name)")
        .eq("teacher_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useExamAttempts(examId: string | undefined) {
  return useQuery({
    queryKey: ["exam-attempts", examId],
    enabled: !!examId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("*, profiles!exam_attempts_student_id_fkey(full_name, student_code)")
        .eq("exam_id", examId!)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}
