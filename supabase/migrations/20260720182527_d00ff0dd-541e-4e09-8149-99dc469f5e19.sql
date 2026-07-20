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
  v_in_progress uuid;
  v_attempt_id uuid;
  v_max_score numeric;
  v_is_training_exam boolean := false;
  v_existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  RAISE LOG '[exam-debug] start_exam_attempt.received student_id=% exam_id=%', v_student, _exam_id;

  IF v_student IS NULL THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=not_authenticated exam_id=%', _exam_id;
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=exam_unavailable student_id=% exam_id=% found=%', v_student, _exam_id, FOUND;
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح', 'code', 'exam_unavailable');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(_exam_id, v_student);

  IF v_is_training_exam THEN
    RAISE LOG '[exam-debug] start_exam_attempt.redirect_training student_id=% exam_id=%', v_student, _exam_id;
    RETURN public.start_modrek_training_attempt(_exam_id, NULL);
  END IF;

  IF COALESCE(v_exam.source, 'teacher') = 'modrek_ai'
     OR v_exam.owner_student_id IS NOT NULL
     OR (v_exam.teacher_id IS NULL AND v_exam.group_id IS NULL) THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=training_owned_elsewhere student_id=% exam_id=%', v_student, _exam_id;
    RETURN jsonb_build_object('success', false, 'error', 'هذا التدريب تابع لطالب آخر أو غير متاح', 'training_exam', true, 'code', 'training_not_available');
  END IF;

  IF v_exam.group_id IS NULL THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=missing_group student_id=% exam_id=%', v_student, _exam_id;
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير مرتبط بمجموعة', 'code', 'missing_group');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = v_exam.group_id
      AND sgp.student_id = v_student
  ) THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=not_in_group student_id=% exam_id=% group_id=%', v_student, _exam_id, v_exam.group_id;
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة المشتركين', 'code', 'not_in_group');
  END IF;

  IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=target_mismatch student_id=% exam_id=% target_section=% target_education_type=%', v_student, _exam_id, v_exam.target_section, v_exam.target_education_type;
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'target_mismatch');
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=not_started student_id=% exam_id=% start_at=%', v_student, _exam_id, v_exam.start_at;
    RETURN jsonb_build_object('success', false, 'error', 'لم يبدأ وقت الامتحان بعد', 'code', 'not_started');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=ended student_id=% exam_id=% end_at=%', v_student, _exam_id, v_exam.end_at;
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت إتاحة الامتحان', 'code', 'ended');
  END IF;

  SELECT * INTO v_existing_attempt
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  ORDER BY started_at DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RAISE LOG '[exam-debug] start_exam_attempt.resumed student_id=% exam_id=% attempt_id=% created_at=% status=%', v_student, _exam_id, v_existing_attempt.id, v_existing_attempt.created_at, v_existing_attempt.status;
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
    RAISE LOG '[exam-debug] start_exam_attempt.rejected reason=max_attempts student_id=% exam_id=% existing_count=% max_attempts=%', v_student, _exam_id, v_existing_count, v_exam.max_attempts;
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
      RAISE LOG '[exam-debug] start_exam_attempt.unique_violation_without_in_progress student_id=% exam_id=%', v_student, _exam_id;
      RAISE;
    END IF;

    RAISE LOG '[exam-debug] start_exam_attempt.unique_resumed student_id=% exam_id=% attempt_id=% created_at=% status=%', v_student, _exam_id, v_existing_attempt.id, v_existing_attempt.created_at, v_existing_attempt.status;
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
BEGIN
  RAISE LOG '[exam-debug] submit_exam_attempt_resilient.received received_attempt_id=% received_exam_id=% received_student_id=% answers_count=%', _attempt_id, _exam_id, v_student, CASE WHEN jsonb_typeof(COALESCE(_answers, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(_answers, '[]'::jsonb)) ELSE NULL END;

  IF v_student IS NULL THEN
    RAISE LOG '[exam-debug] submit_exam_attempt_resilient.rejected reason=not_authenticated received_attempt_id=% received_exam_id=%', _attempt_id, _exam_id;
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  IF _exam_id IS NULL AND _attempt_id IS NULL THEN
    RAISE LOG '[exam-debug] submit_exam_attempt_resilient.rejected reason=missing_context student_id=%', v_student;
    RETURN jsonb_build_object('success', false, 'error', 'بيانات المحاولة غير مكتملة', 'code', 'missing_attempt_context');
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT * INTO v_direct_attempt
    FROM public.exam_attempts
    WHERE id = _attempt_id
    LIMIT 1;

    IF FOUND THEN
      v_attempt_row_json := to_jsonb(v_direct_attempt);
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.direct_query_found attempt_row=%', v_attempt_row_json;
    ELSE
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.direct_query_missing received_attempt_id=% student_id=% exam_id=%', _attempt_id, v_student, _exam_id;
    END IF;

    IF FOUND
       AND v_direct_attempt.student_id = v_student
       AND (_exam_id IS NULL OR v_direct_attempt.exam_id = _exam_id) THEN
      v_attempt := v_direct_attempt;
      v_found := true;
    ELSE
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.direct_query_rejected received_attempt_id=% direct_student_id=% direct_exam_id=% expected_student_id=% expected_exam_id=%', _attempt_id, v_direct_attempt.student_id, v_direct_attempt.exam_id, v_student, _exam_id;
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
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.recovered_in_progress student_id=% exam_id=% attempt_id=% created_at=% status=% original_received_attempt_id=%', v_student, _exam_id, v_attempt.id, v_attempt.created_at, v_attempt.status, _attempt_id;
    ELSE
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.no_in_progress student_id=% exam_id=% original_received_attempt_id=%', v_student, _exam_id, _attempt_id;
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
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.already_submitted student_id=% exam_id=% attempt_id=% created_at=% status=%', v_student, _exam_id, v_attempt.id, v_attempt.created_at, v_attempt.status;
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
    RAISE LOG '[exam-debug] submit_exam_attempt_resilient.starting_missing_attempt student_id=% exam_id=% received_attempt_id=%', v_student, _exam_id, _attempt_id;
    v_started := public.start_exam_attempt(_exam_id);
    IF COALESCE((v_started->>'success')::boolean, false) IS DISTINCT FROM true THEN
      RAISE LOG '[exam-debug] submit_exam_attempt_resilient.start_failed student_id=% exam_id=% response=%', v_student, _exam_id, v_started;
      RETURN v_started || jsonb_build_object('recovered_attempt', false, 'code', COALESCE(v_started->>'code', 'start_attempt_failed'));
    END IF;

    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = (v_started->>'attempt_id')::uuid
      AND student_id = v_student
      AND exam_id = _exam_id;
    v_found := FOUND;
    v_recovered := true;
    RAISE LOG '[exam-debug] submit_exam_attempt_resilient.started_lookup student_id=% exam_id=% started_attempt_id=% found=%', v_student, _exam_id, v_started->>'attempt_id', v_found;
  END IF;

  IF NOT v_found THEN
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

  v_submit := public.submit_exam_attempt(
    v_attempt.id,
    COALESCE(_tab_switches, 0),
    COALESCE(_fullscreen_exits, 0)
  );

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