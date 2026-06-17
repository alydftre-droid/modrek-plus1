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
);

CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
        EXISTS (
          SELECT 1 FROM public.student_group_purchases sgp
          WHERE sgp.group_id = e.group_id AND sgp.student_id = v_uid
        )
        OR e.teacher_id = v_uid
        OR public.has_role(v_uid, 'admin'::app_role)
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(qr) ORDER BY (qr->>'order_index')::int), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      q.id,
      q.exam_id,
      q.order_index,
      q.question_type,
      q.question_text,
      q.image_url,
      q.marks,
      q.difficulty,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', o.id,
          'question_id', o.question_id,
          'order_index', o.order_index,
          'option_text', o.option_text,
          'image_url', o.image_url
        ) ORDER BY o.order_index)
        FROM public.exam_question_options o
        WHERE o.question_id = q.id
      ), '[]'::jsonb) AS options
    FROM public.exam_questions q
    WHERE q.exam_id = _exam_id
  ) qr;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO authenticated;