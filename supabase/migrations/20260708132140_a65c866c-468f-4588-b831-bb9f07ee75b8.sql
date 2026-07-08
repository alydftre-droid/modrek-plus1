DROP FUNCTION IF EXISTS public.register_device_push_token(text, text);

CREATE OR REPLACE FUNCTION public.register_device_push_token(
  p_token text,
  p_platform text DEFAULT 'android',
  p_diagnostics jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_clean_token text := trim(COALESCE(p_token, ''));
  v_clean_platform text := COALESCE(NULLIF(trim(p_platform), ''), 'android');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_clean_token = '' THEN
    RAISE EXCEPTION 'Push token is required';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, token, platform, updated_at)
  VALUES (v_user_id, v_clean_token, v_clean_platform, now())
  ON CONFLICT (token) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      updated_at = now();

  INSERT INTO public.notification_delivery_logs (
    user_id,
    source_table,
    notification_type,
    event_type,
    delivery_channel,
    status,
    title,
    body,
    details
  ) VALUES (
    v_user_id,
    'device_push_tokens',
    'device_registration',
    'device_token_registered',
    'push',
    'ready',
    'FCM token registered',
    'Android device push token was saved by the native app',
    jsonb_build_object(
      'platform', v_clean_platform,
      'token_length', length(v_clean_token),
      'token_prefix', left(v_clean_token, 12),
      'diagnostics', COALESCE(p_diagnostics, '{}'::jsonb)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_push_token(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_device_push_token(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.register_device_push_token(text, text, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.register_device_push_token(text, text, jsonb) TO authenticated;