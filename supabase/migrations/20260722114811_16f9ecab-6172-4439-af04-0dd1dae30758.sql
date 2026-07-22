CREATE OR REPLACE FUNCTION public.process_scheduled_withdrawal_release()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_day int;
  v_hour int;
  v_minute int;
  v_last text;
  v_last_ts timestamptz;
  v_cairo timestamptz;
  v_cairo_day int;
  v_cairo_hour int;
  v_cairo_minute int;
  v_result jsonb;
BEGIN
  SELECT value INTO v_state FROM public.platform_settings WHERE key = 'withdrawal_manual_state';
  IF COALESCE(v_state, 'auto') = 'closed' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'manual_closed');
  END IF;

  SELECT value INTO v_day  FROM public.platform_settings WHERE key = 'withdrawal_open_day';
  SELECT value INTO v_hour FROM public.platform_settings WHERE key = 'withdrawal_open_hour';
  SELECT value INTO v_minute FROM public.platform_settings WHERE key = 'withdrawal_open_minute';

  v_day := COALESCE(v_day, 25);
  v_hour := COALESCE(v_hour, 9);
  v_minute := COALESCE(v_minute, 0);

  v_cairo := (now() AT TIME ZONE 'Africa/Cairo')::timestamptz;
  v_cairo_day    := EXTRACT(DAY FROM (now() AT TIME ZONE 'Africa/Cairo'))::int;
  v_cairo_hour   := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Africa/Cairo'))::int;
  v_cairo_minute := EXTRACT(MINUTE FROM (now() AT TIME ZONE 'Africa/Cairo'))::int;

  IF v_cairo_day <> v_day OR v_cairo_hour <> v_hour OR v_cairo_minute < v_minute OR v_cairo_minute > v_minute + 5 THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'not_scheduled_window',
      'now_day', v_cairo_day, 'now_hour', v_cairo_hour, 'now_minute', v_cairo_minute,
      'target_day', v_day, 'target_hour', v_hour, 'target_minute', v_minute);
  END IF;

  SELECT value INTO v_last FROM public.platform_settings WHERE key = 'withdrawal_last_release_at';
  IF v_last IS NOT NULL AND v_last <> '' THEN
    BEGIN
      v_last_ts := v_last::timestamptz;
      IF (now() - v_last_ts) < interval '20 hours' THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'already_ran_recently', 'last', v_last);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  v_result := public.archive_all_teachers_period();

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES ('withdrawal_last_release_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object('success', true, 'executed', true, 'result', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.process_scheduled_withdrawal_release() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO service_role, postgres;