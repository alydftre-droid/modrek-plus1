CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NULL,
  source_table text NULL,
  source_id uuid NULL,
  notification_type text NULL,
  event_type text NOT NULL,
  delivery_channel text NOT NULL DEFAULT 'push',
  status text NOT NULL DEFAULT 'pending',
  token text NULL,
  title text NULL,
  body text NULL,
  link text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_user_created
  ON public.notification_delivery_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_notification
  ON public.notification_delivery_logs (notification_id, created_at DESC);

ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "Users view own delivery logs"
ON public.notification_delivery_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "Admins view all delivery logs"
ON public.notification_delivery_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages delivery logs" ON public.notification_delivery_logs;
CREATE POLICY "Service role manages delivery logs"
ON public.notification_delivery_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_teacher_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_teacher_name text;
  v_notification_id uuid;
  v_message text;
BEGIN
  IF NEW.is_from_teacher IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_teacher_name
  FROM public.profiles
  WHERE id = NEW.teacher_id;

  v_message := COALESCE(NULLIF(trim(NEW.message), ''), 'لديك رسالة جديدة من المعلم');

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    notification_type,
    link,
    is_read,
    is_sent,
    created_by
  )
  VALUES (
    NEW.student_id,
    'رسالة جديدة من المعلم',
    CASE
      WHEN char_length(v_message) > 160 THEN left(v_message, 157) || '...'
      ELSE v_message
    END,
    'teacher_message',
    '/support',
    false,
    true,
    NEW.teacher_id
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_delivery_logs (
    notification_id,
    user_id,
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
    v_notification_id,
    NEW.student_id,
    'teacher_messages',
    NEW.id,
    'teacher_message',
    'notification_created',
    'database',
    'queued',
    'رسالة جديدة من المعلم',
    CASE
      WHEN char_length(v_message) > 160 THEN left(v_message, 157) || '...'
      ELSE v_message
    END,
    '/support',
    jsonb_build_object(
      'teacher_id', NEW.teacher_id,
      'teacher_name', COALESCE(v_teacher_name, 'المعلم'),
      'student_id', NEW.student_id,
      'is_from_teacher', NEW.is_from_teacher
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_support_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_notification_id uuid;
  v_type text;
  v_link text;
  v_body text;
BEGIN
  IF NEW.is_from_admin IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_type := CASE WHEN COALESCE(NEW.is_teacher_request, false) THEN 'teacher_support_reply' ELSE 'support' END;
  v_link := CASE WHEN COALESCE(NEW.is_teacher_request, false) THEN '/teacher/assistant' ELSE '/support' END;
  v_body := COALESCE(NULLIF(trim(NEW.message), ''), 'لديك رد جديد من الدعم');

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    notification_type,
    link,
    is_read,
    is_sent
  )
  VALUES (
    NEW.user_id,
    'رد جديد من الدعم',
    CASE
      WHEN char_length(v_body) > 160 THEN left(v_body, 157) || '...'
      ELSE v_body
    END,
    v_type,
    v_link,
    false,
    true
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_delivery_logs (
    notification_id,
    user_id,
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
    v_notification_id,
    NEW.user_id,
    'support_messages',
    NEW.id,
    v_type,
    'notification_created',
    'database',
    'queued',
    'رد جديد من الدعم',
    CASE
      WHEN char_length(v_body) > 160 THEN left(v_body, 157) || '...'
      ELSE v_body
    END,
    v_link,
    jsonb_build_object(
      'is_teacher_request', COALESCE(NEW.is_teacher_request, false),
      'is_from_admin', NEW.is_from_admin
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_messages_notification_trigger ON public.teacher_messages;
CREATE TRIGGER teacher_messages_notification_trigger
AFTER INSERT ON public.teacher_messages
FOR EACH ROW
EXECUTE FUNCTION public.create_teacher_message_notification();

DROP TRIGGER IF EXISTS support_messages_notification_trigger ON public.support_messages;
CREATE TRIGGER support_messages_notification_trigger
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.create_support_reply_notification();