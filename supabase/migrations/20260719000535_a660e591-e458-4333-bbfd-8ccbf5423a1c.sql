DROP POLICY IF EXISTS "Students view own answers" ON public.exam_answers;
CREATE POLICY "Students view own answers"
ON public.exam_answers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    WHERE a.id = exam_answers.attempt_id
      AND a.student_id = auth.uid()
      AND a.submitted_at IS NOT NULL
  )
);