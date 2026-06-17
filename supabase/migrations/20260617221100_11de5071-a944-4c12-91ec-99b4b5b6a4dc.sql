REVOKE INSERT, UPDATE, DELETE ON public.exam_answers FROM authenticated;
GRANT SELECT ON public.exam_answers TO authenticated;
GRANT ALL ON public.exam_answers TO service_role;

DROP POLICY IF EXISTS "Students manage own answers" ON public.exam_answers;
DROP POLICY IF EXISTS "Students view own answers" ON public.exam_answers;
CREATE POLICY "Students view own answers"
ON public.exam_answers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts a
    WHERE a.id = exam_answers.attempt_id
      AND a.student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers grade answers on their exams" ON public.exam_answers;
CREATE POLICY "Teachers grade answers on their exams"
ON public.exam_answers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = exam_answers.attempt_id
      AND e.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins manage all answers" ON public.exam_answers;
CREATE POLICY "Admins manage all answers"
ON public.exam_answers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));