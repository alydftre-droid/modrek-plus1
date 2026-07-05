REVOKE ALL ON FUNCTION public.sync_support_contact_setting_aliases() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_support_contact_setting_aliases() FROM anon;
REVOKE ALL ON FUNCTION public.sync_support_contact_setting_aliases() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_support_contact_setting_aliases() TO service_role;