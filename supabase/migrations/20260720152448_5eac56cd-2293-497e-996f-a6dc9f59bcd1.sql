REVOKE ALL ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.normalize_exam_grading_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_exam_grading_text(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.smart_exam_text_score(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO authenticated, service_role;