CREATE OR REPLACE FUNCTION public.normalize_exam_grading_text(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(_value, '')), '[أإآٱا]', 'ا', 'g'),
          '[ىي]', 'ي', 'g'
        ),
        'ة', 'ه', 'g'
      ),
      '[^[:alnum:]ء-ي]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.smart_exam_text_score(_answer text, _model text, _max_score numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  a text := public.normalize_exam_grading_text(_answer);
  m text := public.normalize_exam_grading_text(_model);
  a_words text[];
  m_words text[];
  common_count integer := 0;
  meaningful_model_count integer := 0;
  coverage numeric := 0;
  word text;
BEGIN
  IF coalesce(_max_score, 0) <= 0 OR a = '' OR m = '' THEN
    RETURN 0;
  END IF;

  IF a = m OR position(a in m) > 0 OR position(m in a) > 0 THEN
    RETURN round(_max_score::numeric, 2);
  END IF;

  a_words := regexp_split_to_array(a, '\s+');
  m_words := regexp_split_to_array(m, '\s+');

  FOREACH word IN ARRAY m_words LOOP
    IF length(word) >= 3 THEN
      meaningful_model_count := meaningful_model_count + 1;
      IF word = ANY(a_words) THEN
        common_count := common_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF meaningful_model_count = 0 THEN
    RETURN 0;
  END IF;

  coverage := common_count::numeric / meaningful_model_count::numeric;

  RETURN round((
    CASE
      WHEN coverage >= 0.85 THEN _max_score
      WHEN coverage >= 0.70 THEN _max_score * 0.85
      WHEN coverage >= 0.55 THEN _max_score * 0.70
      WHEN coverage >= 0.40 THEN _max_score * 0.50
      WHEN coverage >= 0.25 THEN _max_score * 0.30
      WHEN coverage >= 0.15 THEN _max_score * 0.15
      ELSE 0
    END
  )::numeric, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(_attempt_id uuid, _tab_switches integer DEFAULT 0, _fullscreen_exits integer DEFAULT 0)
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
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_attempt FROM public.exam_attempts WHERE id = _attempt_id;
  IF NOT FOUND OR v_attempt.student_id <> v_student THEN
    RETURN jsonb_build_object('success', false, 'error', 'محاولة غير صالحة');
  END IF;
  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم التسليم مسبقاً');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_attempt.exam_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(v_exam.id, v_student);

  IF NOT v_is_training_exam THEN
    IF v_exam.group_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.group_id = v_exam.group_id
        AND sgp.student_id = v_student
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لهذا الطالب');
    END IF;

    IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك');
    END IF;
  END IF;

  SELECT COALESCE(sum(q.marks), 0) INTO v_max_score
  FROM public.exam_questions q
  WHERE q.exam_id = v_attempt.exam_id
    AND q.question_type::text <> 'section';

  FOR v_q IN
    SELECT *
    FROM public.exam_questions
    WHERE exam_id = v_attempt.exam_id
      AND question_type::text <> 'section'
    ORDER BY order_index
  LOOP
    v_question_type := v_q.question_type::text;

    INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct, auto_graded, ai_feedback)
    VALUES (_attempt_id, v_q.id, '{}'::uuid[], NULL, 0, false, true, 'لم يجب الطالب على هذا السؤال.')
    ON CONFLICT (attempt_id, question_id) DO NOTHING;

    SELECT * INTO v_ans
    FROM public.exam_answers
    WHERE attempt_id = _attempt_id AND question_id = v_q.id;

    v_awarded := 0;
    v_feedback := NULL;
    v_answer_text := coalesce(v_ans.answer_text, '');
    v_selected_opts := coalesce(v_ans.selected_option_ids, '{}'::uuid[]);

    IF v_question_type IN ('mcq','true_false','tf') THEN
      SELECT coalesce(array_agg(id ORDER BY order_index), '{}'::uuid[]) INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      IF cardinality(v_correct_opts) > 0
         AND v_selected_opts @> v_correct_opts
         AND v_correct_opts @> v_selected_opts THEN
        v_awarded := coalesce(v_q.marks, 0);
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
          is_correct = v_awarded >= coalesce(v_q.marks, 0),
          auto_graded = true,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;

    ELSIF v_question_type IN ('short_answer','fill_blank','essay') THEN
      IF trim(v_answer_text) = '' THEN
        v_awarded := 0;
        v_feedback := 'لم يجب الطالب على هذا السؤال.';
      ELSIF coalesce(trim(v_q.correct_answer), '') = '' THEN
        v_awarded := 0;
        v_needs_manual := true;
        v_feedback := 'لا توجد إجابة نموذجية محفوظة لهذا السؤال؛ يحتاج مراجعة المعلم.';
      ELSE
        v_awarded := public.smart_exam_text_score(v_answer_text, v_q.correct_answer, coalesce(v_q.marks, 0));
        v_needs_ai := true;
        v_feedback := CASE
          WHEN v_awarded >= coalesce(v_q.marks, 0) THEN 'إجابة صحيحة بالمعنى.'
          WHEN v_awarded > 0 THEN 'تم منح درجة جزئية حسب العناصر الصحيحة ومعنى الإجابة.'
          ELSE 'الإجابة لا تحتوي على عناصر كافية من الإجابة النموذجية.'
        END;
      END IF;

      UPDATE public.exam_answers
      SET marks_awarded = v_awarded,
          is_correct = v_awarded >= coalesce(v_q.marks, 0),
          auto_graded = NOT v_needs_manual,
          ai_feedback = v_feedback
      WHERE id = v_ans.id;
    END IF;

    v_total_score := v_total_score + coalesce(v_awarded, 0);
  END LOOP;

  IF v_max_score <= 0 THEN
    v_max_score := greatest(coalesce(v_exam.total_marks, 0), v_total_score);
  END IF;
  v_pct := CASE WHEN v_max_score > 0 THEN round((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= coalesce(v_exam.pass_marks, 0);
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
      time_spent_seconds = CASE WHEN coalesce(time_spent_seconds, 0) > 0 THEN time_spent_seconds ELSE v_time_spent END,
      tab_switch_count = coalesce(_tab_switches, 0),
      fullscreen_exit_count = coalesce(_fullscreen_exits, 0),
      fullscreen_exits = coalesce(_fullscreen_exits, 0),
      updated_at = now()
  WHERE id = _attempt_id;

  PERFORM public.refresh_student_exam_stats(v_student);

  RETURN jsonb_build_object(
    'success', true,
    'attempt_id', _attempt_id,
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'needs_ai_grading', v_needs_ai,
    'needs_manual_grading', v_needs_manual
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_exam_grading_text(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated, service_role;