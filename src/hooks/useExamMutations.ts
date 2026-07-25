import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EditorQuestion, EditorQType } from "@/components/exams/teacher/QuestionEditorCard";
import { normalizeEducationType } from "@/lib/educationSection";

type ExamGroupResolutionRow = {
  id: string;
  subject_id: string;
  term?: string | null;
  teacher_id?: string | null;
  created_by?: string | null;
  title?: string | null;
  month_label?: string | null;
};

function normalizeQuestionType(type: unknown): EditorQType {
  const raw = String(type ?? "").trim().toLowerCase();
  if (["tf", "truefalse", "true-false", "true false", "صح/خطأ", "صح وخطأ", "صح خطأ", "boolean"].includes(raw)) return "true_false";
  if (["mcq", "true_false", "short_answer", "essay", "fill_blank", "section"].includes(raw)) return raw as EditorQType;
  return "mcq";
}

function normalizeOptionValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(true|yes|correct|right|صحيح)$/, "صح")
    .replace(/^(false|no|wrong|incorrect|خطا|خطأ|غير صحيح)$/, "خطأ")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeChoiceQuestion(q: EditorQuestion): EditorQuestion {
  const type = normalizeQuestionType((q as any).type);
  if (type !== "mcq" && type !== "true_false") return { ...q, type };

  const fallbackOptions = type === "true_false" && q.options.length === 0
    ? [
        { id: crypto.randomUUID(), text: "صح", isCorrect: false },
        { id: crypto.randomUUID(), text: "خطأ", isCorrect: false },
      ]
    : q.options;

  const explicitAnswer = normalizeOptionValue(q.modelAnswer);
  const options = fallbackOptions.map((option, index) => ({
    ...option,
    text: option.text || (type === "true_false" ? (index === 0 ? "صح" : "خطأ") : `الخيار ${index + 1}`),
  }));
  const answerMatchedOption = explicitAnswer
    ? options.find((option) => normalizeOptionValue(option.text) === explicitAnswer)
    : undefined;
  const correctOption = answerMatchedOption || options.find((option) => option.isCorrect) || (type === "true_false" ? options[0] : undefined);

  return {
    ...q,
    type,
    modelAnswer: correctOption?.text || q.modelAnswer || "",
    options: options.map((option) => ({ ...option, isCorrect: Boolean(correctOption && option.id === correctOption.id) })),
  };
}

export interface ExamDraftPayload {
  title: string;
  description?: string | null;
  instructions?: string | null;
  duration_minutes: number;
  start_at?: string | null;
  end_at?: string | null;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  show_results_immediately?: boolean;
  show_correct_answers?: boolean;
  prevent_tab_switch?: boolean;
  require_fullscreen?: boolean;
  prevent_copy_paste?: boolean;
  max_cheat_exits?: number;
  prevent_reload?: boolean;
  random_snapshots?: boolean;
  max_attempts?: number;
  pass_marks?: number;
  is_ai_generated?: boolean;
  status?: "draft" | "published";
  is_published?: boolean;
  subject_id?: string;
  group_id?: string | null;
  sub_subject_id?: string | null;
  term?: string;
  target_education_type?: string | null;
  target_section?: string | null;
}

