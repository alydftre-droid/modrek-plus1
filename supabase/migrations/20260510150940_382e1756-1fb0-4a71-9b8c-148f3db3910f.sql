CREATE OR REPLACE FUNCTION public.broadcast_notification(
  _title text,
  _message text,
  _link text DEFAULT NULL,
  _scheduled_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count int := 0;
  v_is_sent boolean := _scheduled_at IS NULL;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    notification_type,
    link,
    is_read,
    is_sent,
    scheduled_at,
    created_by
  )
  SELECT
    p.id,
    _title,
    _message,
    'admin',
    _link,
    false,
    v_is_sent,
    _scheduled_at,
    v_caller
  FROM public.profiles p;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.notification_delivery_logs (
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
  )
  VALUES (
    v_caller,
    'notifications',
    'admin',
    'broadcast_fanned_out',
    'database',
    'queued',
    _title,
    _message,
    _link,
    jsonb_build_object('recipients', v_count, 'scheduled_at', _scheduled_at)
  );

  RETURN jsonb_build_object('success', true, 'recipients', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.expand_legacy_broadcast_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    notification_type,
    link,
    is_read,
    is_sent,
    scheduled_at,
    created_by
  )
  SELECT
    p.id,
    NEW.title,
    NEW.message,
    COALESCE(NEW.notification_type, 'admin'),
    NEW.link,
    false,
    NEW.is_sent,
    NEW.scheduled_at,
    NEW.created_by
  FROM public.profiles p;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.notification_delivery_logs (
    notification_id,
    source_table,
    source_id,
    notification_type,
    event_type,
    delivery_channel,
    status,
    title,
    body,
    link,
    details
  )
  VALUES (
    NEW.id,
    'notifications',
    NEW.id,
    COALESCE(NEW.notification_type, 'admin'),
    'legacy_broadcast_expanded',
    'database',
    'queued',
    NEW.title,
    NEW.message,
    NEW.link,
    jsonb_build_object('recipients', v_count)
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notifications_expand_legacy_broadcast_trigger ON public.notifications;
CREATE TRIGGER notifications_expand_legacy_broadcast_trigger
BEFORE INSERT ON public.notifications
FOR EACH ROW
WHEN (NEW.user_id IS NULL)
EXECUTE FUNCTION public.expand_legacy_broadcast_notification();