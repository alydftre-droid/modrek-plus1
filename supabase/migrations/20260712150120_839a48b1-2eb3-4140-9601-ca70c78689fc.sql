DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'exams'
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.exams ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_exam_teacher_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF to_jsonb(NEW) ? 'teacher_id' AND to_jsonb(NEW) ? 'created_by' THEN
    IF NEW.created_by IS NULL AND NEW.teacher_id IS NOT NULL THEN
      NEW.created_by := NEW.teacher_id;
    END IF;

    IF NEW.teacher_id IS NULL
       AND NEW.created_by IS NOT NULL
       AND COALESCE(NEW.source, 'teacher') <> 'modrek_ai' THEN
      NEW.teacher_id := NEW.created_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_modrek_ai_exam(
  _title text,
  _description text,
  _duration_minutes integer,
  _total_marks numeric,
  _pass_marks numeric,
  _difficulty public.exam_difficulty,
  _subject_id uuid,
  _questions jsonb
)
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
  v_q jsonb;
  v_ord bigint;
  v_type_text text;
  v_type public.exam_question_type;
  v_marks numeric;
  v_correct text;
  v_option text;
  v_opt_ord bigint;
  v_option_count integer;
  v_question_count integer := 0;
  v_answer_count integer := 0;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'missing authenticated student';
  END IF;

  IF _subject_id IS NULL THEN
    RAISE EXCEPTION 'missing subject_id';
  END IF;

  IF _questions IS NULL OR jsonb_typeof(_questions) <> 'array' OR jsonb_array_length(_questions) = 0 THEN
    RAISE EXCEPTION 'questions array is required';
  END IF;

  INSERT INTO public.exams (
    title,
    description,
    duration_minutes,
    total_marks,
    pass_marks,
    status,
    is_published,
    is_ai_generated,
    difficulty,
    source,
    owner_student_id,
    teacher_id,
    subject_id,
    show_results_immediately,
    show_correct_answers,
    shuffle_questions,
    shuffle_options,
    prevent_tab_switch,
    require_fullscreen,
    prevent_copy_paste,
    max_attempts
  ) VALUES (
    COALESCE(NULLIF(trim(_title), ''), 'امتحان Modrek AI'),
    NULLIF(trim(COALESCE(_description, '')), ''),
    GREATEST(1, COALESCE(_duration_minutes, 30)),
    GREATEST(1, COALESCE(_total_marks, 1)),
    GREATEST(0, COALESCE(_pass_marks, 0)),
    'published',
    true,
    true,
    COALESCE(_difficulty, 'medium'::public.exam_difficulty),
    'modrek_ai',
    v_student,
    NULL,
    _subject_id,
    true,
    true,
    false,
    true,
    false,
    false,
    false,
    999
  ) RETURNING id INTO v_exam_id;

  FOR v_q, v_ord IN
    SELECT value, ordinality
    FROM jsonb_array_elements(_questions) WITH ORDINALITY
  LOOP
    v_type_text := lower(trim(COALESCE(v_q->>'type', 'mcq')));
    IF v_type_text IN ('tf', 'truefalse', 'true-false', 'true false') THEN
      v_type_text := 'true_false';
    END IF;
    IF v_type_text NOT IN ('mcq', 'true_false', 'short_answer', 'essay', 'fill_blank') THEN
      v_type_text := 'mcq';
    END IF;
    v_type := v_type_text::public.exam_question_type;

    BEGIN
      v_marks := GREATEST(1, LEAST(10, COALESCE((v_q->>'marks')::numeric, 1)));
    EXCEPTION WHEN others THEN
      v_marks := 1;
    END;

    v_correct := trim(COALESCE(v_q->>'correct_answer', ''));

    INSERT INTO public.exam_questions (
      exam_id,
      order_index,
      question_type,
      question_text,
      marks,
      difficulty,
      correct_answer,
      explanation
    ) VALUES (
      v_exam_id,
      v_ord::integer,
      v_type,
      COALESCE(NULLIF(trim(COALESCE(v_q->>'question', v_q->>'question_text', v_q->>'text')), ''), 'سؤال'),
      v_marks,
      COALESCE(_difficulty, 'medium'::public.exam_difficulty),
      NULLIF(v_correct, ''),
      NULLIF(trim(COALESCE(v_q->>'explanation', '')), '')
    ) RETURNING id INTO v_question_id;

    v_question_count := v_question_count + 1;

    IF v_type = 'true_false' THEN
      FOR v_option, v_opt_ord IN SELECT * FROM (VALUES ('صح'::text, 1::bigint), ('خطأ'::text, 2::bigint)) AS opts(option_text, ordinality)
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
        RAISE EXCEPTION 'mcq question % has fewer than two options', v_ord;
      END IF;
    END IF;
  END LOOP;

  IF v_question_count = 0 THEN
    RAISE EXCEPTION 'no valid questions inserted';
  END IF;

  INSERT INTO public.exam_attempts (
    exam_id,
    student_id,
    attempt_number,
    max_score,
    status
  ) VALUES (
    v_exam_id,
    v_student,
    1,
    GREATEST(1, COALESCE(_total_marks, 1)),
    'in_progress'
  ) RETURNING id INTO v_attempt_id;

  INSERT INTO public.exam_answers (
    attempt_id,
    question_id,
    selected_option_ids,
    answer_text,
    marks_awarded,
    is_correct
  )
  SELECT
    v_attempt_id,
    q.id,
    '{}'::uuid[],
    NULL,
    0,
    NULL
  FROM public.exam_questions q
  WHERE q.exam_id = v_exam_id;

  GET DIAGNOSTICS v_answer_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'examId', v_exam_id,
    'attemptId', v_attempt_id,
    'questionCount', v_question_count,
    'answerCount', v_answer_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';