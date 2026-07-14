REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM anon;
REVOKE ALL ON FUNCTION public.sync_library_taxonomy_from_subjects() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_library_taxonomy_from_subjects() TO service_role;

REVOKE ALL ON FUNCTION public.trigger_sync_library_taxonomy_from_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_sync_library_taxonomy_from_subjects() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_sync_library_taxonomy_from_subjects() FROM authenticated;

NOTIFY pgrst, 'reload schema';