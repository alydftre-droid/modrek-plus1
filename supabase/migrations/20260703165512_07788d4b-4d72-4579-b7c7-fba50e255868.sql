DROP POLICY IF EXISTS "Teachers can view linked non-test student profiles" ON public.profiles;
CREATE POLICY "Teachers can view linked non-test student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'
  AND is_test_account = false
  AND (
    EXISTS (
      SELECT 1
      FROM public.student_teacher_choices stc
      WHERE stc.student_id = profiles.id
        AND stc.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      WHERE sgp.student_id = profiles.id
        AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.teacher_messages tm
      WHERE tm.student_id = profiles.id
        AND tm.teacher_id = auth.uid()
    )
  )
);

NOTIFY pgrst, 'reload schema';