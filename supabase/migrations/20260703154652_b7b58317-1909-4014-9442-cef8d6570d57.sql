CREATE OR REPLACE FUNCTION public.get_developer_test_students()
RETURNS TABLE (
  id uuid,
  test_account_code text,
  full_name text,
  stage text,
  grade text,
  section text,
  education_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.test_account_code,
    p.full_name,
    p.stage,
    p.grade,
    p.section,
    p.education_type
  FROM public.profiles p
  WHERE p.is_test_account = true
    AND (
      (SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid()) = 'alyedaft@gmail.com'
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY p.test_account_code ASC;
$$;

REVOKE ALL ON FUNCTION public.get_developer_test_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_developer_test_students() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';