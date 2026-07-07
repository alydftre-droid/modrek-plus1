REVOKE ALL ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dispatch_notification_push(uuid, text, text, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_push_on_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_push_on_notification() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_push_on_notification() FROM authenticated;