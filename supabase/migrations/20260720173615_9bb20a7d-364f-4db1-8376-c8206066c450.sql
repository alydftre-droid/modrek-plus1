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
  v_found boolean := false;
  v_recovered boolean := false;
  v_started jsonb;
  v_submit jsonb;
  v_answer jsonb;
  v_question_id uuid;
  v_selected uuid[];
  v_answer_text text;
  v_flagged boolean;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  IF _exam_id IS NULL AND _attempt_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'بيانات المحاولة غير مكتملة');
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = _attempt_id
      AND student_id = v_student
      AND (_exam_id IS NULL OR exam_id = _exam_id)
    LIMIT 1;
    v_found := FOUND;
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
      RETURN jsonb_build_object(
        'success', true,
        'attempt_id', v_attempt.id,
        'resolved_attempt_id', v_attempt.id,
        'already_submitted', true,
        'recovered_attempt', true
      );
    END IF;
  END IF;

  IF NOT v_found AND _exam_id IS NOT NULL THEN
    v_started := public.start_exam_attempt(_exam_id);
    IF COALESCE((v_started->>'success')::boolean, false) IS DISTINCT FROM true THEN
      RETURN v_started || jsonb_build_object('recovered_attempt', false);
    END IF;

    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE id = (v_started->>'attempt_id')::uuid
      AND student_id = v_student
      AND exam_id = _exam_id;
    v_found := FOUND;
    v_recovered := true;
  END IF;

  IF NOT v_found THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة');
  END IF;

  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'attempt_id', v_attempt.id,
      'resolved_attempt_id', v_attempt.id,
      'already_submitted', true,
      'recovered_attempt', v_recovered
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
      v_flagged := COALESCE((v_answer->>'flagged')::boolean, false);

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

  RETURN v_submit || jsonb_build_object(
    'attempt_id', v_attempt.id,
    'resolved_attempt_id', v_attempt.id,
    'recovered_attempt', v_recovered
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) TO authenticated, service_role;