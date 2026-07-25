REVOKE ALL ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';