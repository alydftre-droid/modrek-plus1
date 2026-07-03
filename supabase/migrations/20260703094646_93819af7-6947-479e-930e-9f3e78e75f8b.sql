REVOKE EXECUTE ON FUNCTION public.get_modrek_library_bootstrap() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_modrek_library_bootstrap() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';