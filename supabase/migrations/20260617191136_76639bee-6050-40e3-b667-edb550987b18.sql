DROP POLICY IF EXISTS "Students view accessible published exams" ON public.exams;
DROP POLICY IF EXISTS "Students view subscribed exams" ON public.exams;
CREATE POLICY "Students view subscribed exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND status = 'published'
  AND (
    group_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.group_id = exams.group_id
        AND sgp.student_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Students view questions of accessible exams" ON public.exam_questions;
CREATE POLICY "Students view questions of accessible exams"
ON public.exam_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exams e
    WHERE e.id = exam_questions.exam_id
      AND e.is_published = true
      AND e.status = 'published'
      AND (
        e.group_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.student_group_purchases sgp
          WHERE sgp.group_id = e.group_id
            AND sgp.student_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "Students view options of accessible questions" ON public.exam_question_options;
CREATE POLICY "Students view options of accessible questions"
ON public.exam_question_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id
    WHERE q.id = exam_question_options.question_id
      AND e.is_published = true
      AND e.status = 'published'
      AND (
        e.group_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.student_group_purchases sgp
          WHERE sgp.group_id = e.group_id
            AND sgp.student_id = auth.uid()
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.start_exam_attempt(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير موجود');
  END IF;

  IF NOT v_exam.is_published OR v_exam.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان غير منشور');
  END IF;

  IF v_exam.start_at IS NOT NULL AND now() < v_exam.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'الامتحان لم يبدأ بعد');
  END IF;

  IF v_exam.end_at IS NOT NULL AND now() > v_exam.end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'انتهى وقت الامتحان');
  END IF;

  IF v_exam.group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.student_group_purchases
      WHERE group_id = v_exam.group_id
        AND student_id = v_student
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'يجب الاشتراك في المجموعة أولاً');
    END IF;
  END IF;

  SELECT id INTO v_in_progress
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status = 'in_progress'
  LIMIT 1;

  IF v_in_progress IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'attempt_id', v_in_progress, 'resumed', true);
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.exam_attempts
  WHERE exam_id = _exam_id AND student_id = v_student AND status IN ('submitted','graded');

  IF v_existing_count >= v_exam.max_attempts THEN
    RETURN jsonb_build_object('success', false, 'error', 'استنفدت عدد المحاولات المسموح بها');
  END IF;

  SELECT COALESCE(SUM(marks), 0) INTO v_max_score
  FROM public.exam_questions WHERE exam_id = _exam_id;

  INSERT INTO public.exam_attempts (exam_id, student_id, attempt_number, max_score)
  VALUES (_exam_id, v_student, v_existing_count + 1, v_max_score)
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'resumed', false);
END;
$$;