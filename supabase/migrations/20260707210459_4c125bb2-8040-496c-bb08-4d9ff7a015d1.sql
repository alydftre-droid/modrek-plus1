CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS public.dispatch_notification_push(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.dispatch_notification_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL::text,
  p_notification_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
DECLARE
  v_url text := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/send-push-notification';
  v_publishable_key text := 'sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A';
  v_request_id bigint;
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_body), '') = '' THEN
    RETURN;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_publishable_key,
      'Authorization', 'Bearer ' || v_publishable_key
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', p_title,
      'body', p_body,
      'link', COALESCE(p_link, ''),
      'notification_id', p_notification_id
    ),
    timeout_milliseconds := 5000
  ) INTO v_request_id;

  INSERT INTO public.notification_delivery_logs (
    notification_id,
    user_id,
    source_table,
    notification_type,
    event_type,
    delivery_channel,
    status,
    title,
    body,
    link,
    details
  ) VALUES (
    p_notification_id,
    p_user_id,
    'notifications',
    'push',
    'push_dispatch_enqueued',
    'push',
    'queued',
    p_title,
    p_body,
    COALESCE(p_link, ''),
    jsonb_build_object('request_id', v_request_id, 'function_url', 'send-push-notification', 'target', 'production')
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.notification_delivery_logs (
    notification_id,
    user_id,
    source_table,
    notification_type,
    event_type,
    delivery_channel,
    status,
    title,
    body,
    link,
    details
  ) VALUES (
    p_notification_id,
    p_user_id,
    'notifications',
    'push',
    'push_dispatch_failed',
    'push',
    'failed',
    p_title,
    p_body,
    COALESCE(p_link, ''),
    jsonb_build_object('error', SQLERRM, 'target', 'production')
  );
  RAISE WARNING 'dispatch_notification_push failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target uuid;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.dispatch_notification_push(
      NEW.user_id,
      COALESCE(NEW.title, 'إشعار جديد'),
      COALESCE(NEW.message, ''),
      NEW.link,
      NEW.id
    );
  ELSE
    FOR v_target IN
      SELECT DISTINCT user_id FROM public.device_push_tokens
    LOOP
      PERFORM public.dispatch_notification_push(
        v_target,
        COALESCE(NEW.title, 'إشعار جديد'),
        COALESCE(NEW.message, ''),
        NEW.link,
        NEW.id
      );
    END LOOP;
  END IF;

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