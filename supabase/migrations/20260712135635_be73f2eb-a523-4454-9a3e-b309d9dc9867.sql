REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_exam_attempt(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_exam_attempt(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_exam_questions_for_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_exam_questions_for_student(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions_for_student(uuid) TO authenticated;