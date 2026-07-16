GRANT EXECUTE ON FUNCTION public.library_stage_code_from_subject(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.library_grade_code_from_subject(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.library_track_code_from_subject(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.library_profile_grade_code(text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.library_profile_track_code(text) TO PUBLIC;

NOTIFY pgrst, 'reload schema';