-- Add thumbnail_url column to content for manual video thumbnails
ALTER TABLE public.content
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Update push trigger to also fire for broadcast notifications (user_id IS NULL)
-- by fanning out to all student/teacher users at trigger time.
-- We keep simple: when user_id is null, do nothing here; the application
-- layer will insert one row per recipient instead.

-- Add a helper RPC for admin broadcast that creates per-user notification rows
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

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent, scheduled_at, created_by)
  SELECT p.id, _title, _message, 'admin', _link, false, v_is_sent, _scheduled_at, v_caller
  FROM public.profiles p;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'recipients', v_count);
END;
$$;