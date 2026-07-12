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
  v_is_modrek_owner boolean;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح');
  END IF;

  v_is_modrek_owner := (v_exam.source = 'modrek_ai' AND v_exam.owner_student_id = v_student);

  IF NOT v_is_modrek_owner THEN
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
    RETURN jsonb_build_object('success', true, 'attempt_id', v_in_progress, 'resumed', true);
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

    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', true);
  END;

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', false);
END;
$function$;

NOTIFY pgrst, 'reload schema';