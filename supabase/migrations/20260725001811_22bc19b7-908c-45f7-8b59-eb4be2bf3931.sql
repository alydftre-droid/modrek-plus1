REVOKE ALL ON FUNCTION public.get_student_group_content_diagnostics(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_diagnostics(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.content_effective_section(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_effective_section(text, uuid, uuid) TO authenticated, service_role;
