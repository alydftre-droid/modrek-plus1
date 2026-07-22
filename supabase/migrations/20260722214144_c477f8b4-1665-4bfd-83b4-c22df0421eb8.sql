
-- Fix: admin_set_withdrawal_schedule must honor manual month/year when scheduling the auto run,
-- not only when labeling the notification. Without this, the cron worker never fires at the
-- month/year the developer selected because next_release_at_cairo is always computed from the
-- current Cairo month.

DROP FUNCTION IF EXISTS public.admin_set_withdrawal_schedule(int, int, int, text, int, int);

CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_schedule(
  _day integer,
  _hour integer,
  _minute integer,
  _manual_state text DEFAULT 'auto',
  _month integer DEFAULT NULL,
  _year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
  v_day integer := LEAST(GREATEST(COALESCE(_day, 25), 1), 28);
  v_hour integer := LEAST(GREATEST(COALESCE(_hour, 9), 0), 23);
  v_minute integer := LEAST(GREATEST(COALESCE(_minute, 0), 0), 59);
  v_state text := CASE WHEN COALESCE(_manual_state, 'auto') = 'closed' THEN 'closed' ELSE 'auto' END;
  v_month integer := CASE WHEN _month IS NOT NULL THEN LEAST(GREATEST(_month, 1), 12) ELSE NULL END;
  v_year integer := CASE WHEN _year IS NOT NULL THEN LEAST(GREATEST(_year, 2020), 2100) ELSE NULL END;
  v_cairo_now timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_next_ts timestamp;
  v_next_key text;
  v_used_manual_period boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR v_email IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  -- If admin picked an explicit month/year, schedule the auto run for that exact month/year.
  -- Otherwise fall back to the next occurrence of the chosen day from "now".
  IF v_month IS NOT NULL AND v_year IS NOT NULL THEN
    v_next_ts := make_timestamp(v_year, v_month, v_day, v_hour, v_minute, 0);
    v_used_manual_period := true;
    -- If the manually chosen datetime is already in the past, roll forward one month at a time
    -- until it is in the future so the cron worker can still catch it.
    WHILE v_next_ts <= v_cairo_now LOOP
      v_next_ts := (v_next_ts + interval '1 month')::timestamp;
    END LOOP;
  ELSE
    v_next_ts := make_timestamp(
      EXTRACT(YEAR FROM v_cairo_now)::int,
      EXTRACT(MONTH FROM v_cairo_now)::int,
      v_day, v_hour, v_minute, 0
    );
    IF v_next_ts <= v_cairo_now THEN
      v_next_ts := (v_next_ts + interval '1 month')::timestamp;
    END IF;
  END IF;
  v_next_key := to_char(v_next_ts, 'YYYY-MM-DD HH24:MI');

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_open_day', v_day::text, now()),
    ('withdrawal_open_hour', v_hour::text, now()),
    ('withdrawal_open_minute', v_minute::text, now()),
    ('withdrawal_manual_state', v_state, now()),
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', v_next_key, now()),
    ('withdrawal_schedule_saved_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  IF v_month IS NOT NULL AND v_year IS NOT NULL THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_notification_month', v_month::text, now()),
      ('withdrawal_notification_year', v_year::text, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  END IF;

  -- CRITICAL: clear the "already ran this schedule" guard so the worker will actually fire
  -- when the newly saved schedule becomes due. Without this, if the previous schedule_key
  -- accidentally equals the new one (same day/hour/minute), the worker permanently skips.
  DELETE FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_schedule_key'
    AND value = v_next_key;

  INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
  VALUES (
    v_caller,
    'withdrawal_schedule_saved',
    jsonb_build_object(
      'day', v_day, 'hour', v_hour, 'minute', v_minute,
      'manual_state', v_state,
      'notification_month', v_month,
      'notification_year', v_year,
      'used_manual_period', v_used_manual_period,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key
    ),
    'Withdrawal closing schedule saved by admin',
    jsonb_build_object('source', 'admin_set_withdrawal_schedule')
  );

  RETURN jsonb_build_object(
    'success', true,
    'day', v_day, 'hour', v_hour, 'minute', v_minute,
    'manual_state', v_state,
    'notification_month', v_month,
    'notification_year', v_year,
    'used_manual_period', v_used_manual_period,
    'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_release_key', v_next_key
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_schedule(int, int, int, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(int, int, int, text, int, int) TO authenticated, service_role;
