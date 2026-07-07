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
      NEW.link
    );
  ELSE
    FOR v_target IN
      SELECT DISTINCT user_id FROM public.device_push_tokens
    LOOP
      PERFORM public.dispatch_notification_push(
        v_target,
        COALESCE(NEW.title, 'إشعار جديد'),
        COALESCE(NEW.message, ''),
        NEW.link
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