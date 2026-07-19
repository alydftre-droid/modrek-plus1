ALTER TABLE public.notification_delivery_logs
ADD COLUMN IF NOT EXISTS error_message text;

DROP TRIGGER IF EXISTS trg_content_infer_sub_subject_before_write ON public.content;
CREATE TRIGGER trg_content_infer_sub_subject_before_write
BEFORE INSERT OR UPDATE OF group_id, sub_subject_id, sub_subject ON public.content
FOR EACH ROW
EXECUTE FUNCTION public.trg_content_infer_sub_subject_before_write();

DROP TRIGGER IF EXISTS trg_content_automation ON public.content;
CREATE TRIGGER trg_content_automation
AFTER INSERT OR UPDATE OF is_active ON public.content
FOR EACH ROW
EXECUTE FUNCTION public.trg_content_automation();

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_notification_push(
    NEW.user_id,
    COALESCE(NEW.title, 'إشعار جديد'),
    COALESCE(NEW.message, ''),
    NEW.link,
    NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.notification_delivery_logs (
    notification_id, user_id, source_table, source_id, notification_type,
    event_type, delivery_channel, status, title, body, link, error_message, details
  ) VALUES (
    NEW.id, NEW.user_id, 'notifications', NEW.id, NEW.notification_type,
    'push_trigger_failed', 'push', 'failed', NEW.title, NEW.message, NEW.link, SQLERRM,
    jsonb_build_object('source', 'notifications_push_trigger')
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notifications_push_trigger ON public.notifications;
CREATE TRIGGER notifications_push_trigger
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_push_on_notification();

REVOKE EXECUTE ON FUNCTION public.trg_content_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_automation() TO service_role;
REVOKE EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_content_infer_sub_subject_before_write() TO service_role;
REVOKE EXECUTE ON FUNCTION public.trigger_push_on_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_push_on_notification() TO service_role;