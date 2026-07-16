REVOKE EXECUTE ON FUNCTION public.has_library_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_voice_usage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.voice_answers_find_similar(text, uuid, text, real) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.library_ensure_track_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_unified_shared_price() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.library_infer_book_track_before_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.modrek_ai_touch_conversation() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_library_access(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_voice_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voice_answers_find_similar(text, uuid, text, real) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.library_ensure_track_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_unified_shared_price() TO service_role;
GRANT EXECUTE ON FUNCTION public.library_infer_book_track_before_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.modrek_ai_touch_conversation() TO service_role;