CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_schedule(
  _day integer,
  _hour integer,
  _minute integer,
  _manual_state text DEFAULT 'auto'::text,
  _month integer DEFAULT NULL::integer,
  _year integer DEFAULT NULL::integer
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
  v_explicit_period boolean := _month IS NOT NULL AND _year IS NOT NULL;
  v_month integer;
  v_year integer;
  v_cairo_now timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_next_ts timestamp;
  v_next_key text;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR v_email IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  IF v_explicit_period THEN
    IF _month NOT BETWEEN 1 AND 12 OR _year NOT BETWEEN 2020 AND 2100 THEN
      RETURN jsonb_build_object('success', false, 'error', 'الشهر أو السنة غير صحيح');
    END IF;

    v_month := _month;
    v_year := _year;

    -- Critical fix: keep the developer's exact selected Cairo date/time.
    -- Do NOT silently roll it to a different month. If it is already due,
    -- the minute worker will execute it immediately on its next tick.
    v_next_ts := make_timestamp(v_year, v_month, v_day, v_hour, v_minute, 0);
  ELSE
    v_next_ts := make_timestamp(
      EXTRACT(YEAR FROM v_cairo_now)::int,
      EXTRACT(MONTH FROM v_cairo_now)::int,
      v_day,
      v_hour,
      v_minute,
      0
    );

    IF v_next_ts <= v_cairo_now THEN
      v_next_ts := (v_next_ts + interval '1 month')::timestamp;
    END IF;

    v_month := EXTRACT(MONTH FROM v_next_ts)::int;
    v_year := EXTRACT(YEAR FROM v_next_ts)::int;
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
    ('withdrawal_schedule_month', v_month::text, now()),
    ('withdrawal_schedule_year', v_year::text, now()),
    ('withdrawal_notification_month', v_month::text, now()),
    ('withdrawal_notification_year', v_year::text, now()),
    ('withdrawal_schedule_saved_at', now()::text, now()),
    ('withdrawal_schedule_timezone', 'Africa/Cairo', now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  -- Allow an admin to intentionally schedule the same exact key again.
  DELETE FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_schedule_key'
    AND value = v_next_key;

  INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
  VALUES (
    v_caller,
    'withdrawal_schedule_saved',
    jsonb_build_object(
      'day', v_day,
      'hour', v_hour,
      'minute', v_minute,
      'manual_state', v_state,
      'schedule_month', v_month,
      'schedule_year', v_year,
      'explicit_period', v_explicit_period,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key
    ),
    'Withdrawal monthly closing schedule saved by admin',
    jsonb_build_object('source', 'admin_set_withdrawal_schedule')
  );

  RETURN jsonb_build_object(
    'success', true,
    'day', v_day,
    'hour', v_hour,
    'minute', v_minute,
    'manual_state', v_state,
    'schedule_month', v_month,
    'schedule_year', v_year,
    'explicit_period', v_explicit_period,
    'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_release_key', v_next_key
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_scheduled_withdrawal_release()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
  v_mode text;
  v_day int;
  v_hour int;
  v_minute int;
  v_cairo_ts timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_due_ts timestamp;
  v_next_ts timestamp;
  v_due_key text;
  v_last_schedule_key text;
  v_result jsonb;
  v_payload jsonb;
  v_got_lock boolean;
BEGIN
  v_got_lock := pg_try_advisory_xact_lock(hashtext('scheduled_withdrawal_release_worker'));
  IF NOT v_got_lock THEN
    v_payload := jsonb_build_object('success', true, 'skipped', 'worker_already_running', 'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'));
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'worker_already_running', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN v_payload;
  END IF;

  SELECT value INTO v_state FROM public.platform_settings WHERE key = 'withdrawal_manual_state';
  IF COALESCE(v_state, 'auto') = 'closed' THEN
    v_payload := jsonb_build_object('success', true, 'skipped', 'manual_closed', 'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'));
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'manual_closed', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN v_payload;
  END IF;

  SELECT value INTO v_mode FROM public.platform_settings WHERE key = 'withdrawal_release_mode';
  IF COALESCE(NULLIF(v_mode, ''), 'scheduled') NOT IN ('scheduled', 'auto') THEN
    v_payload := jsonb_build_object('success', true, 'skipped', 'release_mode_not_scheduled', 'mode', v_mode, 'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'));
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'release_mode_not_scheduled', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN v_payload;
  END IF;

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

  BEGIN
    SELECT NULLIF(value, '')::timestamp
    INTO v_due_ts
    FROM public.platform_settings
    WHERE key = 'withdrawal_next_release_at_cairo'
      AND value IS NOT NULL
      AND value <> '';
  EXCEPTION WHEN others THEN
    v_due_ts := NULL;
  END;

  IF v_due_ts IS NULL THEN
    v_due_ts := make_timestamp(
      EXTRACT(YEAR FROM v_cairo_ts)::int,
      EXTRACT(MONTH FROM v_cairo_ts)::int,
      v_day,
      v_hour,
      v_minute,
      0
    );
    IF v_due_ts <= v_cairo_ts THEN
      v_due_ts := (v_due_ts + interval '1 month')::timestamp;
    END IF;
  END IF;

  v_due_key := to_char(v_due_ts, 'YYYY-MM-DD HH24:MI');
  SELECT value INTO v_last_schedule_key FROM public.platform_settings WHERE key = 'withdrawal_last_auto_release_schedule_key';

  IF v_cairo_ts < v_due_ts THEN
    v_payload := jsonb_build_object(
      'success', true,
      'skipped', 'not_due_yet',
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_key', v_due_key
    );
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'not_due_yet', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN v_payload;
  END IF;

  IF COALESCE(v_last_schedule_key, '') = v_due_key THEN
    v_next_ts := (v_due_ts + interval '1 month')::timestamp;
    v_payload := jsonb_build_object(
      'success', true,
      'skipped', 'already_ran_this_exact_schedule',
      'schedule_key', v_due_key,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS')
    );

    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
      ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now()),
      ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
      ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now()),
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'already_ran_this_exact_schedule', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    RETURN v_payload;
  END IF;

  BEGIN
    v_result := public.archive_all_teachers_period();
  EXCEPTION WHEN others THEN
    v_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    v_payload := jsonb_build_object(
      'success', false,
      'error', COALESCE(v_result->>'error', 'فشل إقفال الشهر'),
      'schedule_key', v_due_key,
      'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'result', v_result
    );

    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'execution_failed', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
    VALUES (NULL, 'scheduled_monthly_closing_failed', v_payload, 'Scheduled monthly closing failed and will be retried', jsonb_build_object('source', 'process_scheduled_withdrawal_release'));

    RETURN v_payload;
  END IF;

  v_next_ts := (v_due_ts + interval '1 month')::timestamp;
  v_payload := jsonb_build_object(
    'success', true,
    'executed', true,
    'schedule_key', v_due_key,
    'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'result', v_result
  );

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_last_auto_release_period', to_char(v_due_ts, 'YYYY-MM'), now()),
    ('withdrawal_last_auto_release_schedule_key', v_due_key, now()),
    ('withdrawal_last_auto_release_at', now()::text, now()),
    ('withdrawal_last_auto_release_result', v_result::text, now()),
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_manual_state', 'auto', now()),
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now()),
    ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
    ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now()),
    ('withdrawal_scheduler_last_check_at', now()::text, now()),
    ('withdrawal_scheduler_last_status', 'executed', now()),
    ('withdrawal_scheduler_last_payload', v_payload::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.financial_audit_logs (actor_id, action, amount, new_value, reason, metadata)
  VALUES (
    NULL,
    'scheduled_monthly_closing_run',
    COALESCE((v_result->>'total_moved')::numeric, 0),
    v_result,
    'Scheduled monthly closing executed by backend cron',
    jsonb_build_object(
      'source', 'process_scheduled_withdrawal_release',
      'period', to_char(v_due_ts, 'YYYY-MM'),
      'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    )
  );

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_scheduled_withdrawal_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    UPDATE cron.job
    SET schedule = '* * * * *',
        command = 'SELECT public.process_scheduled_withdrawal_release();',
        active = true
    WHERE jobname = 'modrek_teacher_monthly_withdrawal_release';

    IF NOT FOUND THEN
      PERFORM cron.schedule(
        'modrek_teacher_monthly_withdrawal_release',
        '* * * * *',
        'SELECT public.process_scheduled_withdrawal_release();'
      );
    END IF;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not repair monthly closing cron job: %', SQLERRM;
END $$;