REVOKE ALL ON FUNCTION public.admin_switch_system_terms(uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_switch_system_terms(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_switch_system_terms(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_switch_system_terms(uuid[], text) TO service_role;