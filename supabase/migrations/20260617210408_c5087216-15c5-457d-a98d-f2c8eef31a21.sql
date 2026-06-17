
-- 1) content: restrict paid content access to admins/teachers/owner/purchaser/subscriber
DROP POLICY IF EXISTS "Content is viewable by authenticated" ON public.content;

CREATE POLICY "Content viewable by authorized users"
ON public.content FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR auth.uid() = uploaded_by
  OR COALESCE(is_paid, false) = false
  OR (group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        WHERE sgp.student_id = auth.uid() AND sgp.group_id = content.group_id))
  OR (subject_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.student_id = auth.uid()
          AND s.subject_id = content.subject_id
          AND s.is_active = true
          AND s.end_date > now()))
);

-- 2) exam_question_options: students can only read after submitting an attempt
DROP POLICY IF EXISTS "Students view options of accessible questions" ON public.exam_question_options;

CREATE POLICY "Students view options after submitting attempt"
ON public.exam_question_options FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_questions q
    JOIN public.exam_attempts a ON a.exam_id = q.exam_id
    WHERE q.id = exam_question_options.question_id
      AND a.student_id = auth.uid()
      AND a.submitted_at IS NOT NULL
  )
);

-- exam_questions: same restriction so correct_answer/explanation are hidden during the attempt
DROP POLICY IF EXISTS "Students view questions of accessible exams" ON public.exam_questions;

CREATE POLICY "Students view questions after submitting attempt"
ON public.exam_questions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts a
    WHERE a.exam_id = exam_questions.exam_id
      AND a.student_id = auth.uid()
      AND a.submitted_at IS NOT NULL
  )
);

-- 3) Sanitized RPC for students to fetch questions during the exam (no is_correct, no correct_answer, no explanation)
CREATE OR REPLACE FUNCTION public.get_exam_questions_for_student(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
      AND (
        e.group_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.student_group_purchases sgp
          WHERE sgp.group_id = e.group_id AND sgp.student_id = v_uid
        )
        OR e.teacher_id = v_uid
        OR has_role(v_uid, 'admin'::app_role)
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

-- 4) Lock down anon EXECUTE on existing SECURITY DEFINER functions that should only run for authenticated users
REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_student_exam_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid[], text, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_exam_attempt(uuid) FROM anon;
