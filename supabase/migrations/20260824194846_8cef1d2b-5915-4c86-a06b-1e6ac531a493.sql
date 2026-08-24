DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'cleanup_ai_daily_usage','cleanup_ai_rate_limit_events','cleanup_modrek_search_cache',
        'cleanup_modrek_search_logs','cleanup_notification_delivery_logs','cleanup_old_notifications',
        'cleanup_pg_net_http_logs','cleanup_processing_jobs','cleanup_student_activity_logs',
        'cleanup_voice_answers','email_queue_dispatch','email_queue_wake','enqueue_email','delete_email',
        'dispatch_automation','dispatch_notification_push','claim_library_job','apply_pending_commissions',
        'auto_archive_if_due','_admin_build_financial_snapshot','_notify_teacher_frozen_release',
        'ensure_shared_subject','ensure_teacher_visibility','apply_default_price_to_existing_groups',
        'apply_subject_default_price','apply_subject_shared_subject_id',
        'apply_teacher_archive_display_period','apply_teacher_wallet_transaction_display_period',
        'apply_teacher_request_assignments'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'internal functions locked down: %', n;
END $$;