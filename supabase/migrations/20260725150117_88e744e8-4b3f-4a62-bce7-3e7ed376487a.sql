-- Force PostgREST to reload its schema cache so the diagnostic RPC is discoverable
NOTIFY pgrst, 'reload schema';
-- Re-affirm execute privileges just in case
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.diagnose_student_group_exam_visibility(uuid, uuid) TO service_role;
NOTIFY pgrst, 'reload schema';