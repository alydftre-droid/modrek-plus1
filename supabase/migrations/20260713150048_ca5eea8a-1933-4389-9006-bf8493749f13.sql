REVOKE EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_modrek_ai_training_exam_for_student(text, uuid, uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';