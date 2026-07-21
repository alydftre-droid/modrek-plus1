CREATE OR REPLACE FUNCTION public.save_exam_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option_ids uuid[] DEFAULT '{}'::uuid[],
  _answer_text text DEFAULT NULL,
  _time_spent integer DEFAULT 0,
  _flagged boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_question public.exam_questions%ROWTYPE;
  v_selected uuid[] := COALESCE(_selected_option_ids, '{}'::uuid[]);
  v_invalid_option_count integer := 0;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_attempt
  FROM public.exam_attempts
  WHERE id = _attempt_id
    AND student_id = v_student
    AND status = 'in_progress'::public.exam_attempt_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'attempt_not_found', 'code', 'attempt_not_found');
  END IF;

  SELECT * INTO v_question
  FROM public.exam_questions
  WHERE id = _question_id
    AND exam_id = v_attempt.exam_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'question_not_found', 'code', 'question_not_found');
  END IF;

  SELECT count(*) INTO v_invalid_option_count
  FROM unnest(v_selected) selected_id
  LEFT JOIN public.exam_question_options option_row
    ON option_row.id = selected_id
   AND option_row.question_id = _question_id
  WHERE option_row.id IS NULL;

  IF v_invalid_option_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_option_for_question', 'code', 'invalid_option_for_question');
  END IF;

  INSERT INTO public.exam_answers (
    attempt_id,
    question_id,
    selected_option_ids,
    answer_text,
    is_correct,
    marks_awarded,
    auto_graded,
    ai_feedback,
    time_spent_seconds,
    flagged_for_review,
    answered_at
  ) VALUES (
    _attempt_id,
    _question_id,
    v_selected,
    _answer_text,
    NULL,
    0,
    false,
    NULL,
    COALESCE(_time_spent, 0),
    COALESCE(_flagged, false),
    now()
  )
  ON CONFLICT (attempt_id, question_id) DO UPDATE
  SET selected_option_ids = EXCLUDED.selected_option_ids,
      answer_text = EXCLUDED.answer_text,
      is_correct = NULL,
      marks_awarded = 0,
      auto_graded = false,
      ai_feedback = NULL,
      time_spent_seconds = public.exam_answers.time_spent_seconds + COALESCE(_time_spent, 0),
      flagged_for_review = EXCLUDED.flagged_for_review,
      answered_at = now();

  PERFORM public.log_exam_attempt_debug('answer.saved_without_grading', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object(
    'question_id', _question_id,
    'selected_option_ids', v_selected,
    'uses_question_id', true,
    'uses_array_index', false,
    'grading_deferred_to_submit', true
  ));

  RETURN jsonb_build_object('success', true, 'code', 'saved_without_grading');
END;
$$;

REVOKE ALL ON FUNCTION public.save_exam_answer(uuid, uuid, uuid[], text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid[], text, integer, boolean) TO authenticated, service_role;