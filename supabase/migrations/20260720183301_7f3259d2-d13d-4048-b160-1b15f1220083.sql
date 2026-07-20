CREATE TABLE IF NOT EXISTS public.exam_attempt_debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  student_id uuid,
  exam_id uuid,
  attempt_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.exam_attempt_debug_logs TO service_role;

ALTER TABLE public.exam_attempt_debug_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages exam debug logs" ON public.exam_attempt_debug_logs;
CREATE POLICY "Service role manages exam debug logs"
ON public.exam_attempt_debug_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_debug_logs_created_at ON public.exam_attempt_debug_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempt_debug_logs_attempt_id ON public.exam_attempt_debug_logs(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exam_attempt_debug_logs_exam_student ON public.exam_attempt_debug_logs(exam_id, student_id) WHERE exam_id IS NOT NULL AND student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_exam_attempt_debug(
  _stage text,
  _student_id uuid DEFAULT NULL,
  _exam_id uuid DEFAULT NULL,
  _attempt_id uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.exam_attempt_debug_logs(stage, student_id, exam_id, attempt_id, payload)
  VALUES (_stage, _student_id, _exam_id, _attempt_id, COALESCE(_payload, '{}'::jsonb));
EXCEPTION WHEN others THEN
  RAISE LOG '[exam-debug] log_insert_failed stage=% student_id=% exam_id=% attempt_id=% error=%', _stage, _student_id, _exam_id, _attempt_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.log_exam_attempt_debug(text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_exam_attempt_debug(text, uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_existing_count integer;
  v_attempt_id uuid;
  v_max_score numeric;
  v_is_training_exam boolean := false;
  v_existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  PERFORM public.log_exam_attempt_debug('start.received', v_student, _exam_id, NULL, jsonb_build_object('student_id', v_student, 'exam_id', _exam_id));
  RAISE LOG '[exam-debug] start_exam_attempt.received student_id=% exam_id=%', v_student, _exam_id;

  IF v_student IS NULL THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.not_authenticated', NULL, _exam_id, NULL, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.exam_unavailable', v_student, _exam_id, NULL, jsonb_build_object('found_exam', FOUND));
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح', 'code', 'exam_unavailable');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(_exam_id, v_student);

  IF v_is_training_exam THEN
    PERFORM public.log_exam_attempt_debug('start.redirect_training', v_student, _exam_id, NULL, '{}'::jsonb);
    RETURN public.start_modrek_training_attempt(_exam_id, NULL);
  END IF;

  IF COALESCE(v_exam.source, 'teacher') = 'modrek_ai'
     OR v_exam.owner_student_id IS NOT NULL
     OR (v_exam.teacher_id IS NULL AND v_exam.group_id IS NULL) THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.training_owned_elsewhere', v_student, _exam_id, NULL, jsonb_build_object('source', v_exam.source, 'owner_student_id', v_exam.owner_student_id, 'teacher_id', v_exam.teacher_id, 'group_id', v_exam.group_id));
    RETURN jsonb_build_object('success', false, 'error', 'هذا التدريب تابع لطالب آخر أو غير متاح', 'training_exam', true, 'code', 'training_not_available');
  END IF;

  IF v_exam.group_id IS NULL THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.missing_group', v_student, _exam_id, NULL, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير مرتبط بمجموعة', 'code', 'missing_group');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = v_exam.group_id
      AND sgp.student_id = v_student
  ) THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.not_in_group', v_student, _exam_id, NULL, jsonb_build_object('group_id', v_exam.group_id));
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة المشتركين', 'code', 'not_in_group');
  END IF;

  IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.target_mismatch', v_student, _exam_id, NULL, jsonb_build_object('target_section', v_exam.target_section, 'target_education_type', v_exam.target_education_type));
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'target_mismatch');
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.not_started', v_student, _exam_id, NULL, jsonb_build_object('start_at', v_exam.start_at));
    RETURN jsonb_build_object('success', false, 'error', 'لم يبدأ وقت الامتحان بعد', 'code', 'not_started');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.ended', v_student, _exam_id, NULL, jsonb_build_object('end_at', v_exam.end_at));
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت إتاحة الامتحان', 'code', 'ended');
  END IF;

  SELECT * INTO v_existing_attempt
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  ORDER BY started_at DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    PERFORM public.log_exam_attempt_debug('start.resumed', v_student, _exam_id, v_existing_attempt.id, jsonb_build_object('attempt_id', v_existing_attempt.id, 'created_at', v_existing_attempt.created_at, 'status', v_existing_attempt.status));
    RETURN jsonb_build_object(
      'success', true,
      'attempt_id', v_existing_attempt.id,
      'student_id', v_student,
      'exam_id', _exam_id,
      'created_at', v_existing_attempt.created_at,
      'status', v_existing_attempt.status,
      'resumed', true,
      'training_exam', false,
      'code', 'attempt_resumed'
    );
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status IN ('submitted','graded','expired');

  IF v_existing_count >= COALESCE(v_exam.max_attempts, 1) THEN
    PERFORM public.log_exam_attempt_debug('start.rejected.max_attempts', v_student, _exam_id, NULL, jsonb_build_object('existing_count', v_existing_count, 'max_attempts', v_exam.max_attempts));
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد المحاولات', 'code', 'max_attempts_reached');
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions
  WHERE exam_id = _exam_id
    AND question_type::text <> 'section';

  BEGIN
    INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score)
    VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score)
    RETURNING id INTO v_attempt_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_attempt
    FROM public.exam_attempts
    WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      PERFORM public.log_exam_attempt_debug('start.failed.unique_without_in_progress', v_student, _exam_id, NULL, '{}'::jsonb);
      RAISE;
    END IF;

    PERFORM public.log_exam_attempt_debug('start.resumed_after_conflict', v_student, _exam_id, v_existing_attempt.id, jsonb_build_object('attempt_id', v_existing_attempt.id, 'created_at', v_existing_attempt.created_at, 'status', v_existing_attempt.status));
    RETURN jsonb_build_object(
      'success', true,
      'attempt_id', v_existing_attempt.id,
      'student_id', v_student,
      'exam_id', _exam_id,
      'created_at', v_existing_attempt.created_at,
      'status', v_existing_attempt.status,
      'resumed', true,
      'training_exam', false,
      'code', 'attempt_resumed_after_conflict'
    );
  END;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct)
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id
    AND q.question_type::text <> 'section'
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  SELECT * INTO v_existing_attempt FROM public.exam_attempts WHERE id = v_attempt_id;
  PERFORM public.log_exam_attempt_debug('start.created', v_student, _exam_id, v_attempt_id, jsonb_build_object('attempt_id', v_attempt_id, 'created_at', v_existing_attempt.created_at, 'status', v_existing_attempt.status, 'precreated_answers', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt_id)));
  RAISE LOG '[exam-debug] start_exam_attempt.created student_id=% exam_id=% attempt_id=% created_at=% status=%', v_student, _exam_id, v_existing_attempt.id, v_existing_attempt.created_at, v_existing_attempt.status;

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt_id,
    'student_id', v_student,
    'exam_id', _exam_id,
    'created_at', v_existing_attempt.created_at,
    'status', v_existing_attempt.status,
    'resumed', false,
    'training_exam', false,
    'code', 'attempt_created'
  );
END;
$$;

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

    IF FOUND THEN
      v_attempt_row_json := to_jsonb(v_direct_attempt);
      PERFORM public.log_exam_attempt_debug('submit.direct_query.found', v_student, v_direct_attempt.exam_id, _attempt_id, jsonb_build_object('attempt_row', v_attempt_row_json));
    ELSE
      PERFORM public.log_exam_attempt_debug('submit.direct_query.missing', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id));
    END IF;

    IF FOUND
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

REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) TO authenticated, service_role;