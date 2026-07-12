REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_modrek_ai_exam(text, text, integer, numeric, numeric, public.exam_difficulty, uuid, jsonb) TO service_role;