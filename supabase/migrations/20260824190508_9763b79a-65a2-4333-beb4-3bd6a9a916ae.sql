-- The rate-limit table already existed with a required phone_hash column;
-- populate it (hashed, never the raw phone) so inserts succeed.
CREATE OR REPLACE FUNCTION public.resolve_login_email_rate_limited(
  _phone text,
  _ip_hash text,
  _max_per_hour integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recent integer;
  v_digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  v_email text;
BEGIN
  IF length(v_digits) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  END IF;

  DELETE FROM public.login_lookup_attempts WHERE created_at < now() - interval '2 hours';

  SELECT count(*) INTO v_recent
  FROM public.login_lookup_attempts
  WHERE ip_hash = coalesce(_ip_hash, 'unknown')
    AND created_at > now() - interval '1 hour';

  IF v_recent >= greatest(_max_per_hour, 1) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.login_lookup_attempts (ip_hash, phone_hash)
  VALUES (coalesce(_ip_hash, 'unknown'), encode(digest(v_digits, 'sha256'), 'hex'));

  SELECT p.email INTO v_email
  FROM public.profiles p
  WHERE regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'email', lower(trim(v_email)));
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_email_rate_limited(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_email_rate_limited(text, text, integer) TO service_role;