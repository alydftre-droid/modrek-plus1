import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Exam, ExamQuestion, ExamAttempt } from "@/types/exam";
import { loadModrekTrainingQuestionsViaFunction, startModrekTrainingAttemptViaFunction } from "@/features/modrek-ai/api";

type ExamScopeFilters = { subjectId?: string; groupId?: string; term?: string; subSubjectId?: string };
const normalizeStudentSectionForExamFallback = (value?: string | null) => {
  const normalized = (value || "").trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
  if (normalized.includes("ادبي") || normalized.includes("literary") || normalized.includes("arts")) return "literary";
  return normalized;
};

// ----- STUDENT -----
async function getStudentPurchasedGroupIds(uid: string) {
  const { data, error } = await supabase
    .from("student_group_purchases")
    .select("group_id")
    .eq("student_id", uid);
  if (error) throw error;
  return [...new Set((data || []).map((row: any) => row.group_id).filter(Boolean))];
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
      if (filters?.subSubjectId) query = query.or(`sub_subject_id.eq.${filters.subSubjectId},sub_subject_id.is.null`);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
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

      if (filters?.groupId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("section")
          .eq("id", uid)
          .maybeSingle();
        const useLiteraryFallback = normalizeStudentSectionForExamFallback((profile as any)?.section) === "literary";

        const [{ data: examCatalog, error: examCatalogError }, { data: attempts, error: attemptsError }] = await Promise.all([
          useLiteraryFallback
            ? (supabase as any).rpc("get_literary_student_group_exam_catalog", {
                _group_id: filters.groupId,
              })
            : (supabase as any).rpc("get_student_group_exam_catalog", {
                _group_id: filters.groupId,
                _sub_subject_id: filters.subSubjectId || null,
              }),
          supabase
            .from("exam_attempts")
            .select("*")
            .eq("student_id", uid)
            .order("started_at", { ascending: false }),
        ]);

        if (examCatalogError) throw examCatalogError;
        if (attemptsError) throw attemptsError;

        return { exams: (examCatalog || []) as any[], attempts: attempts || [] } as any;
      }

      const groupIds = await getStudentPurchasedGroupIds(uid);
      const scopedGroupIds = groupIds;
      if (scopedGroupIds.length === 0) return { exams: [], attempts: [] };

      let examsQuery = supabase
        .from("exams")
        .select("*, subjects(name, category, stage, grade, section)")
        .eq("is_published", true)
        .eq("status", "published")
        .in("group_id", scopedGroupIds);
      if (filters?.subjectId && !filters?.groupId) examsQuery = examsQuery.eq("subject_id", filters.subjectId);
      if (filters?.term) examsQuery = examsQuery.eq("term", filters.term);
      if (filters?.subSubjectId) examsQuery = examsQuery.or(`sub_subject_id.eq.${filters.subSubjectId},sub_subject_id.is.null`);

      const [{ data: exams, error: examsError }, { data: attempts, error: attemptsError }] = await Promise.all([
        examsQuery.order("created_at", { ascending: false }),
        supabase
          .from("exam_attempts")
          .select("*")
          .eq("student_id", uid)
          .order("started_at", { ascending: false }),
      ]);
      if (examsError) throw examsError;
      if (attemptsError) throw attemptsError;
      return { exams: exams || [], attempts: attempts || [] } as any;
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

export function useExamReviewQuestions(attemptId: string | undefined) {
  return useQuery({
    queryKey: ["exam-review-questions", attemptId],
    enabled: !!attemptId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_review_questions", { _attempt_id: attemptId! } as any);
      if (error) throw error;
      return ((data as any) || []) as ExamQuestion[];
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
    queryKey: ["exam-attempt", attemptId],
    enabled: !!attemptId,
    staleTime: 0,
    refetchOnMount: "always",
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
      const { data: sessionData } = await supabase.auth.getSession();
      console.debug("[exam-debug] startExam.beforeRpc", {
        student_id: sessionData.session?.user?.id || null,
        exam_id: examId,
      });
      const { data, error } = await supabase.rpc("start_exam_attempt", { _exam_id: examId } as any);
      if (error) throw error;
      console.debug("[exam-debug] startExam.afterRpc", {
        student_id: sessionData.session?.user?.id || null,
        exam_id: examId,
        attempt_id: (data as any)?.attempt_id || null,
        created_at: (data as any)?.created_at || null,
        status: (data as any)?.status || null,
        response: data,
      });
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
      const { data: sessionData } = await supabase.auth.getSession();
      console.debug("[exam-debug] saveAnswer.beforeRpc", {
        student_id: sessionData.session?.user?.id || null,
        attempt_id: params.attemptId,
        question_id: params.questionId,
        selected_count: params.selectedOptionIds?.length || 0,
        has_text: Boolean(params.answerText && params.answerText.trim()),
      });
      const { data, error } = await supabase.rpc("save_exam_answer", {
        _attempt_id: params.attemptId,
        _question_id: params.questionId,
        _selected_option_ids: params.selectedOptionIds || [],
        _answer_text: params.answerText || null,
        _time_spent: params.timeSpent || 0,
        _flagged: params.flagged || false,
      } as any);
      if (error) throw error;
      console.debug("[exam-debug] saveAnswer.afterRpc", {
        student_id: sessionData.session?.user?.id || null,
        attempt_id: params.attemptId,
        question_id: params.questionId,
        response: data,
      });
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "تعذّر حفظ الإجابة");
      return data;
    },
  });
}

