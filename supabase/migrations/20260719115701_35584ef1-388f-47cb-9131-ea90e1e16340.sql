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
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := 'https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/send-push-notification';
  v_publishable_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.invalid-placeholder';
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
    notification_id, user_id, source_table, notification_type, event_type,
    delivery_channel, status, title, body, link, details
  ) VALUES (
    p_notification_id, p_user_id, 'notifications', 'push', 'push_dispatch_enqueued',
    'push', 'queued', p_title, p_body, p_link,
    jsonb_build_object('request_id', v_request_id, 'source', 'db_trigger')
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.notification_delivery_logs (
    notification_id, user_id, source_table, notification_type, event_type,
    delivery_channel, status, title, body, link, error_message, details
  ) VALUES (
    p_notification_id, p_user_id, 'notifications', 'push', 'push_dispatch_failed',
    'push', 'failed', p_title, p_body, p_link, SQLERRM,
    jsonb_build_object('source', 'db_trigger')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_notification_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.dispatch_notification_push(p_user_id, p_title, p_body, p_link, NULL::uuid);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.dispatch_notification_push(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification_push(uuid, text, text, text) TO service_role;