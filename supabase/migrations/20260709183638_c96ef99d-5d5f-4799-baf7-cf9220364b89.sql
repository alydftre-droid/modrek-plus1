GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO service_role;