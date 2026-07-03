REVOKE ALL ON FUNCTION public.get_developer_test_students() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_test_students() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_developer_test_students() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';