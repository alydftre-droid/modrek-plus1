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
  v_anon text;
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_title), '') = '' OR COALESCE(trim(p_body), '') = '' THEN
    RETURN;
  END IF;

  v_url := 'https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/send-push-notification';
  v_anon := current_setting('request.jwt.claim.sub', true);

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A',
      'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A'
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