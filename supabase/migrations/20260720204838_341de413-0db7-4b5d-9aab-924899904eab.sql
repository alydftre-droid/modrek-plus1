CREATE OR REPLACE FUNCTION public.grade_exam_attempt_core(
  _attempt_id uuid,
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
  v_exam public.exams%ROWTYPE;
  v_total_score numeric := 0;
  v_max_score numeric := 0;
  v_q record;
  v_ans public.exam_answers%ROWTYPE;
  v_correct_opts uuid[];
  v_selected_opts uuid[];
  v_pct numeric := 0;
  v_passed boolean := false;
  v_time_spent integer;
  v_needs_ai boolean := false;
  v_needs_manual boolean := false;
  v_awarded numeric := 0;
  v_answer_text text;
  v_question_type text;
  v_feedback text;
  v_is_training_exam boolean := false;
  v_questions_count integer := 0;
  v_answers_count integer := 0;
BEGIN
  PERFORM public.log_exam_attempt_debug('core.received', v_student, NULL, _attempt_id, jsonb_build_object(
    'received_attempt_id', _attempt_id,
    'received_student_id', v_student,
    'tab_switches', COALESCE(_tab_switches, 0),
    'fullscreen_exits', COALESCE(_fullscreen_exits, 0)
  ));
  RAISE LOG '[exam-debug] grade_exam_attempt_core.received student_id=% attempt_id=%', v_student, _attempt_id;

  IF v_student IS NULL THEN
    PERFORM public.log_exam_attempt_debug('core.rejected.not_authenticated', NULL, NULL, _attempt_id, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    PERFORM public.log_exam_attempt_debug('core.failed.attempt_not_found', v_student, NULL, _attempt_id, jsonb_build_object(
      'received_attempt_id', _attempt_id,
      'received_student_id', v_student,
      'attempt_row', CASE WHEN FOUND THEN to_jsonb(v_attempt) ELSE NULL END
    ));
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة', 'code', 'attempt_not_found');
  END IF;

  PERFORM public.log_exam_attempt_debug('core.attempt_loaded', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object(
    'status', v_attempt.status,
    'started_at', v_attempt.started_at,
    'created_at', v_attempt.created_at
  ));

  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    PERFORM public.log_exam_attempt_debug('core.already_submitted', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('status', v_attempt.status));
    RETURN jsonb_build_object(
      'success', true,
      'attempt_id', v_attempt.id,
      'resolved_attempt_id', v_attempt.id,
      'exam_id', v_attempt.exam_id,
      'already_submitted', true,
      'code', 'already_submitted'
    );
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF NOT FOUND THEN
    PERFORM public.log_exam_attempt_debug('core.failed.exam_not_found', v_student, v_attempt.exam_id, v_attempt.id, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود', 'code', 'exam_not_found');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(v_exam.id, v_student);

  IF NOT v_is_training_exam THEN
    IF v_exam.group_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.group_id = v_exam.group_id
        AND sgp.student_id = v_student
    ) THEN
      PERFORM public.log_exam_attempt_debug('core.rejected.not_purchased', v_student, v_exam.id, v_attempt.id, jsonb_build_object('group_id', v_exam.group_id));
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لهذا الطالب', 'code', 'exam_not_accessible');
    END IF;

    IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
      PERFORM public.log_exam_attempt_debug('core.rejected.target_mismatch', v_student, v_exam.id, v_attempt.id, jsonb_build_object(
        'target_section', v_exam.target_section,
        'target_education_type', v_exam.target_education_type
      ));
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'exam_target_mismatch');
    END IF;
  END IF;

  SELECT COALESCE(sum(q.marks), 0), COUNT(*) INTO v_max_score, v_questions_count
  FROM public.exam_questions q
  WHERE q.exam_id = v_attempt.exam_id
    AND q.question_type::text <> 'section';

  SELECT COUNT(*) INTO v_answers_count FROM public.exam_answers WHERE attempt_id = v_attempt.id;
  PERFORM public.log_exam_attempt_debug('core.before_grading', v_student, v_exam.id, v_attempt.id, jsonb_build_object(
    'questions_count', v_questions_count,
    'answers_count', v_answers_count,
    'max_score', v_max_score
  ));

  FOR v_q IN
    SELECT *
    FROM public.exam_questions
    WHERE exam_id = v_attempt.exam_id
      AND question_type::text <> 'section'
    ORDER BY order_index
  LOOP
    v_question_type := v_q.question_type::text;

    INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct, auto_graded, ai_feedback)
    VALUES (v_attempt.id, v_q.id, '{}'::uuid[], NULL, 0, false, true, 'لم يجب الطالب على هذا السؤال.')
    ON CONFLICT (attempt_id, question_id) DO NOTHING;

    SELECT * INTO v_ans
    FROM public.exam_answers
    WHERE attempt_id = v_attempt.id AND question_id = v_q.id;

    v_awarded := 0;
    v_feedback := NULL;
    v_answer_text := COALESCE(v_ans.answer_text, '');
    v_selected_opts := COALESCE(v_ans.selected_option_ids, '{}'::uuid[]);

    IF v_question_type IN ('mcq','true_false','tf') THEN
      SELECT COALESCE(array_agg(id ORDER BY order_index), '{}'::uuid[]) INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      IF cardinality(v_correct_opts) > 0
         AND v_selected_opts @> v_correct_opts
         AND v_correct_opts @> v_selected_opts THEN
        v_awarded := COALESCE(v_q.marks, 0);
        v_feedback := 'إجابة صحيحة.';
      ELSIF cardinality(v_selected_opts) = 0 THEN
        v_awarded := 0;
        v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSE
        v_awarded := 0;
        v_feedback := 'إجابة غير صحيحة. راجع الإجابة الصحيحة.';
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= COALESCE(v_q.marks, 0),
          auto_graded = true,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;

    ELSIF v_question_type IN ('short_answer','fill_blank','essay') THEN
      IF trim(v_answer_text) = '' THEN
        v_awarded := 0;
        v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSIF COALESCE(trim(v_q.correct_answer), '') = '' THEN
        v_awarded := 0;
        v_needs_manual := true;
        v_feedback := 'لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم.';
      ELSE
        v_awarded := public.smart_exam_text_score(v_answer_text, v_q.correct_answer, COALESCE(v_q.marks, 0));
        v_needs_ai := true;
        v_feedback := CASE
          WHEN v_awarded >= COALESCE(v_q.marks, 0) THEN 'إجابة صحيحة بالمعنى.'
          WHEN v_awarded > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.'
          ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.'
        END;
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= COALESCE(v_q.marks, 0),
          auto_graded = NOT v_needs_manual,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;
    END IF;

    v_total_score := v_total_score + COALESCE(v_awarded, 0);
  END LOOP;

  IF v_max_score <= 0 THEN
    v_max_score := greatest(COALESCE(v_exam.total_marks, 0), v_total_score);
  END IF;
  v_pct := CASE WHEN v_max_score > 0 THEN round((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := greatest(0, extract(epoch from (now() - v_attempt.started_at))::integer);

  PERFORM public.log_exam_attempt_debug('core.before_attempt_update', v_student, v_exam.id, v_attempt.id, jsonb_build_object(
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'needs_ai_grading', v_needs_ai,
    'needs_manual_grading', v_needs_manual
  ));

  UPDATE public.exam_attempts
  SET status = CASE WHEN v_needs_manual THEN 'submitted'::exam_attempt_status ELSE 'graded'::exam_attempt_status END,
      submitted_at = now(),
      completed_at = now(),
      total_score = v_total_score,
      max_score = v_max_score,
      percentage = v_pct,
      passed = v_passed,
      is_graded = NOT v_needs_manual,
      graded_at = CASE WHEN v_needs_manual THEN NULL ELSE now() END,
      time_spent_seconds = CASE WHEN COALESCE(time_spent_seconds, 0) > 0 THEN time_spent_seconds ELSE v_time_spent END,
      tab_switch_count = COALESCE(_tab_switches, 0),
      fullscreen_exit_count = COALESCE(_fullscreen_exits, 0),
      fullscreen_exits = COALESCE(_fullscreen_exits, 0),
      updated_at = now()
  WHERE id = v_attempt.id;

  PERFORM public.refresh_student_exam_stats(v_student);
  PERFORM public.log_exam_attempt_debug('core.completed', v_student, v_exam.id, v_attempt.id, jsonb_build_object(
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'final_status', CASE WHEN v_needs_manual THEN 'submitted' ELSE 'graded' END
  ));
  RAISE LOG '[exam-debug] grade_exam_attempt_core.completed student_id=% exam_id=% attempt_id=% score=%/% status=%', v_student, v_exam.id, v_attempt.id, v_total_score, v_max_score, CASE WHEN v_needs_manual THEN 'submitted' ELSE 'graded' END;

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', v_attempt.id,
    'resolved_attempt_id', v_attempt.id,
    'exam_id', v_exam.id,
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'needs_ai_grading', v_needs_ai,
    'needs_manual_grading', v_needs_manual,
    'code', 'submitted'
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
BEGIN
  PERFORM public.log_exam_attempt_debug('submit.received', v_student, _exam_id, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_exam_id', _exam_id, 'received_student_id', v_student, 'answers_count', v_answers_count));
  RAISE LOG '[exam-debug] submit_exam_attempt_resilient.received received_attempt_id=% received_exam_id=% received_student_id=% answers_count=%', _attempt_id, _exam_id, v_student, v_answers_count;

  IF v_student IS NULL THEN
    PERFORM public.log_exam_attempt_debug('submit.rejected.not_authenticated', NULL, _exam_id, _attempt_id, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

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
      PERFORM public.log_exam_attempt_debug('submit.rejected.missing_context', v_student, NULL, NULL, '{}'::jsonb);
      RETURN jsonb_build_object('success', false, 'error', 'بيانات المحاولة غير مكتملة', 'code', 'missing_attempt_context');
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
      PERFORM public.log_exam_attempt_debug('submit.recovered_latest_in_progress', v_student, _exam_id, v_attempt.id, jsonb_build_object('original_received_attempt_id', _attempt_id));
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
        PERFORM public.log_exam_attempt_debug('submit.answer_skipped.invalid_question_id', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('answer', v_answer));
        CONTINUE;
      END;

      IF NOT EXISTS (
        SELECT 1
        FROM public.exam_questions q
        WHERE q.id = v_question_id
          AND q.exam_id = v_attempt.exam_id
          AND q.question_type::text <> 'section'
      ) THEN
        PERFORM public.log_exam_attempt_debug('submit.answer_skipped.question_not_in_exam', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('question_id', v_question_id));
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

      PERFORM public.log_exam_attempt_debug('submit.answer_saved', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object(
        'question_id', v_question_id,
        'selected_count', cardinality(COALESCE(v_selected, '{}'::uuid[])),
        'has_text', v_answer_text IS NOT NULL
      ));
    END LOOP;
  END IF;

  PERFORM public.log_exam_attempt_debug('submit.before_core_submit', v_student, v_attempt.exam_id, v_attempt.id, jsonb_build_object('answers_count_sent', v_answers_count, 'answers_count_in_db', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt.id)));

  v_submit := public.grade_exam_attempt_core(
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

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  _attempt_id uuid,
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
  v_exam_id uuid := NULL;
  v_res jsonb;
BEGIN
  PERFORM public.log_exam_attempt_debug('legacy_submit.received', v_student, NULL, _attempt_id, jsonb_build_object(
    'received_attempt_id', _attempt_id,
    'received_student_id', v_student,
    'note', 'legacy RPC bridged to submit_exam_attempt_resilient'
  ));
  RAISE LOG '[exam-debug] submit_exam_attempt.legacy_bridge.received student_id=% attempt_id=%', v_student, _attempt_id;

  IF v_student IS NULL THEN
    PERFORM public.log_exam_attempt_debug('legacy_submit.rejected.not_authenticated', NULL, NULL, _attempt_id, '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  IF _attempt_id IS NOT NULL THEN
    SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id LIMIT 1;
    IF FOUND AND v_attempt.student_id = v_student THEN
      v_exam_id := v_attempt.exam_id;
    END IF;
  END IF;

  IF v_exam_id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.exam_attempts
    WHERE student_id = v_student
      AND status = 'in_progress'::public.exam_attempt_status
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1;
    IF FOUND THEN
      v_exam_id := v_attempt.exam_id;
      PERFORM public.log_exam_attempt_debug('legacy_submit.recovered_latest_attempt', v_student, v_exam_id, v_attempt.id, jsonb_build_object('original_received_attempt_id', _attempt_id));
    END IF;
  END IF;

  v_res := public.submit_exam_attempt_resilient(
    v_exam_id,
    COALESCE(_attempt_id, v_attempt.id),
    '[]'::jsonb,
    COALESCE(_tab_switches, 0),
    COALESCE(_fullscreen_exits, 0)
  );

  PERFORM public.log_exam_attempt_debug('legacy_submit.completed', v_student, COALESCE(v_exam_id, (v_res->>'exam_id')::uuid), COALESCE((v_res->>'resolved_attempt_id')::uuid, (v_res->>'attempt_id')::uuid, _attempt_id), jsonb_build_object('result', v_res));
  RETURN v_res || jsonb_build_object('legacy_bridge', true);
END;
$$;

REVOKE ALL ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, jsonb, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';