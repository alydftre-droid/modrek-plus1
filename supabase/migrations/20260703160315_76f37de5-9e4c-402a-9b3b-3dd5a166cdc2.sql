REVOKE ALL ON FUNCTION public.is_test_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_test_student(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_test_student(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';