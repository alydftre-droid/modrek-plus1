REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_group_content_target_debug(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_target_debug(uuid, uuid, uuid) TO authenticated, service_role;