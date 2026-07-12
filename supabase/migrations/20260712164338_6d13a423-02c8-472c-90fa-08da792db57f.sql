-- Canonical Modrek AI training-exam persistence and cleanup
-- This migration intentionally keeps Modrek AI exams in the existing exams engine
-- while marking them as training-only with source='modrek_ai'.

DROP FUNCTION IF EXISTS public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_modrek_ai_exam(text, text, integer, numeric, jsonb, uuid, text, numeric);
DROP FUNCTION IF EXISTS public.create_modrek_ai_exam(text, text, integer, numeric, jsonb, uuid, text, numeric, uuid);
DROP FUNCTION IF EXISTS public.create_modrek_ai_exam(_description text, _difficulty public.exam_difficulty, _duration_minutes integer, _pass_marks numeric, _questions jsonb, _subject_id uuid, _title text, _total_marks numeric);

CREATE OR REPLACE FUNCTION public.create_modrek_ai_training_exam(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_exam_id uuid;
  v_attempt jsonb;
  v_question_id uuid;
  v_subject_id uuid;
  v_title text := COALESCE(NULLIF(trim(_payload->>'title'), ''), 'امتحان تدريبي من Modrek AI');
  v_description text := NULLIF(trim(COALESCE(_payload->>'description', '')), '');
  v_duration_minutes integer := GREATEST(5, LEAST(240, COALESCE(NULLIF(_payload->>'duration_minutes', '')::integer, 30)));
  v_pass_marks numeric := GREATEST(0, COALESCE(NULLIF(_payload->>'pass_marks', '')::numeric, 0));
  v_difficulty_text text := lower(trim(COALESCE(_payload->>'difficulty', 'medium')));
  v_difficulty public.exam_difficulty := 'medium'::public.exam_difficulty;
  v_questions jsonb := _payload->'questions';
  v_q jsonb;
  v_ord bigint;
  v_type_text text;
  v_type public.exam_question_type;
  v_marks numeric;
  v_correct text;
  v_question_text text;
  v_option text;
  v_opt_ord bigint;
  v_options jsonb;
  v_option_count integer;
  v_correct_count integer;
  v_question_count integer := 0;
  v_total_marks numeric := 0;
  v_answer_count integer := 0;
  v_attempt_id uuid;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  BEGIN
    v_subject_id := NULLIF(_payload->>'subject_id', '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', 'معرف المادة غير صالح');
  END;

  IF v_subject_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = v_subject_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'تعذر تحديد مادة صالحة للامتحان');
  END IF;

  IF v_questions IS NULL OR jsonb_typeof(v_questions) <> 'array' OR jsonb_array_length(v_questions) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا توجد أسئلة صالحة لإنشاء الامتحان');
  END IF;

  v_difficulty := CASE
    WHEN v_difficulty_text IN ('easy', 'سهل') THEN 'easy'::public.exam_difficulty
    WHEN v_difficulty_text IN ('hard', 'صعب') THEN 'hard'::public.exam_difficulty
    ELSE 'medium'::public.exam_difficulty
  END;

  INSERT INTO public.exams (
    teacher_id, subject_id, group_id, sub_subject_id,
    title, description, instructions, duration_minutes,
    total_marks, pass_marks, max_attempts,
    shuffle_questions, shuffle_options,
    show_results_immediately, show_correct_answers,
    prevent_tab_switch, require_fullscreen, prevent_copy_paste,
    max_cheat_exits, prevent_reload, random_snapshots,
    status, is_published, difficulty, term,
    is_ai_generated, source, owner_student_id,
    target_education_type, target_section
  ) VALUES (
    NULL, v_subject_id, NULL, NULL,
    v_title, v_description, 'امتحان تدريبي مولد بواسطة Modrek AI ولا يؤثر على الدرجات الرسمية.', v_duration_minutes,
    0, 0, 999,
    false, true,
    true, true,
    false, false, false,
    999, false, false,
    'published'::public.exam_status, true, v_difficulty, COALESCE(NULLIF(_payload->>'term', ''), 'term1'),
    true, 'modrek_ai', v_student,
    NULLIF(_payload->>'target_education_type', ''), NULLIF(_payload->>'target_section', '')
  ) RETURNING id INTO v_exam_id;

  FOR v_q, v_ord IN
    SELECT value, ordinality
    FROM jsonb_array_elements(v_questions) WITH ORDINALITY
  LOOP
    v_question_text := COALESCE(NULLIF(trim(COALESCE(v_q->>'question', v_q->>'question_text', v_q->>'text')), ''), NULL);
    IF v_question_text IS NULL THEN
      CONTINUE;
    END IF;

    v_type_text := lower(trim(COALESCE(v_q->>'type', v_q->>'question_type', 'mcq')));
    IF v_type_text IN ('tf', 'truefalse', 'true-false', 'true false', 'صح وخطأ', 'صح/خطأ', 'boolean') THEN
      v_type_text := 'true_false';
    ELSIF v_type_text IN ('اكمل', 'أكمل', 'fill') THEN
      v_type_text := 'fill_blank';
    ELSIF v_type_text IN ('مقالي', 'مقال') THEN
      v_type_text := 'essay';
    ELSIF v_type_text IN ('اجابة قصيرة', 'إجابة قصيرة', 'short') THEN
      v_type_text := 'short_answer';
    END IF;
    IF v_type_text NOT IN ('mcq', 'true_false', 'short_answer', 'essay', 'fill_blank') THEN
      v_type_text := 'mcq';
    END IF;

    BEGIN
      v_marks := GREATEST(1, LEAST(10, COALESCE(NULLIF(v_q->>'marks', '')::numeric, 1)));
    EXCEPTION WHEN others THEN
      v_marks := 1;
    END;

    v_correct := trim(COALESCE(v_q->>'correct_answer', v_q->>'answer', v_q->>'model_answer', ''));
    v_options := COALESCE(v_q->'options', '[]'::jsonb);

    IF v_type_text = 'true_false' THEN
      v_options := '["صح","خطأ"]'::jsonb;
      IF v_correct = '' THEN v_correct := 'صح'; END IF;
    ELSIF v_type_text = 'mcq' THEN
      IF jsonb_typeof(v_options) <> 'array' THEN
        v_options := '[]'::jsonb;
      END IF;
      SELECT count(*) INTO v_option_count
      FROM jsonb_array_elements(v_options) opt
      WHERE trim(opt #>> '{}') <> '';
      IF v_option_count < 2 THEN
        -- Keep exam creation stable while still using the teacher exam engine.
        v_type_text := 'short_answer';
        v_options := '[]'::jsonb;
      END IF;
    END IF;

    IF v_type_text IN ('short_answer', 'essay', 'fill_blank') AND v_correct = '' THEN
      v_correct := 'إجابة نموذجية تُقبل بالمعنى الصحيح.';
    END IF;

    v_type := v_type_text::public.exam_question_type;

    INSERT INTO public.exam_questions (
      exam_id, order_index, question_type, question_text,
      marks, difficulty, correct_answer, explanation
    ) VALUES (
      v_exam_id,
      v_ord::integer,
      v_type,
      v_question_text,
      v_marks,
      v_difficulty,
      NULLIF(v_correct, ''),
      NULLIF(trim(COALESCE(v_q->>'explanation', '')), '')
    ) RETURNING id INTO v_question_id;

    v_question_count := v_question_count + 1;
    v_total_marks := v_total_marks + v_marks;

    IF v_type IN ('mcq', 'true_false') THEN
      FOR v_option, v_opt_ord IN
        SELECT trim(value #>> '{}'), ordinality
        FROM jsonb_array_elements(v_options) WITH ORDINALITY
      LOOP
        IF v_option IS NULL OR v_option = '' THEN
          CONTINUE;
        END IF;
        INSERT INTO public.exam_question_options (question_id, option_text, is_correct, order_index)
        VALUES (
          v_question_id,
          v_option,
          (
            v_option = v_correct
            OR v_correct = v_opt_ord::text
            OR lower(v_correct) = chr(96 + v_opt_ord::integer)
            OR v_correct = (ARRAY['أ','ب','ج','د','هـ','و'])[v_opt_ord::integer]
            OR (v_type = 'true_false'::public.exam_question_type AND v_option = 'صح' AND v_correct ~* '(true|صح|صحيح)')
            OR (v_type = 'true_false'::public.exam_question_type AND v_option = 'خطأ' AND v_correct ~* '(false|خطأ|خاطئ)')
          ),
          v_opt_ord::integer
        );
      END LOOP;

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

  IF v_question_count = 0 OR v_total_marks <= 0 THEN
    RAISE EXCEPTION 'no valid questions inserted';
  END IF;

  IF v_pass_marks <= 0 THEN
    v_pass_marks := CEIL(v_total_marks * 0.5);
  END IF;

  UPDATE public.exams
  SET total_marks = v_total_marks,
      pass_marks = GREATEST(0, LEAST(v_total_marks, v_pass_marks))
  WHERE id = v_exam_id;

  v_attempt := public.start_exam_attempt(v_exam_id);
  IF COALESCE((v_attempt->>'success')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'failed to start attempt: %', COALESCE(v_attempt->>'error', 'unknown');
  END IF;

  v_attempt_id := (v_attempt->>'attempt_id')::uuid;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct)
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = v_exam_id
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  GET DIAGNOSTICS v_answer_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'examId', v_exam_id,
    'attemptId', v_attempt_id,
    'questionCount', v_question_count,
    'answerCount', v_answer_count,
    'totalMarks', v_total_marks
  );
EXCEPTION WHEN others THEN
  IF v_exam_id IS NOT NULL THEN
    DELETE FROM public.exams WHERE id = v_exam_id;
  END IF;
  RAISE;
END;
$function$;

-- Backward-compatible wrapper for any old callers, but all new code must use the training RPC above.
CREATE OR REPLACE FUNCTION public.create_modrek_ai_exam(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.create_modrek_ai_training_exam(_payload);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_training_exam(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_training_exam(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_training_exam(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_training_exam(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_student_exam_stats(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int := 0;
  v_avg numeric := 0;
  v_best numeric := 0;
  v_time bigint := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exam_statistics' AND column_name = 'average_percentage'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.exam_statistics
        (student_id, total_exams_taken, total_passed, average_percentage, total_time_spent_seconds, by_subject, best_subject, weakest_subject, updated_at)
      SELECT $1,
             COUNT(*),
             COUNT(*) FILTER (WHERE a.passed),
             ROUND(COALESCE(AVG(a.percentage), 0), 2),
             COALESCE(SUM(a.time_spent_seconds), 0),
             '{}'::jsonb,
             NULL,
             NULL,
             now()
      FROM public.exam_attempts a
      JOIN public.exams e ON e.id = a.exam_id
      WHERE a.student_id = $1
        AND a.status IN ('submitted','graded')
        AND COALESCE(e.source, 'teacher') <> 'modrek_ai'
      ON CONFLICT (student_id) DO UPDATE
      SET total_exams_taken = EXCLUDED.total_exams_taken,
          total_passed = EXCLUDED.total_passed,
          average_percentage = EXCLUDED.average_percentage,
          total_time_spent_seconds = EXCLUDED.total_time_spent_seconds,
          updated_at = now()
    $sql$ USING _student_id;
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(AVG(a.percentage),0), COALESCE(MAX(a.percentage),0), COALESCE(SUM(a.time_spent_seconds),0)
  INTO v_total, v_avg, v_best, v_time
  FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  WHERE a.student_id = _student_id
    AND a.status IN ('submitted','graded')
    AND COALESCE(e.source, 'teacher') <> 'modrek_ai';

  INSERT INTO public.exam_statistics (
    student_id, total_exams_taken, average_score, best_score, total_time_spent, updated_at
  ) VALUES (
    _student_id, v_total, ROUND(v_avg,2), v_best, v_time, now()
  )
  ON CONFLICT (student_id) DO UPDATE
  SET total_exams_taken = EXCLUDED.total_exams_taken,
      average_score = EXCLUDED.average_score,
      best_score = EXCLUDED.best_score,
      total_time_spent = EXCLUDED.total_time_spent,
      updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_exam_leaderboard(_exam_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE(rank bigint, student_id uuid, student_name text, percentage numeric, total_score numeric, time_spent_seconds integer, submitted_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.exams e WHERE e.id = _exam_id AND COALESCE(e.source, 'teacher') = 'modrek_ai') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    row_number() OVER (ORDER BY a.percentage DESC, a.time_spent_seconds ASC, a.submitted_at ASC) AS rank,
    a.student_id,
    COALESCE(p.full_name, 'طالب')::text AS student_name,
    a.percentage,
    a.total_score,
    a.time_spent_seconds,
    a.submitted_at
  FROM public.exam_attempts a
  LEFT JOIN public.profiles p ON p.id = a.student_id
  WHERE a.exam_id = _exam_id
    AND a.status IN ('submitted','graded')
    AND NOT public.is_test_student(a.student_id)
  ORDER BY a.percentage DESC, a.time_spent_seconds ASC, a.submitted_at ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
END;
$function$;

NOTIFY pgrst, 'reload schema';