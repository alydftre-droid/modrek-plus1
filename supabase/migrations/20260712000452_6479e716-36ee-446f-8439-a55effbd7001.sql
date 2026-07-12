
-- Safer teacher directory: never expose email/phone to students.
CREATE OR REPLACE VIEW public.teacher_directory
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.teacher_code,
  p.stage,
  p.grade,
  p.section,
  p.education_type,
  p.role,
  p.is_banned,
  p.created_at
FROM public.profiles p
WHERE p.role = 'teacher' AND NOT public.is_test_student(p.id);

GRANT SELECT ON public.teacher_directory TO authenticated;

-- Tighten the broad "teacher rows readable to any authenticated user" policy
-- so students can no longer SELECT email/phone directly. Owner, admins, and
-- other teachers keep full access; students must use the view above.
DROP POLICY IF EXISTS "Teacher profiles are readable by authenticated users" ON public.profiles;

CREATE POLICY "Teacher profiles readable to owner admin and teachers"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'teacher'
  AND NOT public.is_test_student(id)
  AND (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  )
);
