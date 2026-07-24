REVOKE EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;