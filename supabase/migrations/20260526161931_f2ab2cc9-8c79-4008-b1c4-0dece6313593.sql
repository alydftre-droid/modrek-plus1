
-- Block direct client inserts on student_group_purchases (RPCs are SECURITY DEFINER and bypass RLS; admins keep ALL policy)
DROP POLICY IF EXISTS "Students can insert own purchases" ON public.student_group_purchases;

-- Revoke public/anon execute on sensitive SECURITY DEFINER functions; keep authenticated where needed.
-- Trigger-only / internal functions: revoke from both anon and authenticated.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    -- Internal / trigger / dispatch helpers — block all API roles
    IF r.proname IN (
      'handle_new_user','handle_new_wallet','auto_assign_teacher_code',
      'create_assignments_on_teacher_approval','notify_admins_new_teacher_request',
      'sync_teacher_education_type','fill_assignment_education_type',
      'create_teacher_message_notification','create_support_reply_notification',
      'credit_teacher_on_purchase','bundle_subscription_after_insert',
      'expand_legacy_broadcast_notification','trigger_push_on_notification',
      'dispatch_notification_push','prevent_deposit_request_tampering',
      'cleanup_old_notifications','apply_pending_commissions','auto_archive_if_due',
      'apply_subject_default_price','apply_default_price_to_existing_groups'
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
    ELSE
      -- Authenticated-only callable: revoke anon
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    END IF;
  END LOOP;
END $$;
