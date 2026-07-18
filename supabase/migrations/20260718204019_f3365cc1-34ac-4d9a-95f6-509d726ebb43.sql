REVOKE EXECUTE ON FUNCTION public.trg_content_automation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_automation() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() TO service_role;