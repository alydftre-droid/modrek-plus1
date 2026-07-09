CREATE OR REPLACE FUNCTION public.normalize_exam_target_education_type(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN ('general', 'عام', 'تعليم عام', 'العام') THEN 'عام'
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN ('azhar', 'azhari', 'أزهر', 'ازهر', 'أزهري', 'ازهري', 'تعليم أزهري', 'تعليم ازهري', 'الأزهر', 'الازهر') THEN 'أزهر'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.normalize_exam_target_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN ('scientific', 'science', 'sci', 'علمي', 'علمى', 'علم', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات') THEN 'scientific'
    WHEN lower(regexp_replace(trim(COALESCE(_value, '')), '\s+', ' ', 'g')) IN ('literary', 'ادبي', 'أدبي', 'أدبى', 'ادبى', 'الأدبي', 'الادبي') THEN 'literary'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(_student_id uuid, _target_section text, _target_education_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _student_id
      AND (
        public.normalize_exam_target_education_type(_target_education_type) IS NULL
        OR public.normalize_exam_target_education_type(p.education_type) = public.normalize_exam_target_education_type(_target_education_type)
      )
      AND (
        public.normalize_exam_target_section(_target_section) IS NULL
        OR public.normalize_exam_target_section(p.section) = public.normalize_exam_target_section(_target_section)
      )
  )
$$;

DROP POLICY IF EXISTS "Students view subscribed exams" ON public.exams;
CREATE POLICY "Students view subscribed exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND status = 'published'::exam_status
  AND group_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = exams.group_id
      AND sgp.student_id = auth.uid()
  )
  AND public.exam_target_matches_student(auth.uid(), target_section, target_education_type)
);

CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      AND e.group_id IS NOT NULL
      AND (
        (
          EXISTS (
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
$$;

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid := auth.uid();
  v_exam public.exams%ROWTYPE;
  v_existing_count integer;
  v_in_progress uuid;
  v_attempt_id uuid;
  v_max_score numeric;
BEGIN
  IF v_student IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تسجيل الدخول');
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR v_exam.is_published IS DISTINCT FROM true OR v_exam.status <> 'published'::exam_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير متاح');
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

  INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score)
  VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score)
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.start_exam_attempt(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';