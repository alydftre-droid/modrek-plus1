CREATE OR REPLACE FUNCTION public.smart_exam_text_score(_answer text, _model text, _max_score numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  a text := public.normalize_exam_grading_text(_answer);
  m text := public.normalize_exam_grading_text(_model);
  a_meaningful text[] := ARRAY[]::text[];
  m_meaningful text[] := ARRAY[]::text[];
  a_numbers text[] := ARRAY[]::text[];
  m_numbers text[] := ARRAY[]::text[];
  common_count integer := 0;
  a_count integer := 0;
  m_count integer := 0;
  answer_coverage numeric := 0;
  model_coverage numeric := 0;
  combined numeric := 0;
  word text;
  a_words text[];
  m_words text[];
BEGIN
  IF coalesce(_max_score, 0) <= 0 OR a = '' OR m = '' THEN RETURN 0; END IF;
  IF public.is_exam_non_answer(_answer) THEN RETURN 0; END IF;

  IF public.normalize_exam_semantic_token(a) = public.normalize_exam_semantic_token(m) THEN
    RETURN round(_max_score::numeric, 2);
  END IF;

  a_meaningful := public.exam_meaningful_tokens(_answer);
  m_meaningful := public.exam_meaningful_tokens(_model);
  a_count := cardinality(a_meaningful);
  m_count := cardinality(m_meaningful);

  a_words := regexp_split_to_array(a, '\s+');
  m_words := regexp_split_to_array(m, '\s+');
  FOREACH word IN ARRAY a_words LOOP
    IF word ~ '^[0-9]+$' THEN a_numbers := array_append(a_numbers, word); END IF;
  END LOOP;
  FOREACH word IN ARRAY m_words LOOP
    IF word ~ '^[0-9]+$' THEN m_numbers := array_append(m_numbers, word); END IF;
  END LOOP;

  IF m_count = 0 OR a_count = 0 THEN RETURN 0; END IF;
  IF a = m THEN RETURN round(_max_score::numeric, 2); END IF;

  IF m_count <= 4 AND (position(a in m) > 0 OR position(m in a) > 0) THEN
    IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
      RETURN round((_max_score * 0.40)::numeric, 2);
    END IF;
    RETURN round(_max_score::numeric, 2);
  END IF;

  FOREACH word IN ARRAY a_meaningful LOOP
    IF word = ANY(m_meaningful) THEN common_count := common_count + 1; END IF;
  END LOOP;
  IF common_count = 0 THEN RETURN 0; END IF;

  answer_coverage := common_count::numeric / a_count::numeric;
  model_coverage := common_count::numeric / m_count::numeric;
  combined := greatest(model_coverage, least(answer_coverage, model_coverage + 0.35));

  IF cardinality(m_numbers) > 0 AND cardinality(a_numbers) > 0 AND NOT (a_numbers && m_numbers) THEN
    combined := least(combined, 0.45);
  END IF;

  RETURN round((CASE
    WHEN combined >= 0.85 AND model_coverage >= 0.55 THEN _max_score
    WHEN combined >= 0.65 THEN _max_score * 0.80
    WHEN combined >= 0.45 THEN _max_score * 0.60
    WHEN combined >= 0.28 THEN _max_score * 0.40
    WHEN combined >= 0.12 THEN _max_score * 0.20
    ELSE 0 END)::numeric, 2);
END;
$$;

WITH text_answers AS (
  SELECT
    ea.id AS answer_id,
    ea.attempt_id,
    ea.answer_text,
    q.correct_answer,
    COALESCE(q.marks, 0) AS max_score,
    public.smart_exam_text_score(ea.answer_text, q.correct_answer, COALESCE(q.marks, 0)) AS new_score
  FROM public.exam_answers ea
  JOIN public.exam_questions q ON q.id = ea.question_id
  JOIN public.exam_attempts at ON at.id = ea.attempt_id
  JOIN public.exams e ON e.id = q.exam_id
  WHERE q.question_type::text IN ('short_answer','fill_blank','essay')
    AND e.group_id IS NOT NULL
    AND at.status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status)
), repaired AS (
  UPDATE public.exam_answers ea
  SET marks_awarded = ta.new_score,
      is_correct = ta.new_score >= ta.max_score,
      auto_graded = COALESCE(trim(ta.correct_answer), '') <> '',
      ai_feedback = public.exam_text_feedback(ta.answer_text, ta.correct_answer, ta.new_score, ta.max_score)
  FROM text_answers ta
  WHERE ea.id = ta.answer_id
  RETURNING ea.attempt_id
), totals AS (
  SELECT ea.attempt_id, COALESCE(sum(ea.marks_awarded), 0) AS total_score, COALESCE(sum(q.marks), 0) AS max_score
  FROM public.exam_answers ea
  JOIN public.exam_questions q ON q.id = ea.question_id AND q.question_type::text <> 'section'
  WHERE ea.attempt_id IN (SELECT DISTINCT attempt_id FROM repaired)
  GROUP BY ea.attempt_id
), updated_attempts AS (
  UPDATE public.exam_attempts at
  SET total_score = totals.total_score,
      max_score = CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END,
      percentage = CASE WHEN COALESCE(CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END, 0) > 0 THEN round((totals.total_score / (CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END)) * 100, 2) ELSE 0 END,
      passed = totals.total_score >= COALESCE((SELECT pass_marks FROM public.exams e WHERE e.id = at.exam_id), 0),
      updated_at = now()
  FROM totals
  WHERE totals.attempt_id = at.id
  RETURNING at.id, at.student_id, at.exam_id
), audit AS (
  SELECT attempt_id, count(*) AS repaired_count
  FROM repaired
  GROUP BY attempt_id
)
INSERT INTO public.exam_attempt_debug_logs(stage, student_id, exam_id, attempt_id, payload)
SELECT
  'repair.text_grading_direct_semantic_score',
  ua.student_id,
  ua.exam_id,
  ua.id,
  jsonb_build_object(
    'repaired_count', audit.repaired_count,
    'mapping_strategy', 'exam_answers.question_id -> exam_questions.id',
    'uses_question_id', true,
    'uses_array_index', false,
    'direct_semantic_match', true
  )
FROM audit
JOIN updated_attempts ua ON ua.id = audit.attempt_id;

REVOKE ALL ON FUNCTION public.smart_exam_text_score(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO authenticated, service_role;