async function getTeacherDefaultSubject(uid: string) {
  // try latest content_group
  const { data } = await supabase
    .from("content_groups")
    .select("subject_id, id, term")
    .or(`teacher_id.eq.${uid},created_by.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.subject_id) return { subject_id: data.subject_id as string, group_id: (data as any).id as string, term: (data as any).term as string | null };
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
    if (sub) return { subject_id: sub.id as string, group_id: null, term: null };
  }
  return null;
}

async function resolveSiblingGroupForExam(params: {
  sourceGroupId: string;
  requestedSubjectId?: string | null;
  teacherId: string;
  fallbackTerm?: string | null;
}) {
  const { sourceGroupId, requestedSubjectId, teacherId, fallbackTerm } = params;
  const { data: sourceGroup, error: sourceError } = await supabase
    .from("content_groups")
    .select("id, subject_id, term, education_type, teacher_id, created_by, title, month_label")
    .eq("id", sourceGroupId)
    .or(`teacher_id.eq.${teacherId},created_by.eq.${teacherId}`)
    .maybeSingle();

  if (sourceError) throw sourceError;
  if (!sourceGroup?.subject_id) {
    throw new Error("تعذر تحديد المجموعة. افتح الامتحانات من داخل المجموعة المطلوبة مرة أخرى.");
  }

  const source = sourceGroup as ExamGroupResolutionRow & { education_type?: string | null };
  if (!requestedSubjectId || requestedSubjectId === source.subject_id) return source;

  const ownerId = source.teacher_id || source.created_by || teacherId;
  const siblingQuery = supabase
    .from("content_groups")
    .select("id, subject_id, term, education_type, teacher_id, created_by, title, month_label")
    .eq("subject_id", requestedSubjectId)
    .eq("is_active", true)
    .or(`teacher_id.eq.${ownerId},created_by.eq.${ownerId}`);

  const sourceTerm = source.term || fallbackTerm || null;
  if (sourceTerm) siblingQuery.eq("term", sourceTerm);

  const { data: siblings, error: siblingError } = await siblingQuery;
  if (siblingError) throw siblingError;

  const rows = ((siblings || []) as Array<ExamGroupResolutionRow & { education_type?: string | null }>).filter((group) => group.id);
  const sourceTitle = String(source.title || "").trim();
  const sourceMonth = String(source.month_label || "").trim();
  return (
    rows.find((group) => sourceMonth && String(group.month_label || "").trim() === sourceMonth) ||
    rows.find((group) => sourceTitle && String(group.title || "").trim() === sourceTitle) ||
    rows[0] ||
    source
  );
}

async function resolveSiblingSubSubjectForExam(params: {
  sourceSubSubjectId?: string | null;
  sourceGroupId?: string | null;
  targetGroupId?: string | null;
}) {
  const { sourceSubSubjectId, sourceGroupId, targetGroupId } = params;
  if (!sourceSubSubjectId || !sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) return sourceSubSubjectId || null;

  const { data: sourceSubSubject, error: sourceError } = await supabase
    .from("sub_subjects")
    .select("name")
    .eq("id", sourceSubSubjectId)
    .maybeSingle();

  if (sourceError) throw sourceError;
  const cleanName = String((sourceSubSubject as any)?.name || "").trim();
  if (!cleanName) return sourceSubSubjectId;

  const { data: targetSubSubject, error: targetError } = await supabase
    .from("sub_subjects")
    .select("id")
    .eq("group_id", targetGroupId)
    .eq("is_active", true)
    .eq("name", cleanName)
    .maybeSingle();

  if (targetError) throw targetError;
  return (targetSubSubject as any)?.id || sourceSubSubjectId;
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
      const sourceGroupId = group_id || null;
      let subSubjectId = payload.sub_subject_id ?? null;
      let term = payload.term;
      let targetEducationType = normalizeEducationType(payload.target_education_type) || null;
      if (!group_id) {
        throw new Error("يجب إنشاء الامتحان من داخل المجموعة المطلوبة حتى يظهر لطلابها فقط");
      }
      if (group_id) {
        const group = await resolveSiblingGroupForExam({
          sourceGroupId: group_id,
          requestedSubjectId: subject_id,
          teacherId: uid,
          fallbackTerm: term,
        });
        group_id = group.id;
        subject_id = group.subject_id as string;
        term = ((group as any)?.term as string | undefined) || term;
        subSubjectId = await resolveSiblingSubSubjectForExam({
          sourceSubSubjectId: subSubjectId,
          sourceGroupId,
          targetGroupId: group_id,
        });
      }
      if (!subject_id) {
        throw new Error("تعذر تحديد مادة المجموعة. افتح الامتحانات من داخل المجموعة مرة أخرى.");
      }
      if (!term) {
        throw new Error("تعذر تحديد ترم المجموعة. افتح الامتحان من داخل المجموعة الصحيحة مرة أخرى.");
      }
      const { data, error } = await supabase
        .from("exams")
        .insert({
          teacher_id: uid,
          subject_id,
          group_id: group_id ?? null,
          sub_subject_id: subSubjectId,
          title: payload.title || "امتحان جديد",
          description: payload.description ?? null,
          instructions: payload.instructions ?? null,
          duration_minutes: payload.duration_minutes ?? 60,
          total_marks: 0,
          pass_marks: payload.pass_marks ?? 50,
          start_at: payload.start_at ?? null,
          end_at: payload.end_at ?? null,
          shuffle_questions: payload.shuffle_questions ?? true,
          shuffle_options: payload.shuffle_options ?? true,
          show_results_immediately: payload.show_results_immediately ?? true,
          show_correct_answers: payload.show_correct_answers ?? true,
          prevent_tab_switch: payload.prevent_tab_switch ?? true,
          require_fullscreen: payload.require_fullscreen ?? true,
          prevent_copy_paste: payload.prevent_copy_paste ?? true,
          max_cheat_exits: payload.max_cheat_exits ?? 2,
          prevent_reload: payload.prevent_reload ?? true,
          random_snapshots: payload.random_snapshots ?? true,
          max_attempts: payload.max_attempts ?? 1,
          is_ai_generated: payload.is_ai_generated ?? false,
          status: payload.status ?? "draft",
          is_published: payload.is_published ?? false,
          term,
          target_education_type: targetEducationType,
          target_section: payload.target_section ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["teacher-exam-dashboard-stats"] });
    },
  });
}

export function useUpdateExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; patch: Partial<ExamDraftPayload & { total_marks: number }> }) => {
      const safePatch = { ...(params.patch as any) };
      delete safePatch.difficulty;
      const { data, error } = await supabase
        .from("exams")
        .update(safePatch)
        .eq("id", params.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["teacher-exam-dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["student-exams"] });
      qc.invalidateQueries({ queryKey: ["student-exam-catalog"] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["teacher-exam-dashboard-stats"] });
    },
  });
}

export function useReplaceExamQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { examId: string; questions: EditorQuestion[] }) => {
      const { examId, questions } = params;
      const normalizedQuestions = questions.map((q) => normalizeChoiceQuestion(q));

      const payload = normalizedQuestions.map((q) => ({
        type: q.type,
        text: q.text,
        marks: q.type === "section" ? 0 : (q.marks || 1),
        modelAnswer: q.modelAnswer ?? "",
        sectionTitle: q.sectionTitle || "",
        sectionTotal: Number(q.sectionTotal || 0),
        options: (q.options || []).map((o) => ({
          text: o.text,
          isCorrect: Boolean(o.isCorrect),
        })),
      }));

      const { data, error } = await (supabase as any).rpc("replace_exam_questions_atomic", {
        _exam_id: examId,
        _questions: payload,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error || "تعذر حفظ الأسئلة بشكل آمن");
      return { total_marks: Number(data?.total_marks || 0) };
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
      const { data: exam, error: examError } = await supabase
        .from("exams")
        .select("id, group_id")
        .eq("id", id)
        .maybeSingle();
      if (examError) throw examError;
      if (!exam?.group_id) throw new Error("لا يمكن نشر امتحان غير مرتبط بمجموعة محددة");

      const { count, error: questionsError } = await supabase
        .from("exam_questions")
        .select("id", { count: "exact", head: true })
        .eq("exam_id", id);
      if (questionsError) throw questionsError;
      if (!count) throw new Error("لا يمكن نشر امتحان بدون أسئلة");

      const { data, error } = await supabase
        .from("exams")
        .update({ status: "published", is_published: true })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["teacher-exams"] });
      qc.invalidateQueries({ queryKey: ["teacher-exam-dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["student-exams"] });
      qc.invalidateQueries({ queryKey: ["student-exam-catalog"] });
      qc.invalidateQueries({ queryKey: ["exam", data?.id] });
    },
  });
}
