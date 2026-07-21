CREATE OR REPLACE FUNCTION public.exam_meaningful_tokens(_value text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  words text[] := regexp_split_to_array(public.normalize_exam_grading_text(_value), '\s+');
  result text[] := ARRAY[]::text[];
  word text;
  token text;
  stop_words text[] := ARRAY['من','في','على','علي','عن','الى','الي','ان','إن','أن','هو','هي','هما','هم','هن','هذا','هذه','ذلك','تلك','الذي','التي','الذين','او','أو','و','ثم','كما','كل','اي','أي','لا','لم','لن','ما','مع','بين','عند','اذا','إذا','كان','كانت','يكون','تكون','قد','لقد','حتى','حتي','فقط','غير','بعد','قبل','خلال','حول','له','لها','به','بها','فيها','سؤال','السؤال','سوال','السوال','اجابه','اجابة','اعرف','ادري','اعلم','اجب','اجيب','صلاه','صلا'];
BEGIN
  FOREACH word IN ARRAY words LOOP
    token := public.normalize_exam_semantic_token(word);
    IF length(token) >= 3 AND NOT token = ANY(stop_words) AND NOT token = ANY(result) THEN
      result := array_append(result, token);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

UPDATE public.exam_answers ea
SET marks_awarded = public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks),
    is_correct = public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks) >= COALESCE(q.marks, 0),
    auto_graded = true,
    ai_feedback = CASE
      WHEN public.is_exam_non_answer(ea.answer_text) THEN 'لم يقدم الطالب إجابة قابلة للتصحيح لهذا السؤال.'
      WHEN public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks) >= COALESCE(q.marks, 0) THEN 'إجابة صحيحة بالمعنى.'
      WHEN public.smart_exam_text_score(ea.answer_text, q.correct_answer, q.marks) > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.'
      ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.' END
FROM public.exam_questions q
JOIN public.exams e ON e.id = q.exam_id
WHERE q.id = ea.question_id
  AND e.group_id IS NOT NULL
  AND q.question_type::text IN ('short_answer','fill_blank','essay')
  AND COALESCE(trim(q.correct_answer), '') <> '';

WITH totals AS (
  SELECT ea.attempt_id, COALESCE(sum(ea.marks_awarded), 0) AS total_score
  FROM public.exam_answers ea
  WHERE ea.attempt_id IN (
    SELECT DISTINCT ea2.attempt_id
    FROM public.exam_answers ea2
    JOIN public.exam_questions q2 ON q2.id = ea2.question_id
    JOIN public.exams e2 ON e2.id = q2.exam_id
    WHERE e2.group_id IS NOT NULL AND q2.question_type::text IN ('short_answer','fill_blank','essay')
  )
  GROUP BY ea.attempt_id
)
UPDATE public.exam_attempts at
SET total_score = totals.total_score,
    percentage = CASE WHEN COALESCE(at.max_score, 0) > 0 THEN round((totals.total_score / at.max_score) * 100, 2) ELSE 0 END,
    passed = totals.total_score >= COALESCE((SELECT pass_marks FROM public.exams e WHERE e.id = at.exam_id), 0),
    updated_at = now()
FROM totals
WHERE totals.attempt_id = at.id;

REVOKE ALL ON FUNCTION public.exam_meaningful_tokens(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_meaningful_tokens(text) TO authenticated, service_role;