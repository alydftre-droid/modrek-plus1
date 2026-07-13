CREATE OR REPLACE FUNCTION public.is_modrek_ai_training_exam_for_student(
  _source text,
  _owner_student_id uuid,
  _teacher_id uuid,
  _group_id uuid,
  _student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _student_id IS NOT NULL
     AND _owner_student_id = _student_id
     AND (
       COALESCE(_source, 'teacher') = 'modrek_ai'
       OR (_owner_student_id IS NOT NULL AND _teacher_id IS NULL AND _group_id IS NULL)
     )
$$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_existing_count integer;
  v_in_progress uuid;
  v_attempt_id uuid;
  v_max_score numeric;
  v_is_training_exam boolean := false;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح');
  END IF;

  v_is_training_exam := public.is_modrek_ai_training_exam_for_student(
    v_exam.source,
    v_exam.owner_student_id,
    v_exam.teacher_id,
    v_exam.group_id,
    v_student
  );

  IF NOT v_is_training_exam THEN
    IF COALESCE(v_exam.source, 'teacher') = 'modrek_ai' OR v_exam.owner_student_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا التدريب تابع لطالب آخر أو جلسة أخرى');
    END IF;

    IF v_exam.group_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير مرتبط بمجموعة');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.group_id = v_exam.group_id
        AND sgp.student_id = v_student
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة المشتركين');
    END IF;

    IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك');
    END IF;
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يبدأ وقت الامتحان بعد');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت إتاحة الامتحان');
  END IF;

  SELECT id INTO v_in_progress
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_in_progress IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_in_progress, 'resumed', true, 'training_exam', v_is_training_exam);
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status IN ('submitted','graded','expired');

  IF v_existing_count >= COALESCE(v_exam.max_attempts, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد المحاولات');
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions
  WHERE exam_id = _exam_id;

  BEGIN
    INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score)
    VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score)
    RETURNING id INTO v_attempt_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_attempt_id
    FROM public.exam_attempts
    WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_attempt_id IS NULL THEN
      RAISE;
    END IF;

    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', true, 'training_exam', v_is_training_exam);
  END;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct)
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', false, 'training_exam', v_is_training_exam);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_authorized boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = _exam_id
      AND e.is_published = true
      AND e.status = 'published'::exam_status
      AND (
        public.is_modrek_ai_training_exam_for_student(e.source, e.owner_student_id, e.teacher_id, e.group_id, v_uid)
        OR (
          e.group_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.student_group_purchases sgp
            WHERE sgp.group_id = e.group_id AND sgp.student_id = v_uid
          )
          AND public.exam_target_matches_student(v_uid, e.target_section, e.target_education_type)
        )
        OR e.teacher_id = v_uid
        OR public.has_role(v_uid, 'admin'::app_role)
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'exam_id', q.exam_id,
      'order_index', q.order_index,
      'question_type', q.question_type,
      'question_text', q.question_text,
      'image_url', q.image_url,
      'marks', q.marks,
      'difficulty', q.difficulty,
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id,
          'question_id', o.question_id,
          'order_index', o.order_index,
          'option_text', o.option_text,
          'image_url', o.image_url
        ) ORDER BY o.order_index)
        FROM public.exam_question_options o
        WHERE o.question_id = q.id
      ), '[]'::jsonb)
    ) ORDER BY q.order_index
  ), '[]'::jsonb)
  INTO v_result
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(_attempt_id uuid, _tab_switches integer DEFAULT 0, _fullscreen_exits integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_attempt public.exam_attempts%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_total_score numeric := 0;
  v_max_score numeric := 0;
  v_q record;
  v_ans record;
  v_correct_opts uuid[];
  v_pct numeric := 0;
  v_passed boolean := false;
  v_time_spent integer;
  v_needs_ai boolean := false;
  v_similarity numeric := 0;
  v_awarded numeric := 0;
  v_is_training_exam boolean := false;
BEGIN
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

  v_is_training_exam := public.is_modrek_ai_training_exam_for_student(
    v_exam.source,
    v_exam.owner_student_id,
    v_exam.teacher_id,
    v_exam.group_id,
    v_student
  );

  IF NOT v_is_training_exam THEN
    IF v_exam.group_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.group_id = v_exam.group_id
        AND sgp.student_id = v_student
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لهذا الطالب');
    END IF;
  END IF;

  FOR v_q IN SELECT * FROM public.exam_questions WHERE exam_id = v_attempt.exam_id LOOP
    v_max_score := v_max_score + v_q.marks;

    SELECT * INTO v_ans FROM public.exam_answers
    WHERE attempt_id = _attempt_id AND question_id = v_q.id;

    IF NOT FOUND THEN
      INSERT INTO public.exam_answers (attempt_id, question_id, marks_awarded, is_correct)
      VALUES (_attempt_id, v_q.id, 0, false)
      ON CONFLICT (attempt_id, question_id) DO NOTHING;
      CONTINUE;
    END IF;

    IF v_q.question_type IN ('mcq','true_false') THEN
      SELECT array_agg(id ORDER BY id) INTO v_correct_opts
      FROM public.exam_question_options
      WHERE question_id = v_q.id AND is_correct = true;

      IF v_correct_opts IS NOT NULL
         AND v_ans.selected_option_ids @> v_correct_opts
         AND v_correct_opts @> v_ans.selected_option_ids THEN
        UPDATE public.exam_answers SET is_correct = true, marks_awarded = v_q.marks
        WHERE id = v_ans.id;
        v_total_score := v_total_score + v_q.marks;
      ELSE
        UPDATE public.exam_answers SET is_correct = false, marks_awarded = 0
        WHERE id = v_ans.id;
      END IF;
    ELSIF v_q.question_type IN ('short_answer','fill_blank') THEN
      v_needs_ai := true;
      v_similarity := public.exam_text_similarity(v_ans.answer_text, v_q.correct_answer);
      v_awarded := CASE
        WHEN v_similarity >= 0.90 THEN v_q.marks
        WHEN v_similarity >= 0.70 THEN ROUND(v_q.marks * 0.75, 2)
        WHEN v_similarity >= 0.45 THEN ROUND(v_q.marks * 0.50, 2)
        WHEN v_similarity >= 0.25 THEN ROUND(v_q.marks * 0.25, 2)
        ELSE 0
      END;
      UPDATE public.exam_answers
      SET is_correct = v_awarded >= v_q.marks,
          marks_awarded = v_awarded,
          ai_feedback = CASE WHEN v_awarded > 0 AND v_awarded < v_q.marks THEN 'تم احتساب درجة جزئية حسب قرب الإجابة من النموذج.' ELSE ai_feedback END
      WHERE id = v_ans.id;
      v_total_score := v_total_score + v_awarded;
    ELSIF v_q.question_type = 'essay' THEN
      v_needs_ai := true;
      UPDATE public.exam_answers
      SET is_correct = false,
          marks_awarded = 0,
          ai_feedback = 'بانتظار التصحيح الذكي العادل.'
      WHERE id = v_ans.id;
    END IF;
  END LOOP;

  v_pct := CASE WHEN v_max_score > 0 THEN ROUND((v_total_score / v_max_score) * 100, 2) ELSE 0 END;
  v_passed := v_total_score >= COALESCE(v_exam.pass_marks, 0);
  v_time_spent := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_attempt.started_at))::int);

  UPDATE public.exam_attempts
  SET status = CASE WHEN v_needs_ai THEN 'submitted'::exam_attempt_status ELSE 'graded'::exam_attempt_status END,
      submitted_at = now(),
      time_spent_seconds = v_time_spent,
      total_score = v_total_score,
      max_score = v_max_score,
      percentage = v_pct,
      passed = v_passed,
      tab_switch_count = GREATEST(COALESCE(tab_switch_count, 0), COALESCE(_tab_switches, 0)),
      fullscreen_exits = GREATEST(COALESCE(fullscreen_exits, 0), COALESCE(_fullscreen_exits, 0)),
      suspicious_activity = jsonb_set(COALESCE(suspicious_activity, '[]'::jsonb), '{0}', COALESCE(suspicious_activity->0, '{}'::jsonb), true),
      is_graded = NOT v_needs_ai,
      graded_at = CASE WHEN v_needs_ai THEN NULL ELSE now() END
  WHERE id = _attempt_id;

  IF NOT v_is_training_exam THEN
    PERFORM public.sync_exam_attempts_count(v_attempt.exam_id);
    PERFORM public.refresh_student_exam_stats(v_student);
  END IF;

  DELETE FROM public.exam_drafts WHERE student_id = v_student AND exam_id = v_attempt.exam_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_score', v_total_score,
    'max_score', v_max_score,
    'percentage', v_pct,
    'passed', v_passed,
    'needs_ai_grading', v_needs_ai,
    'training_exam', v_is_training_exam
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';