
-- Tighten profiles: don't let teachers read other teachers' full PII
DROP POLICY IF EXISTS "Teacher profiles readable to owner admin and teachers" ON public.profiles;
CREATE POLICY "Teacher profiles readable to owner and admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'teacher'
  AND NOT is_test_student(id)
  AND (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role))
);

-- Remove blanket "true" SELECT policies on teacher_profiles that bypassed the approval gate
DROP POLICY IF EXISTS "Allow All Authenticated Select Profile" ON public.teacher_profiles;
DROP POLICY IF EXISTS "Profile Select" ON public.teacher_profiles;
