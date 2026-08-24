-- A. Trigger / maintenance functions must not be callable over the API at all
REVOKE ALL ON FUNCTION public._notify_teacher_frozen_release() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_single_active_ai_gateway() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_and_normalize_content_targets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_and_normalize_exam_targets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_financial_closing_functions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_teacher_archive_display_period() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_teacher_wallet_transaction_display_period() FROM PUBLIC, anon, authenticated;

-- B. Admin-only RPCs: keep them reachable for signed-in admins (they check
--    has_role(admin) internally) but never for anonymous callers.
REVOKE ALL ON FUNCTION public.admin_financial_close_preview() FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_financial_close(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_monthly_history_summary() FROM anon;
REVOKE ALL ON FUNCTION public.admin_monthly_period_teachers(text) FROM anon;
REVOKE ALL ON FUNCTION public.modrek_admin_repair_source(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.modrek_library_diagnostics() FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_financial_close_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_financial_close(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monthly_history_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monthly_period_teachers(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_admin_repair_source(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_library_diagnostics() TO authenticated;

-- C. Fix mutable search_path on the email-queue helpers
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, extensions;