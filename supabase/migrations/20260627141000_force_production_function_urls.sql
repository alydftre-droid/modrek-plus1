-- Force database-triggered Edge Function calls to the official production Supabase project.
-- This prevents old Lovable Cloud refs from being resurrected when migrations are replayed.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.dispatch_notification_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_body), '') = '' THEN
    RETURN;
  END IF;

  v_url := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/send-push-notification';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A',
      'Authorization', 'Bearer ' || 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A'
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'link', COALESCE(p_link, '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_notification_push failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_notification_push(
    NEW.user_id,
    COALESCE(NEW.title, 'إشعار جديد'),
    COALESCE(NEW.message, ''),
    NEW.link
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notification trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_trigger ON public.notifications;
CREATE TRIGGER notifications_push_trigger
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_push_on_notification();

CREATE OR REPLACE FUNCTION public.request_external_sync(sync_scope text DEFAULT 'tables')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_base_url text := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/external-sync';
  v_url text;
BEGIN
  v_url := v_base_url || CASE
    WHEN sync_scope IN ('auth','tables','rls') THEN '?only=' || sync_scope
    ELSE ''
  END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A',
      'Authorization', 'Bearer ' || 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A'
    ),
    body := jsonb_build_object(
      'source', 'db-trigger',
      'scope', sync_scope,
      'requested_at', now()
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'request_external_sync failed: %', SQLERRM;
END;
$$;
