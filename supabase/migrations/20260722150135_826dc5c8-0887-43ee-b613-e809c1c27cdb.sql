-- Fix scheduled teacher withdrawal releases so changing the configured
-- Cairo day/time inside the same month is honored. The previous logic
-- blocked any second automatic run in the same YYYY-MM period, even when
-- the developer intentionally changed the closing schedule.

CREATE OR REPLACE FUNCTION public.process_scheduled_withdrawal_release()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state text;
  v_mode text;
  v_day int;
  v_hour int;
  v_minute int;
  v_cairo_ts timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_scheduled_ts timestamp;
  v_next_scheduled_ts timestamp;
  v_schedule_key text;
  v_last_schedule_key text;
  v_last_auto_period text;
  v_last_auto_at timestamptz;
  v_schedule_updated_at timestamptz;
  v_run_period text;
  v_result jsonb;
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_xact_lock(hashtext('scheduled_withdrawal_release_worker'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'worker_already_running');
  END IF;

  SELECT value INTO v_state
  FROM public.platform_settings
  WHERE key = 'withdrawal_manual_state';

  IF COALESCE(v_state, 'auto') = 'closed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'manual_closed',
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  SELECT value INTO v_mode
  FROM public.platform_settings
  WHERE key = 'withdrawal_release_mode';

  -- Keep old installations working: if the mode is absent, scheduled is the default.
  IF COALESCE(NULLIF(v_mode, ''), 'scheduled') NOT IN ('scheduled', 'auto') THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'release_mode_not_scheduled',
      'mode', v_mode,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  SELECT COALESCE(MAX(updated_at), to_timestamp(0))
  INTO v_schedule_updated_at
  FROM public.platform_settings
  WHERE key IN ('withdrawal_open_day', 'withdrawal_open_hour', 'withdrawal_open_minute', 'withdrawal_manual_state', 'withdrawal_release_mode');

  SELECT
    COALESCE(MAX(CASE WHEN key = 'withdrawal_open_day' AND value ~ '^\d+$' THEN value::int END), 25),
    COALESCE(MAX(CASE WHEN key = 'withdrawal_open_hour' AND value ~ '^\d+$' THEN value::int END), 9),
    COALESCE(MAX(CASE WHEN key = 'withdrawal_open_minute' AND value ~ '^\d+$' THEN value::int END), 0)
  INTO v_day, v_hour, v_minute
  FROM public.platform_settings
  WHERE key IN ('withdrawal_open_day', 'withdrawal_open_hour', 'withdrawal_open_minute');

  v_day := LEAST(GREATEST(COALESCE(v_day, 25), 1), 28);
  v_hour := LEAST(GREATEST(COALESCE(v_hour, 9), 0), 23);
  v_minute := LEAST(GREATEST(COALESCE(v_minute, 0), 0), 59);

  v_scheduled_ts := make_timestamp(
    EXTRACT(YEAR FROM v_cairo_ts)::int,
    EXTRACT(MONTH FROM v_cairo_ts)::int,
    v_day,
    v_hour,
    v_minute,
    0
  );

  v_schedule_key := to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI');
  v_run_period := to_char(v_scheduled_ts, 'YYYY-MM');

  SELECT value INTO v_last_schedule_key
  FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_schedule_key';

  SELECT value INTO v_last_auto_period
  FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_period';

  SELECT NULLIF(value, '')::timestamptz INTO v_last_auto_at
  FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_at'
    AND value IS NOT NULL
    AND value <> '';

  -- If this month's configured event is still in the future, do nothing.
  IF v_cairo_ts < v_scheduled_ts THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'not_due_yet',
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'scheduled_cairo', to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_key', v_schedule_key
    );
  END IF;

  -- New idempotency: only block the exact configured schedule event,
  -- not the entire month. This allows the developer to change the date/time
  -- and have the new due event run correctly.
  IF COALESCE(v_last_schedule_key, '') = v_schedule_key THEN
    v_next_scheduled_ts := make_timestamp(
      EXTRACT(YEAR FROM (v_cairo_ts + interval '1 month'))::int,
      EXTRACT(MONTH FROM (v_cairo_ts + interval '1 month'))::int,
      v_day,
      v_hour,
      v_minute,
      0
    );

    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'already_ran_this_exact_schedule',
      'period', v_run_period,
      'schedule_key', v_schedule_key,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_scheduled_cairo', to_char(v_next_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  -- Backward compatibility for deployments that only have the old monthly marker:
  -- if the schedule was not changed after the old run, do not rerun. If the
  -- developer changed the schedule after that run, allow the new schedule event.
  IF v_last_schedule_key IS NULL
     AND COALESCE(v_last_auto_period, '') = v_run_period
     AND v_last_auto_at IS NOT NULL
     AND COALESCE(v_schedule_updated_at, to_timestamp(0)) <= v_last_auto_at THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES ('withdrawal_last_auto_release_schedule_key', v_schedule_key, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'already_ran_legacy_monthly_schedule',
      'period', v_run_period,
      'schedule_key', v_schedule_key,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  v_result := public.archive_all_teachers_period();

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_last_auto_release_period', v_run_period, now()),
    ('withdrawal_last_auto_release_schedule_key', v_schedule_key, now()),
    ('withdrawal_last_auto_release_at', now()::text, now()),
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_manual_state', 'auto', now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.financial_audit_logs (actor_id, action, amount, new_value, reason, metadata)
  VALUES (
    NULL,
    'scheduled_monthly_closing_run',
    COALESCE((v_result->>'total_moved')::numeric, 0),
    v_result,
    'Scheduled monthly closing executed by backend cron',
    jsonb_build_object(
      'period', v_run_period,
      'schedule_key', v_schedule_key,
      'scheduled_cairo', to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_settings_updated_at', v_schedule_updated_at
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'executed', true,
    'period', v_run_period,
    'schedule_key', v_schedule_key,
    'scheduled_cairo', to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'result', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO service_role;

-- Preserve the exact schedule event that already ran, when we can infer it
-- from the audit log, so the worker does not duplicate an old event after this repair.
INSERT INTO public.platform_settings (key, value, updated_at)
SELECT
  'withdrawal_last_auto_release_schedule_key',
  left(metadata->>'scheduled_cairo', 16),
  now()
FROM public.financial_audit_logs
WHERE action = 'scheduled_monthly_closing_run'
  AND metadata ? 'scheduled_cairo'
  AND NULLIF(metadata->>'scheduled_cairo', '') IS NOT NULL
ORDER BY created_at DESC
LIMIT 1
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  ('withdrawal_release_mode', 'scheduled', now()),
  ('withdrawal_manual_state', 'auto', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Ensure the background checker remains installed and checks every minute.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE EXCEPTION 'pg_cron extension/schema is not available; cannot schedule automatic withdrawal release';
  END IF;

  BEGIN
    PERFORM cron.unschedule('modrek_teacher_monthly_withdrawal_release');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'modrek_teacher_monthly_withdrawal_release',
    '* * * * *',
    'SELECT public.process_scheduled_withdrawal_release();'
  );
END $$;