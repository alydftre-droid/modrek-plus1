CREATE OR REPLACE FUNCTION public.get_exam_review_questions(_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_authorized boolean := false;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = _attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found';
  END IF;

  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = v_attempt.exam_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exam not found';
  END IF;

  v_authorized := (
    (v_attempt.student_id = v_uid AND v_attempt.submitted_at IS NOT NULL)
    OR v_exam.teacher_id = v_uid
    OR public.has_role(v_uid, 'admin'::public.app_role)
  );

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'exam_id', q.exam_id,
      'order_index', q.order_index,
      'question_type', q.question_type,
      'question_text', q.question_text,
      'image_url', q.image_url,
      'marks', q.marks,
      'explanation', q.explanation,
      'difficulty', q.difficulty,
      'correct_answer', q.correct_answer,
      'options', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id,
          'question_id', o.question_id,
          'order_index', o.order_index,
          'option_text', o.option_text,
          'image_url', o.image_url,
          'is_correct', o.is_correct
        ) ORDER BY o.order_index)
        FROM public.exam_question_options o
        WHERE o.question_id = q.id
      ), '[]'::jsonb)
    ) ORDER BY q.order_index
  ), '[]'::jsonb)
  INTO v_result
  FROM public.exam_questions q
  WHERE q.exam_id = v_attempt.exam_id;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_review_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_review_questions(uuid) TO authenticated, service_role;