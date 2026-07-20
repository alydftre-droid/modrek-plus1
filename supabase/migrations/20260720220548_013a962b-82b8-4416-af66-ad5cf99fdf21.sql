CREATE OR REPLACE FUNCTION public.submit_exam_attempt_resilient(
  _exam_id uuid DEFAULT NULL::uuid,
  _attempt_id uuid DEFAULT NULL::uuid,
  _answers jsonb DEFAULT '[]'::jsonb,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_direct_attempt public.exam_attempts%ROWTYPE;
  v_direct_found boolean := false;
  v_found boolean := false;
  v_recovered boolean := false;
  v_submit jsonb;
  v_answer jsonb;
  v_question_id uuid;
  v_selected uuid[];
  v_answer_text text;
  v_flagged boolean;
  v_attempt_row_json jsonb := NULL;
  v_answers_count integer := CASE WHEN jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(_answers, '[]'::jsonb)) ELSE 0 END;
  v_latest_in_progress_count integer := 0;
  v_latest_any_attempt public.exam_attempts%ROWTYPE;
BEGIN
  PERFORM public.log_exam_attempt_debug('submit.received', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'answers_count', v_answers_count));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT count(*) INTO v_latest_in_progress_count
  FROM public.exam_attempts
  WHERE student_id = v_student
    AND status = 'in_progress'::public.exam_attempt_status;

  SELECT * INTO v_latest_any_attempt
  FROM public.exam_attempts
  WHERE student_id = v_student
  ORDER BY COALESCE(updated_at, submitted_at, completed_at, started_at, created_at) DESC
  LIMIT 1;

  IF _exam_id IS NULL AND _attempt_id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      _exam_id := v_attempt.exam_id;
      _attempt_id := v_attempt.id;
      v_found := true;
      v_recovered := true;
      PERFORM public.log_exam_attempt_debug('submit.recovered_latest_without_context', v_student, _exam_id, _attempt_id, jsonb_build_object('reason', 'missing_exam_and_attempt'));
    ELSE
      PERFORM public.log_exam_attempt_debug('submit.rejected.missing_context', v_student, NULL, NULL, jsonb_build_object('latest_in_progress_count', v_latest_in_progress_count, 'latest_any_attempt', CASE WHEN v_latest_any_attempt.id IS NOT NULL THEN to_jsonb(v_latest_any_attempt) ELSE NULL END));
      RETURN jsonb_build_object('success', false, 'error', 'بيانات المحاولة غير مكتملة', 'code', 'missing_attempt_context', 'received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'latest_in_progress_count', v_latest_in_progress_count, 'latest_any_attempt_status', v_latest_any_attempt.status, 'latest_any_attempt_id', v_latest_any_attempt.id);
    END IF;
  END IF;

  IF _attempt_id IS NOT NULL AND NOT v_found THEN
    SELECT * INTO v_direct_attempt
    FROM public.exam_attempts
    WHERE id = _attempt_id
    LIMIT 1;
    v_direct_found := FOUND;

    IF v_direct_found THEN
      v_attempt_row_json := to_jsonb(v_direct_attempt);
      IF v_direct_attempt.student_id = v_student AND _exam_id IS NULL THEN
        _exam_id := v_direct_attempt.exam_id;
      END IF;
    END IF;

    IF v_direct_found
       AND v_direct_attempt.student_id = v_student
       AND (_exam_id IS NULL OR v_direct_attempt.exam_id = _exam_id) THEN
      IF v_direct_attempt.status = 'in_progress'::public.exam_attempt_status THEN
        v_attempt := v_direct_attempt;
        v_found := true;
      ELSIF v_direct_attempt.status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status, 'expired'::public.exam_attempt_status) THEN
        PERFORM public.log_exam_attempt_debug('submit.already_submitted_direct', v_student, v_direct_attempt.exam_id, v_direct_attempt.id, jsonb_build_object('status', v_direct_attempt.status, 'received_exam_id', _exam_id, 'received_attempt_id', _attempt_id));
        RETURN jsonb_build_object(
          'success', true,
          'attempt_id', v_direct_attempt.id,
          'resolved_attempt_id', v_direct_attempt.id,
          'student_id', v_student,
          'exam_id', v_direct_attempt.exam_id,
          'attempt_row', to_jsonb(v_direct_attempt),
          'already_submitted', true,
          'recovered_attempt', true,
          'code', 'already_submitted'
        );
      END IF;
    END IF;
  END IF;

  IF (NOT v_found OR v_attempt.status <> 'in_progress'::public.exam_attempt_status) AND _exam_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE exam_id = _exam_id
      AND student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      v_found := true;
      v_recovered := true;
    ELSE
      v_found := false;
    END IF;
  END IF;

  IF NOT v_found AND _exam_id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      _exam_id := v_attempt.exam_id;
      v_found := true;
      v_recovered := true;
    END IF;
  END IF;

  IF NOT v_found AND _exam_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE exam_id = _exam_id
      AND student_id = v_student
      AND status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status, 'expired'::public.exam_attempt_status)
    ORDER BY COALESCE(submitted_at, completed_at, started_at, created_at) DESC
    LIMIT 1;
    IF FOUND THEN
      PERFORM public.log_exam_attempt_debug('submit.already_submitted_by_exam', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('status', v_attempt.status, 'received_exam_id', _exam_id, 'received_attempt_id', _attempt_id));
      RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'student_id', v_student, 'exam_id', v_attempt.exam_id, 'attempt_row', to_jsonb(v_attempt), 'already_submitted', true, 'recovered_attempt', true, 'code', 'already_submitted');
    END IF;
  END IF;

  IF NOT v_found THEN
    PERFORM public.log_exam_attempt_debug('submit.failed.attempt_not_found', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'direct_attempt_row', v_attempt_row_json, 'latest_in_progress_count', v_latest_in_progress_count, 'latest_any_attempt', CASE WHEN v_latest_any_attempt.id IS NOT NULL THEN to_jsonb(v_latest_any_attempt) ELSE NULL END));
    RETURN jsonb_build_object(
      'success', false,
      'error', 'محاولة غير صالحة',
      'code', 'attempt_not_found',
      'received_attempt_id', _attempt_id,
      'received_exam_id', _exam_id,
      'received_student_id', v_student,
      'direct_attempt_row', v_attempt_row_json,
      'latest_in_progress_count', v_latest_in_progress_count,
      'latest_any_attempt_status', v_latest_any_attempt.status,
      'latest_any_attempt_id', v_latest_any_attempt.id,
      'root_cause', CASE
        WHEN v_direct_found AND v_direct_attempt.student_id <> v_student THEN 'attempt_belongs_to_different_student'
        WHEN v_direct_found AND _exam_id IS NOT NULL AND v_direct_attempt.exam_id <> _exam_id THEN 'attempt_exam_mismatch'
        WHEN NOT v_direct_found AND _attempt_id IS NOT NULL THEN 'attempt_id_not_present_in_database'
        WHEN _exam_id IS NOT NULL THEN 'no_attempt_for_exam_and_student'
        ELSE 'no_active_attempt_for_student'
      END
    );
  END IF;

  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'attempt_id', v_attempt.id,
      'resolved_attempt_id', v_attempt.id,
      'student_id', v_student,
      'exam_id', v_attempt.exam_id,
      'attempt_row', to_jsonb(v_attempt),
      'already_submitted', true,
      'recovered_attempt', v_recovered,
      'code', 'already_submitted'
    );
  END IF;

  PERFORM public.log_exam_attempt_debug('submit.resolved', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('received_attempt_id', _attempt_id, 'resolved_attempt_id', v_attempt.id, 'recovered', v_recovered, 'answers_count', v_answers_count));

  IF jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN
    FOR v_answer IN SELECT * FROM jsonb_array_elements(COALESCE(_answers, '[]'::jsonb))
    LOOP
      BEGIN
        v_question_id := NULLIF(v_answer->>'questionId', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_question_id := NULL;
      END;
      IF v_question_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[]) INTO v_selected
      FROM jsonb_array_elements_text(COALESCE(v_answer->'selectedOptionIds', '[]'::jsonb)) AS value;
      v_answer_text := NULLIF(v_answer->>'answerText', '');
      v_flagged := COALESCE((v_answer->>'flagged')::boolean, false);

      PERFORM public.save_exam_answer(v_attempt.id, v_question_id, COALESCE(v_selected, ARRAY[]::uuid[]), v_answer_text, 0, v_flagged);
    END LOOP;
  END IF;

  v_submit := public.grade_exam_attempt_core(v_attempt.id, COALESCE(_tab_switches, 0), COALESCE(_fullscreen_exits, 0));
  PERFORM public.log_exam_attempt_debug('submit.completed', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('result', v_submit));
  RETURN v_submit || jsonb_build_object('resolved_attempt_id', v_attempt.id, 'exam_id', v_attempt.exam_id, 'student_id', v_student, 'recovered_attempt', v_recovered);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) TO authenticated, service_role;