WITH target AS (
  SELECT ans.id, ans.attempt_id, ans.question_id, q.question_type, ans.answer_text, q.correct_answer, q.marks, ans.marks_awarded
  FROM public.exam_answers ans
  JOIN public.exam_questions q ON q.id = ans.question_id
  WHERE q.question_type IN ('short_answer','essay')
    AND ans.ai_feedback IS NOT NULL
), repaired AS (
  UPDATE public.exam_answers ans
  SET ai_feedback = CASE
    WHEN coalesce(trim(t.answer_text), '') = '' THEN 'لم يقدم الطالب إجابة لهذا السؤال.'
    WHEN coalesce(t.marks_awarded, 0) >= coalesce(t.marks, 0) THEN 'إجابة صحيحة لهذا السؤال.'
    WHEN coalesce(t.marks_awarded, 0) > 0 THEN 'إجابة جزئية لهذا السؤال وتم احتساب الدرجة حسب عناصر الإجابة الصحيحة.'
    ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية لهذا السؤال.'
  END
  FROM target t
  WHERE ans.id = t.id
  RETURNING ans.attempt_id, ans.question_id
), affected AS (
  SELECT attempt_id, count(*) AS repaired_count FROM repaired GROUP BY attempt_id
)
INSERT INTO public.exam_attempt_debug_logs(stage, student_id, exam_id, attempt_id, payload)
SELECT
  'repair.ai_feedback_reset_by_question_id',
  ea.student_id,
  ea.exam_id,
  a.attempt_id,
  jsonb_build_object(
    'repaired_count', a.repaired_count,
    'reason', 'removed legacy shifted feedback and regenerated neutral per-row feedback by exam_answers.question_id',
    'uses_array_index', false
  )
FROM affected a
JOIN public.exam_attempts ea ON ea.id = a.attempt_id;