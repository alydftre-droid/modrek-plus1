ALTER FUNCTION public.library_profile_grade_code(text, text) SECURITY INVOKER;
ALTER FUNCTION public.library_profile_track_code(text) SECURITY INVOKER;

NOTIFY pgrst, 'reload schema';