async function submitAttemptResilient(params: {
  attemptId?: string | null;
  examId?: string | null;
  answers?: Array<{
    questionId: string;
    selectedOptionIds?: string[];
    answerText?: string | null;
    flagged?: boolean;
  }>;
  tabSwitches?: number;
  fullscreenExits?: number;
  source?: string;
}) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!params.examId) {
    throw new Error("بيانات الامتحان غير مكتملة — لا يمكن التسليم بدون معرف الامتحان");
  }
  console.debug("[exam-debug] submitExam.beforeRpc", {
    student_id: sessionData.session?.user?.id || null,
    attempt_id: params.attemptId || null,
    exam_id: params.examId || null,
    answers_count: params.answers?.length || 0,
    source: params.source || "standard",
    rpc: "submit_exam_attempt_resilient",
  });
  const { data, error } = await supabase.rpc("submit_exam_attempt_resilient", {
    _exam_id: params.examId,
    _attempt_id: params.attemptId || null,
    _answers: params.answers || [],
    _tab_switches: params.tabSwitches || 0,
    _fullscreen_exits: params.fullscreenExits || 0,
  } as any);
  if (error) {
    console.debug("[exam-debug] submitExam.rpcError", {
      student_id: sessionData.session?.user?.id || null,
      attempt_id: params.attemptId || null,
      exam_id: params.examId || null,
      source: params.source || "standard",
      error,
    });
    throw error;
  }
  console.debug("[exam-debug] submitExam.afterRpc", {
    student_id: sessionData.session?.user?.id || null,
    attempt_id: params.attemptId || null,
    exam_id: params.examId || null,
    source: params.source || "standard",
    response: data,
  });
  if ((data as any)?.success === false) {
    const err: any = new Error((data as any)?.error || "تعذّر تسليم الامتحان");
    err.code = (data as any)?.code;
    err.response = data;
    throw err;
  }
  return data as any;
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      attemptId?: string | null;
      examId?: string | null;
      answers?: Array<{
        questionId: string;
        selectedOptionIds?: string[];
        answerText?: string | null;
        flagged?: boolean;
      }>;
      tabSwitches?: number;
      fullscreenExits?: number;
    }) => {
      return submitAttemptResilient({ ...params, source: "standard" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-attempts"] });
      qc.invalidateQueries({ queryKey: ["attempt"] });
      qc.invalidateQueries({ queryKey: ["exam-attempt"] });
      qc.invalidateQueries({ queryKey: ["attempt-answers"] });
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
      attemptId?: string | null;
      examId?: string | null;
      answers?: Array<{
        questionId: string;
        selectedOptionIds?: string[];
        answerText?: string | null;
        flagged?: boolean;
      }>;
      tabSwitches?: number;
      fullscreenExits?: number;
    }) => {
      return submitAttemptResilient({ ...params, source: "modrek-training" });
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("*")
        .eq("exam_id", examId!)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      const studentIds = [...new Set(rows.map((row) => row.student_id).filter(Boolean))];
      if (studentIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, student_code, avatar_url")
        .in("id", studentIds);
      const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
      return rows.map((row) => ({ ...row, profiles: profilesById.get(row.student_id) || null }));
    },
  });
}

