REVOKE ALL ON FUNCTION public.prevent_non_admin_free_preview_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_non_admin_free_preview_change() TO service_role;