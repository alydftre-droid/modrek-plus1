DROP FUNCTION IF EXISTS public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_modrek_ai_exam(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam_id uuid;
  v_attempt_id uuid;
  v_question_id uuid;
  v_title text := COALESCE(NULLIF(trim(_payload->>'title'), ''), 'امتحان Modrek AI');
  v_description text := NULLIF(trim(COALESCE(_payload->>'description', '')), '');
  v_duration_minutes integer := GREATEST(1, COALESCE(NULLIF(_payload->>'duration_minutes', '')::integer, 30));
  v_total_marks numeric := GREATEST(1, COALESCE(NULLIF(_payload->>'total_marks', '')::numeric, 1));
  v_pass_marks numeric := GREATEST(0, COALESCE(NULLIF(_payload->>'pass_marks', '')::numeric, 0));
  v_difficulty_text text := lower(trim(COALESCE(_payload->>'difficulty', 'medium')));
  v_difficulty public.exam_difficulty;
  v_subject_id uuid;
  v_questions jsonb := _payload->'questions';
  v_q jsonb;
  v_ord bigint;
  v_type_text text;
  v_type public.exam_question_type;
  v_marks numeric;
  v_correct text;
  v_option text;
  v_opt_ord bigint;
  v_option_count integer;
  v_correct_count integer;
  v_question_count integer := 0;
  v_answer_count integer := 0;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'missing authenticated student' USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_AUTH';
  END IF;

  BEGIN
    v_subject_id := NULLIF(_payload->>'subject_id', '')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid subject_id' USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_SUBJECT';
  END;

  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'missing subject_id' USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_SUBJECT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = v_subject_id) THEN
    RAISE EXCEPTION 'subject_id does not exist' USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_SUBJECT';
  END IF;

  IF v_questions IS NULL OR jsonb_typeof(v_questions) <> 'array' OR jsonb_array_length(v_questions) = 0 THEN
    RAISE EXCEPTION 'questions array is required' USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_QUESTIONS';
  END IF;

  v_difficulty := CASE
    WHEN v_difficulty_text IN ('easy', 'سهل') THEN 'easy'::public.exam_difficulty
    WHEN v_difficulty_text IN ('hard', 'صعب') THEN 'hard'::public.exam_difficulty
    ELSE 'medium'::public.exam_difficulty
  END;

  INSERT INTO public.exams (
    title, description, duration_minutes, total_marks, pass_marks,
    status, is_published, is_ai_generated, difficulty, source,
    owner_student_id, teacher_id, subject_id,
    show_results_immediately, show_correct_answers,
    shuffle_questions, shuffle_options,
    prevent_tab_switch, require_fullscreen, prevent_copy_paste,
    max_attempts
  ) VALUES (
    v_title, v_description, v_duration_minutes, v_total_marks, v_pass_marks,
    'published', true, true, v_difficulty, 'modrek_ai',
    v_student, NULL, v_subject_id,
    true, true,
    false, true,
    false, false, false,
    999
  ) RETURNING id INTO v_exam_id;

  FOR v_q, v_ord IN
    SELECT value, ordinality
    FROM jsonb_array_elements(v_questions) WITH ORDINALITY
  LOOP
    v_type_text := lower(trim(COALESCE(v_q->>'type', v_q->>'question_type', 'mcq')));
    IF v_type_text IN ('tf', 'truefalse', 'true-false', 'true false', 'صح وخطأ', 'صح/خطأ') THEN
      v_type_text := 'true_false';
    END IF;
    IF v_type_text IN ('اكمل', 'أكمل', 'fill') THEN
      v_type_text := 'fill_blank';
    END IF;
    IF v_type_text NOT IN ('mcq', 'true_false', 'short_answer', 'essay', 'fill_blank') THEN
      v_type_text := 'mcq';
    END IF;
    v_type := v_type_text::public.exam_question_type;

    BEGIN
      v_marks := GREATEST(1, LEAST(10, COALESCE(NULLIF(v_q->>'marks', '')::numeric, 1)));
    EXCEPTION WHEN others THEN
      v_marks := 1;
    END;

    v_correct := trim(COALESCE(v_q->>'correct_answer', v_q->>'answer', v_q->>'model_answer', ''));

    INSERT INTO public.exam_questions (
      exam_id, order_index, question_type, question_text,
      marks, difficulty, correct_answer, explanation
    ) VALUES (
      v_exam_id,
      v_ord::integer,
      v_type,
      COALESCE(NULLIF(trim(COALESCE(v_q->>'question', v_q->>'question_text', v_q->>'text')), ''), 'سؤال'),
      v_marks,
      v_difficulty,
      NULLIF(v_correct, ''),
      NULLIF(trim(COALESCE(v_q->>'explanation', '')), '')
    ) RETURNING id INTO v_question_id;

    v_question_count := v_question_count + 1;

    IF v_type = 'true_false' THEN
      FOR v_option, v_opt_ord IN
        SELECT * FROM (VALUES ('صح'::text, 1::bigint), ('خطأ'::text, 2::bigint)) AS opts(option_text, ordinality)
      LOOP
        INSERT INTO public.exam_question_options (question_id, option_text, is_correct, order_index)
        VALUES (
          v_question_id,
          v_option,
          (
            v_option = v_correct
            OR (v_option = 'صح' AND v_correct ~* '(true|صح|صحيح)')
            OR (v_option = 'خطأ' AND v_correct ~* '(false|خطأ|خاطئ)')
          ),
          v_opt_ord::integer
        );
      END LOOP;

      SELECT count(*) INTO v_correct_count
      FROM public.exam_question_options
      WHERE question_id = v_question_id AND is_correct = true;
      IF v_correct_count = 0 THEN
        UPDATE public.exam_question_options
        SET is_correct = (option_text = 'صح')
        WHERE question_id = v_question_id;
      END IF;
    ELSIF v_type = 'mcq' THEN
      v_option_count := 0;
      IF jsonb_typeof(v_q->'options') = 'array' THEN
        FOR v_option, v_opt_ord IN
          SELECT trim(value #>> '{}'), ordinality
          FROM jsonb_array_elements(v_q->'options') WITH ORDINALITY
        LOOP
          IF v_option IS NULL OR v_option = '' THEN
            CONTINUE;
          END IF;
          v_option_count := v_option_count + 1;
          INSERT INTO public.exam_question_options (question_id, option_text, is_correct, order_index)
          VALUES (
            v_question_id,
            v_option,
            (
              v_option = v_correct
              OR v_correct = v_opt_ord::text
              OR lower(v_correct) = chr(96 + v_opt_ord::integer)
              OR v_correct = (ARRAY['أ','ب','ج','د','هـ','و'])[v_opt_ord::integer]
            ),
            v_opt_ord::integer
          );
        END LOOP;
      END IF;

      IF v_option_count < 2 THEN
        RAISE EXCEPTION 'mcq question % has fewer than two options', v_ord USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_OPTIONS';
      END IF;

      SELECT count(*) INTO v_correct_count
      FROM public.exam_question_options
      WHERE question_id = v_question_id AND is_correct = true;
      IF v_correct_count = 0 THEN
        UPDATE public.exam_question_options
        SET is_correct = (order_index = 1)
        WHERE question_id = v_question_id;
      END IF;
    END IF;
  END LOOP;

  IF v_question_count = 0 THEN
    RAISE EXCEPTION 'no valid questions inserted' USING ERRCODE = 'P0001', HINT = 'CREATE_MODREK_AI_EXAM_QUESTIONS';
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_total_marks
  FROM public.exam_questions
  WHERE exam_id = v_exam_id;

  UPDATE public.exams
  SET total_marks = GREATEST(1, v_total_marks),
      pass_marks = GREATEST(0, LEAST(GREATEST(1, v_total_marks), v_pass_marks))
  WHERE id = v_exam_id;

  INSERT INTO public.exam_attempts (
    exam_id, student_id, attempt_number, max_score, status
  ) VALUES (
    v_exam_id, v_student, 1, GREATEST(1, v_total_marks), 'in_progress'
  ) RETURNING id INTO v_attempt_id;

  INSERT INTO public.exam_answers (
    attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct
  )
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = v_exam_id;

  GET DIAGNOSTICS v_answer_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'examId', v_exam_id,
    'attemptId', v_attempt_id,
    'questionCount', v_question_count,
    'answerCount', v_answer_count,
    'totalMarks', v_total_marks
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';