export function useTeacherExamRoster(examId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-exam-roster", examId],
    enabled: !!examId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: rpcRoster, error: rpcError } = await (supabase as any).rpc("get_teacher_exam_roster", { _exam_id: examId! });
      if (!rpcError && rpcRoster) return rpcRoster as any;

      const { data: exam, error: examError } = await supabase
        .from("exams")
        .select("id, group_id, title, total_marks, pass_marks, duration_minutes")
        .eq("id", examId!)
        .maybeSingle();
      if (examError) throw examError;

      const [{ data: attempts, error: attemptsError }, { data: purchases, error: purchasesError }] = await Promise.all([
        supabase
          .from("exam_attempts")
          .select("*")
          .eq("exam_id", examId!)
          .order("started_at", { ascending: false }),
        exam?.group_id
          ? supabase
              .from("student_group_purchases")
              .select("student_id, purchased_at, group_id")
              .eq("group_id", exam.group_id)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (attemptsError) throw attemptsError;
      if (purchasesError) throw purchasesError;

      const attemptRows = (attempts || []) as any[];
      const purchaseRows = (purchases || []) as any[];
      const studentIds = [
        ...new Set([
          ...purchaseRows.map((row: any) => row.student_id),
          ...attemptRows.map((row: any) => row.student_id),
        ].filter(Boolean)),
      ];

      const [{ data: profiles }, { data: answerRows }] = await Promise.all([
        studentIds.length
          ? supabase
              .from("profiles")
              .select("id, full_name, student_code, avatar_url")
              .in("id", studentIds)
          : Promise.resolve({ data: [] } as any),
        attemptRows.length
          ? supabase
              .from("exam_answers")
              .select("attempt_id, answer_text, selected_option_ids, marks_awarded")
              .in("attempt_id", attemptRows.map((row: any) => row.id))
          : Promise.resolve({ data: [] } as any),
      ]);

      const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
      const purchasesByStudent = new Map(purchaseRows.map((row: any) => [row.student_id, row]));
      const answersByAttempt = new Map<string, { answered: number; marks: number }>();
      (answerRows || []).forEach((answer: any) => {
        const prev = answersByAttempt.get(answer.attempt_id) || { answered: 0, marks: 0 };
        const hasText = String(answer.answer_text || "").trim().length > 0;
        const hasChoice = Array.isArray(answer.selected_option_ids) && answer.selected_option_ids.length > 0;
        answersByAttempt.set(answer.attempt_id, {
          answered: prev.answered + (hasText || hasChoice ? 1 : 0),
          marks: prev.marks + Number(answer.marks_awarded || 0),
        });
      });

      const attemptsByStudent = new Map<string, any[]>();
      attemptRows.forEach((attempt: any) => {
        attemptsByStudent.set(attempt.student_id, [...(attemptsByStudent.get(attempt.student_id) || []), attempt]);
      });

      const completedStatuses = new Set(["submitted", "graded", "expired"]);
      const rows = studentIds.map((studentId) => {
        const studentAttempts = attemptsByStudent.get(studentId) || [];
        const completed = studentAttempts.find((attempt) => completedStatuses.has(attempt.status) || attempt.submitted_at);
        const active = studentAttempts.find((attempt) => attempt.status === "in_progress");
        const selectedAttempt = completed || active || null;
        const answerSummary = selectedAttempt ? answersByAttempt.get(selectedAttempt.id) : null;
        const solved = !!completed;
        return {
          student_id: studentId,
          profile: profilesById.get(studentId) || null,
          purchase: purchasesByStudent.get(studentId) || null,
          subscribed: purchasesByStudent.has(studentId),
          attempt: selectedAttempt,
          attempts_count: studentAttempts.length,
          solved,
          in_progress: !solved && !!active,
          absent: !solved,
          answered_count: answerSummary?.answered || 0,
          marks_total: answerSummary?.marks || Number(selectedAttempt?.total_score || 0),
        };
      });

      const solvedRows = rows.filter((row) => row.solved);
      const percentages = solvedRows.map((row) => Number(row.attempt?.percentage || 0));
      return {
        exam,
        rows,
        stats: {
          enrolled: purchaseRows.length || rows.length,
          solved: solvedRows.length,
          absent: rows.filter((row) => row.absent).length,
          inProgress: rows.filter((row) => row.in_progress).length,
          average: percentages.length ? Math.round(percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length) : 0,
          highest: percentages.length ? Math.round(Math.max(...percentages)) : 0,
          passCount: solvedRows.filter((row) => row.attempt?.passed).length,
        },
      } as any;
    },
  });
}
