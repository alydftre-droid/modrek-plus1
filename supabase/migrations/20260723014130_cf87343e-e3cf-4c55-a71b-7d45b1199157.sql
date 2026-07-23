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
  v_exec_day int;
  v_exec_month int;
  v_exec_year int;
  v_exec_hour int;
  v_exec_minute int;
  v_cairo_ts timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_due_ts timestamp;
  v_saved_due_ts timestamp;
  v_current_due_ts timestamp;
  v_next_ts timestamp;
  v_due_key text;
  v_current_due_key text;
  v_last_schedule_key text;
  v_last_status text;
  v_schedule_kind text;
  v_result jsonb;
  v_payload jsonb;
  v_got_lock boolean;
  v_due_source text := 'saved_next_release';
  v_is_explicit boolean := false;
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
    COALESCE(MAX(CASE WHEN key = 'withdrawal_open_minute' AND value ~ '^\d+$' THEN value::int END), 0),
    COALESCE(MAX(CASE WHEN key = 'withdrawal_schedule_kind' THEN value END), 'monthly_day'),
    MAX(CASE WHEN key = 'withdrawal_execution_day' AND value ~ '^\d+$' THEN value::int END),
    MAX(CASE WHEN key = 'withdrawal_execution_month' AND value ~ '^\d+$' THEN value::int END),
    MAX(CASE WHEN key = 'withdrawal_execution_year' AND value ~ '^\d+$' THEN value::int END),
    MAX(CASE WHEN key = 'withdrawal_execution_hour' AND value ~ '^\d+$' THEN value::int END),
    MAX(CASE WHEN key = 'withdrawal_execution_minute' AND value ~ '^\d+$' THEN value::int END)
  INTO v_day, v_hour, v_minute, v_schedule_kind, v_exec_day, v_exec_month, v_exec_year, v_exec_hour, v_exec_minute
  FROM public.platform_settings
  WHERE key IN (
    'withdrawal_open_day', 'withdrawal_open_hour', 'withdrawal_open_minute', 'withdrawal_schedule_kind',
    'withdrawal_execution_day', 'withdrawal_execution_month', 'withdrawal_execution_year', 'withdrawal_execution_hour', 'withdrawal_execution_minute'
  );

  v_day := LEAST(GREATEST(COALESCE(v_day, 25), 1), 28);
  v_hour := LEAST(GREATEST(COALESCE(v_hour, 9), 0), 23);
  v_minute := LEAST(GREATEST(COALESCE(v_minute, 0), 0), 59);
  v_exec_day := LEAST(GREATEST(COALESCE(v_exec_day, v_day), 1), 28);
  v_exec_month := LEAST(GREATEST(COALESCE(v_exec_month, EXTRACT(MONTH FROM v_cairo_ts)::int), 1), 12);
  v_exec_year := LEAST(GREATEST(COALESCE(v_exec_year, EXTRACT(YEAR FROM v_cairo_ts)::int), 2020), 2100);
  v_exec_hour := LEAST(GREATEST(COALESCE(v_exec_hour, v_hour), 0), 23);
  v_exec_minute := LEAST(GREATEST(COALESCE(v_exec_minute, v_minute), 0), 59);

  BEGIN
    SELECT NULLIF(value, '')::timestamp
    INTO v_saved_due_ts
    FROM public.platform_settings
    WHERE key = 'withdrawal_next_release_at_cairo'
      AND value IS NOT NULL
      AND value <> '';
  EXCEPTION WHEN others THEN
    v_saved_due_ts := NULL;
  END;

  SELECT value INTO v_last_schedule_key FROM public.platform_settings WHERE key = 'withdrawal_last_auto_release_schedule_key';
  SELECT value INTO v_last_status FROM public.platform_settings WHERE key = 'withdrawal_scheduler_last_status';

  IF COALESCE(v_schedule_kind, '') = 'explicit_date'
     OR EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'withdrawal_execution_year') THEN
    v_due_ts := make_timestamp(v_exec_year, v_exec_month, v_exec_day, v_exec_hour, v_exec_minute, 0);
    v_due_source := 'explicit_execution_date';
    v_is_explicit := true;
  ELSE
    v_current_due_ts := make_timestamp(
      EXTRACT(YEAR FROM v_cairo_ts)::int,
      EXTRACT(MONTH FROM v_cairo_ts)::int,
      v_day,
      v_hour,
      v_minute,
      0
    );
    v_current_due_key := to_char(v_current_due_ts, 'YYYY-MM-DD HH24:MI');

    IF COALESCE(v_schedule_kind, 'monthly_day') = 'monthly_day'
      AND v_current_due_ts <= v_cairo_ts
      AND v_current_due_ts >= (v_cairo_ts - interval '10 minutes')
      AND COALESCE(v_last_schedule_key, '') <> v_current_due_key THEN
      v_due_ts := v_current_due_ts;
      v_due_source := 'current_month_due_grace_rescue_over_stale_saved_next';
    ELSIF v_saved_due_ts IS NOT NULL THEN
      v_due_ts := v_saved_due_ts;
      v_due_source := 'saved_next_release';
    ELSE
      v_due_ts := v_current_due_ts;
      v_due_source := 'computed_from_settings';
      IF v_due_ts < (v_cairo_ts - interval '10 minutes') THEN
        v_due_ts := (v_due_ts + interval '1 month')::timestamp;
        v_due_source := 'computed_next_month';
      END IF;
    END IF;
  END IF;

  v_due_key := to_char(v_due_ts, 'YYYY-MM-DD HH24:MI');

  IF v_cairo_ts < v_due_ts THEN
    v_payload := jsonb_build_object(
      'success', true,
      'skipped', 'not_due_yet',
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_key', v_due_key,
      'schedule_kind', CASE WHEN v_is_explicit THEN 'explicit_date' ELSE v_schedule_kind END,
      'due_source', v_due_source,
      'last_run_key', v_last_schedule_key
    );
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'not_due_yet', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN v_payload;
  END IF;

  IF COALESCE(v_last_schedule_key, '') = v_due_key
     AND COALESCE(v_last_status, '') IN ('executed', 'already_ran_explicit_schedule', 'already_ran_this_exact_schedule') THEN
    IF v_is_explicit THEN
      v_payload := jsonb_build_object(
        'success', true,
        'skipped', 'already_ran_explicit_schedule',
        'schedule_key', v_due_key,
        'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
        'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
        'schedule_kind', 'explicit_date',
        'due_source', v_due_source
      );
      INSERT INTO public.platform_settings (key, value, updated_at)
      VALUES
        ('withdrawal_scheduler_last_check_at', now()::text, now()),
        ('withdrawal_scheduler_last_status', 'already_ran_explicit_schedule', now()),
        ('withdrawal_scheduler_last_payload', v_payload::text, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
      RETURN v_payload;
    END IF;

    v_next_ts := (v_due_ts + interval '1 month')::timestamp;
    WHILE v_next_ts <= v_cairo_ts LOOP
      v_next_ts := (v_next_ts + interval '1 month')::timestamp;
    END LOOP;

    v_payload := jsonb_build_object(
      'success', true,
      'skipped', 'already_ran_this_exact_schedule',
      'schedule_key', v_due_key,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_kind', v_schedule_kind,
      'due_source', v_due_source
    );

    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
      ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now()),
      ('withdrawal_schedule_day', EXTRACT(DAY FROM v_next_ts)::int::text, now()),
      ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
      ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now()),
      ('withdrawal_scheduler_last_check_at', now()::text, now()),
      ('withdrawal_scheduler_last_status', 'already_ran_this_exact_schedule', now()),
      ('withdrawal_scheduler_last_payload', v_payload::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    RETURN v_payload;
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('email', 'alyedaft@gmail.com')::text, true);
    BEGIN
      v_result := public.archive_all_teachers_period();
    EXCEPTION WHEN others THEN
      v_result := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
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
      'schedule_kind', CASE WHEN v_is_explicit THEN 'explicit_date' ELSE v_schedule_kind END,
      'due_source', v_due_source,
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

  IF v_is_explicit THEN
    v_next_ts := NULL;
  ELSE
    v_next_ts := (v_due_ts + interval '1 month')::timestamp;
    WHILE v_next_ts <= v_cairo_ts LOOP
      v_next_ts := (v_next_ts + interval '1 month')::timestamp;
    END LOOP;
  END IF;

  v_payload := jsonb_build_object(
    'success', true,
    'executed', true,
    'schedule_key', v_due_key,
    'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_scheduled_cairo', CASE WHEN v_next_ts IS NULL THEN NULL ELSE to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS') END,
    'schedule_kind', CASE WHEN v_is_explicit THEN 'explicit_date' ELSE v_schedule_kind END,
    'due_source', v_due_source,
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
    ('withdrawal_scheduler_last_check_at', now()::text, now()),
    ('withdrawal_scheduler_last_status', 'executed', now()),
    ('withdrawal_scheduler_last_payload', v_payload::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF v_is_explicit THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_next_release_at_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
      ('withdrawal_next_release_key', v_due_key, now()),
      ('withdrawal_schedule_kind', 'explicit_date', now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  ELSE
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
      ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now()),
      ('withdrawal_schedule_day', EXTRACT(DAY FROM v_next_ts)::int::text, now()),
      ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
      ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  END IF;

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
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_kind', CASE WHEN v_is_explicit THEN 'explicit_date' ELSE v_schedule_kind END,
      'due_source', v_due_source
    )
  );

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_scheduled_withdrawal_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO postgres;
GRANT EXECUTE ON FUNCTION public.archive_all_teachers_period() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_all_teachers_period() TO postgres;
GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO postgres;