CREATE OR REPLACE FUNCTION public.submit_exam_attempt_resilient(
  _exam_id uuid DEFAULT NULL,
  _attempt_id uuid DEFAULT NULL,
  _answers jsonb DEFAULT '[]'::jsonb,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_direct_attempt public.exam_attempts%ROWTYPE;
  v_direct_found boolean := false;
  v_found boolean := false;
  v_recovered boolean := false;
  v_started jsonb;
  v_submit jsonb;
  v_answer jsonb;
  v_question_id uuid;
  v_selected uuid[];
  v_answer_text text;
  v_flagged boolean;
  v_attempt_row_json jsonb := NULL;
  v_answers_count integer := CASE WHEN jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(_answers, '[]'::jsonb)) ELSE 0 END;
BEGIN
  PERFORM public.log_exam_attempt_debug('submit.received', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'answers_count', v_answers_count));
  RAISE LOG '[exam-debug] submit_exam_attempt_resilient.received received_attempt_id=% received_exam_id=% received_student_id=% answers_count=%', _attempt_id, _exam_id, v_student, v_answers_count;

  IF v_student IS NULL THEN
    PERFORM public.log_exam_attempt_debug('submit.rejected.not_authenticated', NULL, _exam_id, _attempt_id, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  IF _exam_id IS NULL AND _attempt_id IS NULL THEN
    PERFORM public.log_exam_attempt_debug('submit.rejected.missing_context', v_student, NULL, NULL, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'بيانات المحاولة غير مكتملة', 'code', 'missing_attempt_context');
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT * INTO v_direct_attempt
    FROM public.exam_attempts
    WHERE id = _attempt_id
    LIMIT 1;
    v_direct_found := FOUND;

    IF v_direct_found THEN
      v_attempt_row_json := to_jsonb(v_direct_attempt);
      PERFORM public.log_exam_attempt_debug('submit.direct_query.found', v_student, v_direct_attempt.exam_id, _attempt_id, jsonb_build_object('attempt_row', v_attempt_row_json));
      IF v_direct_attempt.student_id = v_student AND _exam_id IS NULL THEN
        _exam_id := v_direct_attempt.exam_id;
        PERFORM public.log_exam_attempt_debug('submit.derived_exam_from_attempt', v_student, _exam_id, _attempt_id, jsonb_build_object('derived_exam_id', _exam_id));
      END IF;
    ELSE
      PERFORM public.log_exam_attempt_debug('submit.direct_query.missing', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id));
    END IF;

    IF v_direct_found
       AND v_direct_attempt.student_id = v_student
       AND (_exam_id IS NULL OR v_direct_attempt.exam_id = _exam_id) THEN
      v_attempt := v_direct_attempt;
      v_found := true;
    ELSE
      PERFORM public.log_exam_attempt_debug('submit.direct_query.rejected', v_student, _exam_id, _attempt_id, jsonb_build_object('direct_attempt_row', v_attempt_row_json, 'expected_student_id', v_student, 'expected_exam_id', _exam_id));
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
      PERFORM public.log_exam_attempt_debug('submit.recovered_in_progress', v_student, _exam_id, v_attempt.id, jsonb_build_object('attempt_id', v_attempt.id, 'created_at', v_attempt.created_at, 'status', v_attempt.status, 'original_received_attempt_id', _attempt_id));
    ELSE
      PERFORM public.log_exam_attempt_debug('submit.no_in_progress', v_student, _exam_id, _attempt_id, jsonb_build_object('original_received_attempt_id', _attempt_id));
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
      PERFORM public.log_exam_attempt_debug('submit.already_submitted', v_student, _exam_id, v_attempt.id, jsonb_build_object('attempt_row', to_jsonb(v_attempt)));
      RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt.id,
        'resolved_attempt_id', v_attempt.id,
        'student_id', v_student,
        'exam_id', v_attempt.exam_id,
        'attempt_row', to_jsonb(v_attempt),
        'already_submitted', true,
        'recovered_attempt', true,
        'code', 'already_submitted'
      );
    END IF;
  END IF;

  IF NOT v_found AND _exam_id IS NOT NULL THEN
    PERFORM public.log_exam_attempt_debug('submit.starting_missing_attempt', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id));
    v_started := public.start_exam_attempt(_exam_id);
    IF COALESCE((v_started->>'success')::boolean, false) IS DISTINCT FROM true THEN
      PERFORM public.log_exam_attempt_debug('submit.start_failed', v_student, _exam_id, _attempt_id, jsonb_build_object('start_response', v_started));
      RETURN v_started || jsonb_build_object('recovered_attempt', false, 'code', COALESCE(v_started->>'code', 'start_attempt_failed'));
    END IF;

    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = (v_started->>'attempt_id')::uuid
      AND student_id = v_student
      AND exam_id = _exam_id;
    v_found := FOUND;
    v_recovered := true;
    PERFORM public.log_exam_attempt_debug('submit.started_lookup', v_student, _exam_id, (v_started->>'attempt_id')::uuid, jsonb_build_object('found', v_found, 'start_response', v_started));
  END IF;

  IF NOT v_found THEN
    PERFORM public.log_exam_attempt_debug('submit.failed.attempt_not_found', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'direct_attempt_row', v_attempt_row_json));
    RAISE LOG '[exam-debug] submit_exam_attempt_resilient.failed_attempt_not_found received_attempt_id=% received_exam_id=% received_student_id=% direct_attempt_row=%', _attempt_id, _exam_id, v_student, v_attempt_row_json;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'محاولة غير صالحة',
      'code', 'attempt_not_found',
      'received_attempt_id', _attempt_id,
      'received_exam_id', _exam_id,
      'received_student_id', v_student,
      'direct_attempt_row', v_attempt_row_json
    );
  END IF;

  PERFORM public.log_exam_attempt_debug('submit.resolved', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('received_attempt_id', _attempt_id, 'resolved_attempt_id', v_attempt.id, 'created_at', v_attempt.created_at, 'status', v_attempt.status, 'recovered', v_recovered));
  RAISE LOG '[exam-debug] submit_exam_attempt_resilient.resolved received_attempt_id=% resolved_attempt_id=% student_id=% exam_id=% created_at=% status=% recovered=%', _attempt_id, v_attempt.id, v_student, v_attempt.exam_id, v_attempt.created_at, v_attempt.status, v_recovered;

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

  IF jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN
    FOR v_answer IN SELECT value FROM jsonb_array_elements(COALESCE(_answers, '[]'::jsonb)) LOOP
      BEGIN
        v_question_id := COALESCE(v_answer->>'questionId', v_answer->>'question_id')::uuid;
      EXCEPTION WHEN others THEN
        CONTINUE;
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM public.exam_questions q
        WHERE q.id = v_question_id
          AND q.exam_id = v_attempt.exam_id
          AND q.question_type::text <> 'section'
      ) THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(array_agg(value::uuid), '{}'::uuid[])
      INTO v_selected
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(v_answer->'selectedOptionIds') = 'array' THEN v_answer->'selectedOptionIds'
          WHEN jsonb_typeof(v_answer->'selected_option_ids') = 'array' THEN v_answer->'selected_option_ids'
          ELSE '[]'::jsonb
        END
      ) AS selected(value)
      WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      v_answer_text := NULLIF(COALESCE(v_answer->>'answerText', v_answer->>'answer_text', ''), '');
      v_flagged := lower(COALESCE(v_answer->>'flagged', 'false')) IN ('true', '1', 'yes', 'y');

      INSERT INTO public.exam_answers (
        attempt_id,
        question_id,
        selected_option_ids,
        answer_text,
        time_spent_seconds,
        flagged_for_review,
        answered_at
      )
      VALUES (
        v_attempt.id,
        v_question_id,
        COALESCE(v_selected, '{}'::uuid[]),
        v_answer_text,
        0,
        v_flagged,
        now()
      )
      ON CONFLICT (attempt_id, question_id) DO UPDATE
      SET selected_option_ids = EXCLUDED.selected_option_ids,
          answer_text = EXCLUDED.answer_text,
          flagged_for_review = EXCLUDED.flagged_for_review,
          answered_at = now();
    END LOOP;
  END IF;

  PERFORM public.log_exam_attempt_debug('submit.before_core_submit', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('answers_count_sent', v_answers_count, 'answers_count_in_db', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt.id)));

  v_submit := public.submit_exam_attempt(
    v_attempt.id,
    COALESCE(_tab_switches, 0),
    COALESCE(_fullscreen_exits, 0)
  );

  PERFORM public.log_exam_attempt_debug('submit.core_result', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('result', v_submit, 'attempt_after_submit', (SELECT to_jsonb(a) FROM public.exam_attempts a WHERE a.id = v_attempt.id), 'answers_after_submit', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt.id)));
  RAISE LOG '[exam-debug] submit_exam_attempt_resilient.submit_result student_id=% exam_id=% attempt_id=% result=%', v_student, v_attempt.exam_id, v_attempt.id, v_submit;

  RETURN v_submit || jsonb_build_object(
    'attempt_id', v_attempt.id,
    'resolved_attempt_id', v_attempt.id,
    'student_id', v_student,
    'exam_id', v_attempt.exam_id,
    'attempt_row', to_jsonb(v_attempt),
    'recovered_attempt', v_recovered,
    'code', COALESCE(v_submit->>'code', 'submitted')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';