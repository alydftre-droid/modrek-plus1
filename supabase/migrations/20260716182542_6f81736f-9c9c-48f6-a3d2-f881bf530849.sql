GRANT EXECUTE ON FUNCTION public.library_stage_code_from_subject(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_stage_code_from_subject(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_grade_code_from_subject(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_grade_code_from_subject(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_track_code_from_subject(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_track_code_from_subject(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_profile_grade_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_profile_grade_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_profile_track_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.library_profile_track_code(text) TO service_role;

NOTIFY pgrst, 'reload schema';