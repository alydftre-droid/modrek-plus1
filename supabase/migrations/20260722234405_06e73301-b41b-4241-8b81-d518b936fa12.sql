GRANT EXECUTE ON FUNCTION public.normalize_exam_grading_text(text) TO public;
GRANT EXECUTE ON FUNCTION public.normalize_exam_semantic_token(text) TO public;
GRANT EXECUTE ON FUNCTION public.is_exam_non_answer(text) TO public;
GRANT EXECUTE ON FUNCTION public.exam_meaningful_tokens(text) TO public;
GRANT EXECUTE ON FUNCTION public.smart_exam_text_score(text, text, numeric) TO public;
GRANT EXECUTE ON FUNCTION public.exam_text_feedback(text, text, numeric, numeric) TO public;
GRANT EXECUTE ON FUNCTION public.exam_text_feedback(text, text, numeric, numeric, text) TO public;