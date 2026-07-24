REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_student_group_content_target_debug(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_target_debug(uuid, uuid, uuid) TO authenticated, service_role;