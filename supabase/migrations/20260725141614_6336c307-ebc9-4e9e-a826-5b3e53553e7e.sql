GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.debug_student_group_exam_visibility(uuid, uuid) FROM anon;
NOTIFY pgrst, 'reload schema';