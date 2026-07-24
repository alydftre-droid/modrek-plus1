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
  v_attempt_id uuid;
  v_max_score numeric;
  v_is_training_exam boolean := false;
  v_existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  PERFORM public.log_exam_attempt_debug('start.received', v_student, _exam_id, NULL, jsonb_build_object('student_id', v_student, 'exam_id', _exam_id));

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول', 'code', 'not_authenticated');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح', 'code', 'exam_unavailable');
  END IF;

  v_is_training_exam := public.is_modrek_training_exam_accessible(_exam_id, v_student);

  IF v_is_training_exam THEN
    RETURN public.start_modrek_training_attempt(_exam_id, NULL);
  END IF;

  IF COALESCE(v_exam.source, 'teacher') = 'modrek_ai'
     OR v_exam.owner_student_id IS NOT NULL
     OR (v_exam.teacher_id IS NULL AND v_exam.group_id IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا التدريب تابع لطالب آخر أو غير متاح', 'training_exam', true, 'code', 'training_not_available');
  END IF;

  IF v_exam.group_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير مرتبط بمجموعة', 'code', 'missing_group');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = v_exam.group_id
      AND sgp.student_id = v_student
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.content_groups exam_group ON exam_group.id = v_exam.group_id
    JOIN public.subjects exam_subject ON exam_subject.id = exam_group.subject_id
    JOIN public.student_group_purchases purchased ON purchased.student_id = v_student
    JOIN public.content_groups purchased_group ON purchased_group.id = purchased.group_id
    JOIN public.subjects purchased_subject ON purchased_subject.id = purchased_group.subject_id
    WHERE p.id = v_student
      AND public.normalize_content_section(p.section) = 'literary'
      AND COALESCE(purchased_group.is_active, true) = true
      AND (purchased_group.teacher_id = exam_group.teacher_id OR purchased_group.created_by = exam_group.created_by)
      AND purchased_subject.name = exam_subject.name
      AND purchased_subject.stage = exam_subject.stage
      AND purchased_subject.grade = exam_subject.grade
      AND purchased_subject.category = exam_subject.category
      AND public.normalize_content_section(purchased_subject.section) = 'literary'
      AND public.normalize_content_section(exam_subject.section) = 'literary'
      AND (
        public.normalize_content_education_type(purchased_group.education_type) IS NULL
        OR public.normalize_content_education_type(p.education_type) IS NULL
        OR public.normalize_content_education_type(purchased_group.education_type) = public.normalize_content_education_type(p.education_type)
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان متاح فقط لطلاب المجموعة المشتركين', 'code', 'not_in_group');
  END IF;

  IF NOT public.exam_target_matches_student(v_student, v_exam.target_section, v_exam.target_education_type) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذا الامتحان غير متاح لشعبتك أو نوع تعليمك', 'code', 'target_mismatch');
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يبدأ وقت الامتحان بعد', 'code', 'not_started');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت إتاحة الامتحان', 'code', 'ended');
  END IF;

  SELECT * INTO v_existing_attempt
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  ORDER BY started_at DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_existing_attempt.id, 'student_id', v_student, 'exam_id', _exam_id, 'resumed', true, 'training_exam', false, 'code', 'attempt_resumed');
  END IF;

  SELECT count(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status IN ('submitted','graded','expired');

  IF v_existing_count >= COALESCE(v_exam.max_attempts, 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'تم استنفاد عدد المحاولات', 'code', 'max_attempts_reached');
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions
  WHERE exam_id = _exam_id
    AND question_type::text <> 'section';

  INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score, status, submitted_at)
  VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score, 'in_progress'::public.exam_attempt_status, NULL)
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.exam_answers (attempt_id, question_id, selected_option_ids, answer_text, marks_awarded, is_correct)
  SELECT v_attempt_id, q.id, '{}'::uuid[], NULL, 0, NULL
  FROM public.exam_questions q
  WHERE q.exam_id = _exam_id
    AND q.question_type::text <> 'section'
  ON CONFLICT (attempt_id, question_id) DO NOTHING;

  PERFORM public.log_exam_attempt_debug('start.created', v_student, _exam_id, v_attempt_id, jsonb_build_object('attempt_id', v_attempt_id, 'precreated_answers', (SELECT count(*) FROM public.exam_answers WHERE attempt_id = v_attempt_id)));

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'student_id', v_student, 'exam_id', _exam_id, 'resumed', false, 'training_exam', false, 'code', 'attempt_created');
END;
$function$;

REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';