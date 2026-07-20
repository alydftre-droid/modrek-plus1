REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM anon;
REVOKE ALL ON FUNCTION public.apply_subject_default_price() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subject_default_price() TO service_role;