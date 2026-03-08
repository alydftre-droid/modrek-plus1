
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'general';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < NOW() - INTERVAL '60 days';
END;
$$;
