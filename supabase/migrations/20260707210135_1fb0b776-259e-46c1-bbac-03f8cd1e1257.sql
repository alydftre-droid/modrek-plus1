CREATE OR REPLACE FUNCTION public.register_device_push_token(
  p_token text,
  p_platform text DEFAULT 'android'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF COALESCE(trim(p_token), '') = '' THEN
    RAISE EXCEPTION 'Push token is required';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, token, platform, updated_at)
  VALUES (v_user_id, trim(p_token), COALESCE(NULLIF(trim(p_platform), ''), 'android'), now())
  ON CONFLICT (token) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_push_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_push_token(text, text) TO authenticated;