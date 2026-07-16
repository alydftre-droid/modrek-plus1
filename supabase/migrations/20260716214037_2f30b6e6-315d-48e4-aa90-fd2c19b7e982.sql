REVOKE ALL ON FUNCTION public.content_guard_free_preview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_guard_free_preview() FROM anon;
REVOKE ALL ON FUNCTION public.content_guard_free_preview() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.content_guard_free_preview() TO service_role;