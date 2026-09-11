-- Student-only AI quota engine (explanation + exams assistants share one counter).
-- Free students: 10 uses/day (reset at midnight Africa/Cairo).
-- Students with a currently valid paid subscription: unlimited for 30 days from activation.
-- Teachers, admins, support and the support assistant are never metered here.

INSERT INTO public.ai_rate_limits (feature, daily_limit, per_minute_limit, enabled)
VALUES ('student_ai_shared', 10, 12, true)
ON CONFLICT (feature) DO NOTHING;

-- Premium window: 30 days from the activation timestamp stored in the DB,
-- never later than the subscription's own end date.
CREATE OR REPLACE FUNCTION public.student_ai_premium_until(_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(
    LEAST(
      s.start_date + interval '30 days',
      COALESCE(s.end_date, s.start_date + interval '30 days')
    )
  )
  FROM public.subscriptions s
  WHERE s.student_id = _user_id
    AND s.is_active = true
    AND s.start_date <= now()
    AND (s.end_date IS NULL OR s.end_date > now());
$$;

-- Read-only snapshot for the UI (no consumption).
CREATE OR REPLACE FUNCTION public.get_student_ai_quota(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(_user_id, auth.uid());
  v_today date;
  v_reset timestamptz;
  v_limit integer;
  v_used integer := 0;
  v_premium timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('plan', 'unknown', 'exempt', false);
  END IF;
  -- Callers may only read their own quota unless they are an admin.
  IF v_uid <> COALESCE(auth.uid(), v_uid) AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_today := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_reset := ((v_today + 1)::timestamp) AT TIME ZONE 'Africa/Cairo';

  IF public.has_role(v_uid, 'admin'::public.app_role)
     OR public.has_role(v_uid, 'teacher'::public.app_role)
     OR public.has_role(v_uid, 'support'::public.app_role) THEN
    RETURN jsonb_build_object('plan', 'exempt', 'exempt', true, 'reset_at', v_reset);
  END IF;

  v_premium := public.student_ai_premium_until(v_uid);

  SELECT COALESCE(daily_limit, 10) INTO v_limit
  FROM public.ai_rate_limits WHERE feature = 'student_ai_shared';
  v_limit := COALESCE(v_limit, 10);

  SELECT COALESCE(day_count, 0) INTO v_used
  FROM public.ai_usage_counters
  WHERE user_id = v_uid AND feature = 'student_ai_shared' AND usage_date = v_today;
  v_used := COALESCE(v_used, 0);

  IF v_premium IS NOT NULL AND v_premium > now() THEN
    RETURN jsonb_build_object(
      'plan', 'premium', 'exempt', false, 'unlimited', true,
      'premium_until', v_premium, 'reset_at', v_reset, 'server_now', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'plan', 'free', 'exempt', false, 'unlimited', false,
    'limit', v_limit, 'used', LEAST(v_used, v_limit),
    'remaining', GREATEST(v_limit - v_used, 0),
    'reset_at', v_reset, 'server_now', now()
  );
END;
$$;

-- Atomic consumption: a single conditional UPSERT, so concurrent requests can
-- never push the counter beyond the daily limit.
CREATE OR REPLACE FUNCTION public.consume_student_ai_quota(_user_id uuid, _cost integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost integer := GREATEST(COALESCE(_cost, 1), 1);
  v_today date;
  v_reset timestamptz;
  v_limit integer;
  v_used integer;
  v_premium timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  v_today := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_reset := ((v_today + 1)::timestamp) AT TIME ZONE 'Africa/Cairo';

  IF public.has_role(_user_id, 'admin'::public.app_role)
     OR public.has_role(_user_id, 'teacher'::public.app_role)
     OR public.has_role(_user_id, 'support'::public.app_role) THEN
    RETURN jsonb_build_object('allowed', true, 'plan', 'exempt', 'reason', 'role_exempt');
  END IF;

  v_premium := public.student_ai_premium_until(_user_id);
  IF v_premium IS NOT NULL AND v_premium > now() THEN
    RETURN jsonb_build_object('allowed', true, 'plan', 'premium', 'premium_until', v_premium);
  END IF;

  SELECT COALESCE(daily_limit, 10) INTO v_limit
  FROM public.ai_rate_limits WHERE feature = 'student_ai_shared';
  v_limit := COALESCE(v_limit, 10);

  INSERT INTO public.ai_usage_counters (user_id, feature, usage_date, minute_bucket, day_count, minute_count)
  VALUES (_user_id, 'student_ai_shared', v_today, date_trunc('minute', now()), v_cost, v_cost)
  ON CONFLICT (user_id, feature, usage_date) DO UPDATE
    SET day_count = public.ai_usage_counters.day_count + v_cost,
        minute_count = CASE
          WHEN public.ai_usage_counters.minute_bucket = date_trunc('minute', now())
            THEN public.ai_usage_counters.minute_count + v_cost
          ELSE v_cost
        END,
        minute_bucket = date_trunc('minute', now()),
        updated_at = now()
    WHERE public.ai_usage_counters.day_count + v_cost <= v_limit
  RETURNING day_count INTO v_used;

  IF v_used IS NULL THEN
    SELECT COALESCE(day_count, 0) INTO v_used
    FROM public.ai_usage_counters
    WHERE user_id = _user_id AND feature = 'student_ai_shared' AND usage_date = v_today;
    RETURN jsonb_build_object(
      'allowed', false, 'plan', 'free', 'reason', 'daily_free_limit',
      'used', COALESCE(v_used, v_limit), 'limit', v_limit,
      'remaining', 0, 'reset_at', v_reset
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'plan', 'free', 'used', v_used, 'limit', v_limit,
    'remaining', GREATEST(v_limit - v_used, 0), 'reset_at', v_reset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_student_ai_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_student_ai_quota(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.student_ai_premium_until(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_ai_premium_until(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_student_ai_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_ai_quota(uuid) TO authenticated, service_role;