REVOKE EXECUTE ON FUNCTION public.is_modrek_training_exam_accessible(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_modrek_training_exam_accessible(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_modrek_training_attempt(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_modrek_training_attempt(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_modrek_training_questions_for_attempt(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_modrek_training_questions_for_attempt(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.is_modrek_training_exam_accessible(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_modrek_training_exam_accessible(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_modrek_training_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_modrek_training_attempt(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_modrek_training_questions_for_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_modrek_training_questions_for_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_modrek_training_attempt(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';