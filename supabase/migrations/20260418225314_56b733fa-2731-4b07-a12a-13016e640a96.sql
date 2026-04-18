
-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function: invoke push notification edge function when a new notification is created
CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  -- Only push if there is a target user
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_url := 'https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/send-push-notification';
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaGhybGlhZWNkdGFleWZoY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MTU1NDYsImV4cCI6MjA4MTI5MTU0Nn0.0j-tjPRX-s2wMCYfJypWo2dlYk9Mi40ueU8z0f00y8A';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'link', COALESCE(NEW.link, '')
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block notification insert if push fails
  RAISE WARNING 'Push notification trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_trigger ON public.notifications;
CREATE TRIGGER notifications_push_trigger
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_push_on_notification();
