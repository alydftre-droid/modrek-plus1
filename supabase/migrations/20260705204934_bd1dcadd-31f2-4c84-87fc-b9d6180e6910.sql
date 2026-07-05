DROP POLICY IF EXISTS "Teacher profiles are publicly readable" ON public.profiles;
CREATE POLICY "Teacher profiles are publicly readable"
ON public.profiles
FOR SELECT
USING (role = 'teacher' AND NOT public.is_test_student(id));

NOTIFY pgrst, 'reload schema';