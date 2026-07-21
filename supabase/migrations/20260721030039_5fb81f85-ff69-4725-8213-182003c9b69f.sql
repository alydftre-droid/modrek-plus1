CREATE OR REPLACE FUNCTION public.exam_boolean_answer_key(_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text := public.normalize_exam_grading_text(_value);
BEGIN
  IF v IN ('صح','صحيح','true','t','yes','y','correct','right','1') THEN
    RETURN 'true';
  END IF;
  IF v IN ('خطا','خطاء','غير صحيح','false','f','no','n','wrong','incorrect','0') THEN
    RETURN 'false';
  END IF;
  RETURN NULL;
END;
$$;

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
  v_selected_option_text text;
  v_selected_bool text;
  v_correct_bool text;
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
  PERFORM public.log_exam_attempt_debug('core.received', v_student, NULL, _attempt_id, jsonb_build_object('received_attempt_id', _attempt_id, 'received_student_id', v_student, 'tab_switches', COALESCE(_tab_switches, 0), 'fullscreen_exits', COALESCE(_fullscreen_exits, 0)));
  IF v_student IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated'); END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة', 'code', 'attempt_not_found', 'received_attempt_id', _attempt_id, 'received_student_id', v_student);
  END IF;

  IF v_attempt.status <> 'in_progress'::public.exam_attempt_status THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'exam_id', v_attempt.exam_id, 'already_submitted', true, 'code', 'already_submitted');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود', 'code', 'exam_not_found'); END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(v_exam.id, v_student);
  IF NOT v_is_training_exam THEN
    IF v_exam.group_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.student_group_purchases sgp WHERE sgp.group_id = v_exam.group_id AND sgp.student_id = v_student) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لهذا الطالب', 'code', 'exam_not_accessible');
    END IF;
    IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'exam_target_mismatch');
    END IF;
  END IF;

  SELECT COALESCE(sum(q.marks), 0), COUNT(*) INTO v_max_score, v_questions_count
  FROM public.exam_questions q
  WHERE q.exam_id = v_attempt.exam_id AND q.question_type::text <> 'section';

  SELECT COUNT(*) INTO v_answers_count FROM public.exam_answers WHERE attempt_id = v_attempt.id;
  PERFORM public.log_exam_attempt_debug('core.before_grading', v_student, v_exam.id, v_attempt.id, jsonb_build_object('questions_count', v_questions_count, 'answers_count', v_answers_count, 'max_score', v_max_score));

  FOR v_q IN SELECT * FROM public.exam_questions WHERE exam_id = v_attempt.exam_id AND question_type::text <> 'section' ORDER BY order_index, id LOOP
    v_question_type := v_q.question_type::text;

    INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct, auto_graded, ai_feedback)
    VALUES (v_attempt.id, v_q.id, '{}'::uuid[], NULL, 0, false, true, 'لم يجب الطالب على هذا السؤال.')
    ON CONFLICT (attempt_id, question_id) DO NOTHING;

    SELECT * INTO v_ans FROM public.exam_answers WHERE attempt_id = v_attempt.id AND question_id = v_q.id;
    v_awarded := 0;
    v_feedback := NULL;
    v_answer_text := COALESCE(v_ans.answer_text, '');
    v_selected_opts := COALESCE(v_ans.selected_option_ids, '{}'::uuid[]);
    v_selected_option_text := NULL;
    v_selected_bool := NULL;
    v_correct_bool := public.exam_boolean_answer_key(v_q.correct_answer);

    IF v_question_type IN ('mcq','true_false','tf') THEN
      SELECT COALESCE(array_agg(id ORDER BY order_index, id), '{}'::uuid[])
      INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      SELECT string_agg(option_text, '، ' ORDER BY order_index, id)
      INTO v_selected_option_text
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND id = ANY(v_selected_opts);

      v_selected_bool := public.exam_boolean_answer_key(v_selected_option_text);

      IF cardinality(v_selected_opts) = 0 THEN
        v_awarded := 0;
        v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSIF v_question_type IN ('true_false','tf') AND v_correct_bool IS NOT NULL AND v_selected_bool = v_correct_bool THEN
        v_awarded := COALESCE(v_q.marks, 0);
        v_feedback := 'إجابة صحيحة.';
      ELSIF cardinality(v_correct_opts) > 0 AND v_selected_opts @> v_correct_opts AND v_correct_opts @> v_selected_opts THEN
        v_awarded := COALESCE(v_q.marks, 0);
        v_feedback := 'إجابة صحيحة.';
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

      PERFORM public.log_exam_attempt_debug('core.choice_question_graded', v_student, v_exam.id, v_attempt.id, jsonb_build_object(
        'question_id', v_q.id,
        'answer_id', v_ans.id,
        'question_type', v_question_type,
        'question_order', v_q.order_index,
        'selected_option_ids', v_selected_opts,
        'selected_option_text', v_selected_option_text,
        'selected_bool', v_selected_bool,
        'correct_answer', v_q.correct_answer,
        'correct_bool', v_correct_bool,
        'score', v_awarded,
        'max_score', COALESCE(v_q.marks, 0),
        'uses_question_id', true,
        'uses_array_index', false,
        'feedback', v_feedback
      ));
    ELSIF v_question_type IN ('short_answer','fill_blank','essay') THEN
      IF public.is_exam_non_answer(v_answer_text) THEN
        v_awarded := 0;
        v_feedback := CASE WHEN trim(v_answer_text) = '' THEN 'لم يجب الطالب على هذا السؤال.' ELSE 'لم يقدم الطالب إجابة قابلة للتصحيح لهذا السؤال.' END;
      ELSIF COALESCE(trim(v_q.correct_answer), '') = '' THEN
        v_awarded := 0;
        v_needs_manual := true;
        v_feedback := 'لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم.';
      ELSE
        v_awarded := public.smart_exam_text_score(v_answer_text, v_q.correct_answer, COALESCE(v_q.marks, 0));
        v_needs_ai := true;
        v_feedback := CASE WHEN v_awarded >= COALESCE(v_q.marks, 0) THEN 'إجابة صحيحة بالمعنى.' WHEN v_awarded > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.' ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.' END;
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= COALESCE(v_q.marks, 0),
          auto_graded = NOT v_needs_manual,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;

      PERFORM public.log_exam_attempt_debug('core.text_question_graded', v_student, v_exam.id, v_attempt.id, jsonb_build_object('question_id', v_q.id, 'answer_id', v_ans.id, 'question_type', v_question_type, 'question_order', v_q.order_index, 'student_answer', left(COALESCE(v_answer_text, ''), 900), 'correct_answer', left(COALESCE(v_q.correct_answer, ''), 900), 'score', v_awarded, 'max_score', COALESCE(v_q.marks, 0), 'uses_question_id', true, 'uses_array_index', false, 'feedback', v_feedback));
    END IF;

    v_total_score := v_total_score + COALESCE(v_awarded, 0);
  END LOOP;

  IF v_max_score <= 0 THEN v_max_score := greatest(COALESCE(v_exam.total_marks, 0), v_total_score); END IF;
  v_pct := CASE WHEN v_max_score > 0 THEN round((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := greatest(0, extract(epoch from (now() - v_attempt.started_at))::integer);

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
      fullscreen_exits = COALESCE(_fullscreen_exits, 0),
      updated_at = now()
  WHERE id = v_attempt.id;

  PERFORM public.refresh_student_exam_stats(v_student);
  PERFORM public.log_exam_attempt_debug('core.completed', v_student, v_exam.id, v_attempt.id, jsonb_build_object('total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'passed', v_passed, 'final_status', CASE WHEN v_needs_manual THEN 'submitted' ELSE 'graded' END));
  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt.id, 'resolved_attempt_id', v_attempt.id, 'exam_id', v_exam.id, 'total_score', v_total_score, 'max_score', v_max_score, 'percentage', v_pct, 'passed', v_passed, 'needs_ai_grading', v_needs_ai, 'needs_manual_grading', v_needs_manual, 'code', 'submitted');
END;
$$;

WITH true_false_questions AS (
  SELECT q.id, public.exam_boolean_answer_key(q.correct_answer) correct_key
  FROM public.exam_questions q
  JOIN public.exams e ON e.id = q.exam_id
  WHERE q.question_type::text IN ('true_false','tf')
    AND e.group_id IS NOT NULL
    AND public.exam_boolean_answer_key(q.correct_answer) IS NOT NULL
)
UPDATE public.exam_question_options o
SET is_correct = public.exam_boolean_answer_key(o.option_text) = tf.correct_key
FROM true_false_questions tf
WHERE o.question_id = tf.id
  AND public.exam_boolean_answer_key(o.option_text) IS NOT NULL;

WITH choice_answers AS (
  SELECT
    ea.id AS answer_id,
    ea.attempt_id,
    q.id AS question_id,
    q.marks,
    q.question_type::text AS question_type,
    public.exam_boolean_answer_key(q.correct_answer) AS correct_bool,
    public.exam_boolean_answer_key(string_agg(o.option_text, '، ' ORDER BY o.order_index, o.id)) AS selected_bool,
    COALESCE(array_agg(co.id ORDER BY co.order_index, co.id) FILTER (WHERE co.is_correct), '{}'::uuid[]) AS correct_opts,
    COALESCE(ea.selected_option_ids, '{}'::uuid[]) AS selected_opts,
    string_agg(o.option_text, '، ' ORDER BY o.order_index, o.id) AS selected_text
  FROM public.exam_answers ea
  JOIN public.exam_questions q ON q.id = ea.question_id
  JOIN public.exams e ON e.id = q.exam_id
  LEFT JOIN public.exam_question_options o ON o.question_id = q.id AND o.id = ANY(COALESCE(ea.selected_option_ids, '{}'::uuid[]))
  LEFT JOIN public.exam_question_options co ON co.question_id = q.id
  WHERE e.group_id IS NOT NULL
    AND q.question_type::text IN ('mcq','true_false','tf')
    AND ea.attempt_id IN (
      SELECT id FROM public.exam_attempts WHERE status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status)
    )
  GROUP BY ea.id, ea.attempt_id, q.id, q.marks, q.question_type, q.correct_answer, ea.selected_option_ids
), repaired_answers AS (
  UPDATE public.exam_answers ea
  SET marks_awarded = CASE
        WHEN ca.question_type IN ('true_false','tf') AND ca.correct_bool IS NOT NULL AND ca.selected_bool = ca.correct_bool THEN COALESCE(ca.marks, 0)
        WHEN cardinality(ca.correct_opts) > 0 AND ca.selected_opts @> ca.correct_opts AND ca.correct_opts @> ca.selected_opts THEN COALESCE(ca.marks, 0)
        ELSE 0
      END,
      is_correct = CASE
        WHEN ca.question_type IN ('true_false','tf') AND ca.correct_bool IS NOT NULL AND ca.selected_bool = ca.correct_bool THEN true
        WHEN cardinality(ca.correct_opts) > 0 AND ca.selected_opts @> ca.correct_opts AND ca.correct_opts @> ca.selected_opts THEN true
        ELSE false
      END,
      auto_graded = true,
      ai_feedback = CASE
        WHEN cardinality(ca.selected_opts) = 0 THEN 'لم يجب الطالب على هذا السؤال.'
        WHEN (ca.question_type IN ('true_false','tf') AND ca.correct_bool IS NOT NULL AND ca.selected_bool = ca.correct_bool) OR (cardinality(ca.correct_opts) > 0 AND ca.selected_opts @> ca.correct_opts AND ca.correct_opts @> ca.selected_opts) THEN 'إجابة صحيحة.'
        ELSE 'إجابة غير صحيحة. راجع الإجابة الصحيحة.'
      END
  FROM choice_answers ca
  WHERE ea.id = ca.answer_id
  RETURNING ea.attempt_id
), totals AS (
  SELECT ea.attempt_id, COALESCE(sum(ea.marks_awarded), 0) AS total_score, COALESCE(sum(q.marks), 0) AS max_score
  FROM public.exam_answers ea
  JOIN public.exam_questions q ON q.id = ea.question_id AND q.question_type::text <> 'section'
  WHERE ea.attempt_id IN (SELECT DISTINCT attempt_id FROM repaired_answers)
  GROUP BY ea.attempt_id
)
UPDATE public.exam_attempts at
SET total_score = totals.total_score,
    max_score = CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END,
    percentage = CASE WHEN COALESCE(CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END, 0) > 0 THEN round((totals.total_score / (CASE WHEN COALESCE(at.max_score, 0) > 0 THEN at.max_score ELSE totals.max_score END)) * 100, 2) ELSE 0 END,
    passed = totals.total_score >= COALESCE((SELECT pass_marks FROM public.exams e WHERE e.id = at.exam_id), 0),
    updated_at = now()
FROM totals
WHERE totals.attempt_id = at.id;

REVOKE ALL ON FUNCTION public.exam_boolean_answer_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_boolean_answer_key(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_exam_attempt_core(uuid, integer, integer) TO authenticated, service_role;