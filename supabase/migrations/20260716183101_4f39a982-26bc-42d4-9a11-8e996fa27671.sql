GRANT EXECUTE ON FUNCTION public.library_stage_code_from_subject(text) TO anon;
GRANT EXECUTE ON FUNCTION public.library_grade_code_from_subject(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.library_track_code_from_subject(text) TO anon;
GRANT EXECUTE ON FUNCTION public.library_profile_grade_code(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.library_profile_track_code(text) TO anon;

NOTIFY pgrst, 'reload schema';