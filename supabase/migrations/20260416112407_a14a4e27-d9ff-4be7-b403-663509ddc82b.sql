
-- Drop old permissive policy that allows all students to see all published exams
DROP POLICY IF EXISTS "Students can view published exams" ON public.exams;

-- Students can only view published exams in groups they purchased (or exams with no group)
CREATE POLICY "Students can view purchased group exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND (
    group_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.student_group_purchases
      WHERE student_group_purchases.group_id = exams.group_id
        AND student_group_purchases.student_id = auth.uid()
    )
  )
);

-- Restrict exam_attempts INSERT: student must have purchased the exam's group
DROP POLICY IF EXISTS "Students can insert own attempts" ON public.exam_attempts;

CREATE POLICY "Students can insert own attempts"
ON public.exam_attempts
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = exam_attempts.exam_id
      AND e.is_published = true
      AND (
        e.group_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.student_group_purchases sgp
          WHERE sgp.group_id = e.group_id
            AND sgp.student_id = auth.uid()
        )
      )
  )
);
