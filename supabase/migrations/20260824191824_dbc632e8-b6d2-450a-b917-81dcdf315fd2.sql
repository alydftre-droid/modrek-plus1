DROP POLICY IF EXISTS "Students update own in-progress attempts" ON public.exam_attempts;

CREATE POLICY "Students update own in-progress attempts"
ON public.exam_attempts
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id AND status = 'in_progress'::exam_attempt_status)
WITH CHECK (
  auth.uid() = student_id
  AND status = ANY (ARRAY['in_progress'::exam_attempt_status, 'submitted'::exam_attempt_status])
);