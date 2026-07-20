import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Exam, ExamQuestion, ExamAttempt } from "@/types/exam";
import { normalizeEducationType, normalizeSectionForSubjects } from "@/lib/educationSection";
import { loadModrekTrainingQuestionsViaFunction, startModrekTrainingAttemptViaFunction, submitModrekTrainingAttemptViaFunction } from "@/features/modrek-ai/api";

type ExamScopeFilters = { subjectId?: string; groupId?: string; term?: string; subSubjectId?: string };
type StudentExamVisibilityProfile = { section?: string | null; education_type?: string | null } | null;

// ----- STUDENT -----
async function getStudentPurchasedGroupIds(uid: string) {
  const { data, error } = await supabase
    .from("student_group_purchases")
    .select("group_id")
    .eq("student_id", uid);
  if (error) throw error;
  return [...new Set((data || []).map((row: any) => row.group_id).filter(Boolean))];
}

async function getStudentExamVisibilityProfile(uid: string): Promise<StudentExamVisibilityProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("section, education_type")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw error;
  return (data as StudentExamVisibilityProfile) || null;
}

function examMatchesStudentTargets(exam: any, profile: StudentExamVisibilityProfile) {
  const targetEducationType = normalizeEducationType(exam?.target_education_type);
  if (targetEducationType) {
    const studentEducationType = normalizeEducationType(profile?.education_type);
    if (!studentEducationType || studentEducationType !== targetEducationType) return false;
  }

  const targetSection = normalizeSectionForSubjects(exam?.target_section);
  if (targetSection) {
    const studentSection = normalizeSectionForSubjects(profile?.section);
    if (!studentSection || studentSection !== targetSection) return false;
  }

  return true;
}

export function useStudentExams(filters?: ExamScopeFilters) {
  return useQuery({
    queryKey: ["student-exams", filters?.subjectId || "all", filters?.groupId || "all", filters?.term || "all", filters?.subSubjectId || "all"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      const groupIds = await getStudentPurchasedGroupIds(uid);
      const scopedGroupIds = filters?.groupId ? groupIds.filter((id) => id === filters.groupId) : groupIds;
      if (scopedGroupIds.length === 0) return [];

      let query = supabase
        .from("exams")
        .select("*, subjects(name, category, stage, grade, section)")
        .eq("is_published", true)
        .eq("status", "published")
        .in("group_id", scopedGroupIds);
      if (filters?.subjectId && !filters?.groupId) query = query.eq("subject_id", filters.subjectId);
      if (filters?.term) query = query.eq("term", filters.term);
      if (filters?.subSubjectId) query = query.eq("sub_subject_id", filters.subSubjectId);
      const [{ data, error }, profile] = await Promise.all([
        query.order("created_at", { ascending: false }),
        getStudentExamVisibilityProfile(uid),
      ]);
      if (error) throw error;
      return ((data || []) as any[]).filter((exam) => examMatchesStudentTargets(exam, profile));
    },
  });
}

export function useStudentExamCatalog(filters?: ExamScopeFilters) {
  return useQuery({
    queryKey: ["student-exam-catalog", filters?.subjectId || "all", filters?.groupId || "all", filters?.term || "all", filters?.subSubjectId || "all"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return { exams: [], attempts: [] };
      const groupIds = await getStudentPurchasedGroupIds(uid);
      const scopedGroupIds = filters?.groupId ? groupIds.filter((id) => id === filters.groupId) : groupIds;
      if (scopedGroupIds.length === 0) return { exams: [], attempts: [] };

      let examsQuery = supabase
        .from("exams")
        .select("*, subjects(name, category, stage, grade, section)")
        .eq("is_published", true)
        .eq("status", "published")
        .in("group_id", scopedGroupIds);
      if (filters?.subjectId && !filters?.groupId) examsQuery = examsQuery.eq("subject_id", filters.subjectId);
      if (filters?.term) examsQuery = examsQuery.eq("term", filters.term);
      if (filters?.subSubjectId) examsQuery = examsQuery.eq("sub_subject_id", filters.subSubjectId);

      const [{ data: exams, error: examsError }, { data: attempts, error: attemptsError }, profile] = await Promise.all([
        examsQuery.order("created_at", { ascending: false }),
        supabase
          .from("exam_attempts")
          .select("*")
          .eq("student_id", uid)
          .order("started_at", { ascending: false }),
        getStudentExamVisibilityProfile(uid),
      ]);
      if (examsError) throw examsError;
      if (attemptsError) throw attemptsError;
      return { exams: ((exams || []) as any[]).filter((exam) => examMatchesStudentTargets(exam, profile)), attempts: attempts || [] } as any;
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
        .select("*, subjects(name, category, stage, grade, section)")
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
export function useStudentExamQuestions(examId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["student-exam-questions", examId],
    enabled: !!examId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: examId! } as any);
      if (error) throw error;
      return ((data as any) || []) as ExamQuestion[];
    },
  });
}

export function useModrekTrainingQuestionsForAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: ["modrek-training-questions", attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      return (await loadModrekTrainingQuestionsViaFunction(attemptId!)) as ExamQuestion[];
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

export function useAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: ["attempt", attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_attempts").select("*").eq("id", attemptId!).maybeSingle();
      if (error) throw error;
      return data as ExamAttempt | null;
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

export function useStartModrekTrainingAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { examId: string; attemptId?: string | null }) => {
      return await startModrekTrainingAttemptViaFunction(params);
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
      qc.invalidateQueries({ queryKey: ["student-exams"] });
      qc.invalidateQueries({ queryKey: ["student-exam-catalog"] });
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["teacher-exam-dashboard-stats"] });
    },
  });
}

export function useSubmitModrekTrainingAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      attemptId: string;
      answers?: Array<{
        questionId: string;
        selectedOptionIds?: string[];
        answerText?: string | null;
        flagged?: boolean;
      }>;
      tabSwitches?: number;
      fullscreenExits?: number;
    }) => {
      return await submitModrekTrainingAttemptViaFunction(params);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attempts"] });
      qc.invalidateQueries({ queryKey: ["modrek-training-questions"] });
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
export function useTeacherExams(filters?: ExamScopeFilters) {
  return useQuery({
    queryKey: ["teacher-exams", filters?.subjectId || "all", filters?.groupId || "all", filters?.term || "all", filters?.subSubjectId || "all"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return [];
      let query = supabase
        .from("exams")
        .select("*, subjects(name, stage, grade, category, section)")
        .eq("teacher_id", uid);
      if (filters?.groupId) query = query.eq("group_id", filters.groupId);
      if (filters?.subjectId) query = query.eq("subject_id", filters.subjectId);
      if (filters?.term) query = query.eq("term", filters.term);
      if (filters?.subSubjectId) query = query.eq("sub_subject_id", filters.subSubjectId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      const examIds = rows.map((exam) => exam.id);
      if (examIds.length === 0) return rows;

      const { data: attempts, error: attemptsError } = await supabase
        .from("exam_attempts")
        .select("exam_id, student_id, percentage, passed, status")
        .in("exam_id", examIds)
        .in("status", ["submitted", "graded", "expired"] as any);
      if (attemptsError) throw attemptsError;

      const byExam = new Map<string, any[]>();
      (attempts || []).forEach((attempt: any) => byExam.set(attempt.exam_id, [...(byExam.get(attempt.exam_id) || []), attempt]));
      return rows.map((exam) => {
        const examAttempts = byExam.get(exam.id) || [];
        const percentages = examAttempts.map((a) => Number(a.percentage || 0));
        return {
          ...exam,
          actual_attempts_count: examAttempts.length,
          actual_students_count: new Set(examAttempts.map((a) => a.student_id)).size,
          actual_passed_count: examAttempts.filter((a) => a.passed).length,
          average_percentage: percentages.length ? Math.round(percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length) : 0,
          highest_percentage: percentages.length ? Math.round(Math.max(...percentages)) : 0,
        };
      });
    },
  });
}


export function useTeacherExamDashboardStats(filters?: ExamScopeFilters) {
  return useQuery({
    queryKey: ["teacher-exam-dashboard-stats", filters?.subjectId || "all", filters?.groupId || "all", filters?.term || "all", filters?.subSubjectId || "all"],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user?.id;
      if (!uid) return { attempts: [], average: 0, highest: 0, successRate: 0, students: 0 };

      let examsQuery = supabase.from("exams").select("id").eq("teacher_id", uid);
      if (filters?.groupId) examsQuery = examsQuery.eq("group_id", filters.groupId);
      if (filters?.subjectId) examsQuery = examsQuery.eq("subject_id", filters.subjectId);
      if (filters?.term) examsQuery = examsQuery.eq("term", filters.term);
      if (filters?.subSubjectId) examsQuery = examsQuery.eq("sub_subject_id", filters.subSubjectId);

      const { data: exams, error: examsError } = await examsQuery;
      if (examsError) throw examsError;
      const examIds = (exams || []).map((exam: any) => exam.id);
      if (examIds.length === 0) return { attempts: [], average: 0, highest: 0, successRate: 0, students: 0 };

      const { data: attempts, error } = await supabase
        .from("exam_attempts")
        .select("student_id, percentage, passed, status")
        .in("exam_id", examIds)
        .in("status", ["submitted", "graded", "expired"] as any);
      if (error) throw error;

      const rows = attempts || [];
      const percentages = rows.map((a: any) => Number(a.percentage || 0));
      const average = percentages.length ? Math.round(percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length) : 0;
      const highest = percentages.length ? Math.round(Math.max(...percentages)) : 0;
      const successRate = rows.length ? Math.round((rows.filter((a: any) => a.passed).length / rows.length) * 100) : 0;
      const students = new Set(rows.map((a: any) => a.student_id)).size;
      return { attempts: rows, average, highest, successRate, students };
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
