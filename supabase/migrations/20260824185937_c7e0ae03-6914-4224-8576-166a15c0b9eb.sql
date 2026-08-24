-- AI cost protection: per-user, per-feature daily and burst quotas
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  feature text PRIMARY KEY,
  daily_limit integer NOT NULL DEFAULT 100,
  per_minute_limit integer NOT NULL DEFAULT 12,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_rate_limits TO authenticated;
GRANT ALL ON public.ai_rate_limits TO service_role;
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_rate_limits_admin_all" ON public.ai_rate_limits;
CREATE POLICY "ai_rate_limits_admin_all" ON public.ai_rate_limits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "ai_rate_limits_read" ON public.ai_rate_limits;
CREATE POLICY "ai_rate_limits_read" ON public.ai_rate_limits
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.ai_rate_limits (feature, daily_limit, per_minute_limit) VALUES
  ('ai-chat', 120, 12),
  ('modrek-ai-study', 120, 12),
  ('modrek-ai-exams', 25, 4),
  ('library-explain', 150, 15),
  ('library-chat', 120, 12),
  ('library-quiz', 40, 6),
  ('voice-answer', 60, 6),
  ('teacher-assistant', 200, 20),
  ('support-assistant', 60, 10)
ON CONFLICT (feature) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_usage_counters (
  user_id uuid NOT NULL,
  feature text NOT NULL,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  minute_bucket timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  day_count integer NOT NULL DEFAULT 0,
  minute_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, usage_date)
);
GRANT SELECT ON public.ai_usage_counters TO authenticated;
GRANT ALL ON public.ai_usage_counters TO service_role;
ALTER TABLE public.ai_usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_usage_counters_own_select" ON public.ai_usage_counters;
CREATE POLICY "ai_usage_counters_own_select" ON public.ai_usage_counters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Atomic quota consumption. Returns allowed/limits so callers can surface a
-- clear Arabic message. Admins are never throttled.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  _user_id uuid,
  _feature text,
  _cost integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit public.ai_rate_limits;
  v_row public.ai_usage_counters;
  v_bucket timestamptz := date_trunc('minute', now());
  v_today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  IF public.has_role(_user_id, 'admin') THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_bypass');
  END IF;

  SELECT * INTO v_limit FROM public.ai_rate_limits WHERE feature = _feature;
  IF NOT FOUND THEN
    INSERT INTO public.ai_rate_limits (feature) VALUES (_feature)
    ON CONFLICT (feature) DO NOTHING;
    SELECT * INTO v_limit FROM public.ai_rate_limits WHERE feature = _feature;
  END IF;

  IF v_limit.enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'disabled');
  END IF;

  INSERT INTO public.ai_usage_counters (user_id, feature, usage_date, minute_bucket, day_count, minute_count)
  VALUES (_user_id, _feature, v_today, v_bucket, GREATEST(_cost, 1), GREATEST(_cost, 1))
  ON CONFLICT (user_id, feature, usage_date) DO UPDATE
    SET day_count = public.ai_usage_counters.day_count + GREATEST(_cost, 1),
        minute_count = CASE
          WHEN public.ai_usage_counters.minute_bucket = v_bucket
            THEN public.ai_usage_counters.minute_count + GREATEST(_cost, 1)
          ELSE GREATEST(_cost, 1)
        END,
        minute_bucket = v_bucket,
        updated_at = now()
  RETURNING * INTO v_row;

  IF v_row.day_count > v_limit.daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'daily_limit',
      'used', v_row.day_count, 'limit', v_limit.daily_limit
    );
  END IF;

  IF v_row.minute_count > v_limit.per_minute_limit THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'burst_limit',
      'used', v_row.minute_count, 'limit', v_limit.per_minute_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'used', v_row.day_count, 'limit', v_limit.daily_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer) TO service_role;

-- Rate-limited login-email resolution (phone -> email) for the edge proxy only.
CREATE TABLE IF NOT EXISTS public.login_lookup_attempts (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_lookup_attempts_ip_time_idx
  ON public.login_lookup_attempts (ip_hash, created_at DESC);
GRANT ALL ON public.login_lookup_attempts TO service_role;
ALTER TABLE public.login_lookup_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.resolve_login_email_rate_limited(
  _phone text,
  _ip_hash text,
  _max_per_hour integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  INSERT INTO public.login_lookup_attempts (ip_hash) VALUES (coalesce(_ip_hash, 'unknown'));

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