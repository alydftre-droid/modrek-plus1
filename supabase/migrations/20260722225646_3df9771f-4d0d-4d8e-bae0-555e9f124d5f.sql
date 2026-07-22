CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_schedule(
  _day integer,
  _hour integer,
  _minute integer,
  _manual_state text DEFAULT 'auto'::text,
  _month integer DEFAULT NULL::integer,
  _year integer DEFAULT NULL::integer,
  _schedule_year integer DEFAULT NULL::integer,
  _schedule_month integer DEFAULT NULL::integer
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
  v_profit_month integer := CASE WHEN _month IS NOT NULL THEN LEAST(GREATEST(_month, 1), 12) ELSE NULL END;
  v_profit_year integer := CASE WHEN _year IS NOT NULL THEN LEAST(GREATEST(_year, 2020), 2100) ELSE NULL END;
  v_schedule_month integer := CASE WHEN _schedule_month IS NOT NULL THEN LEAST(GREATEST(_schedule_month, 1), 12) ELSE NULL END;
  v_schedule_year integer := CASE WHEN _schedule_year IS NOT NULL THEN LEAST(GREATEST(_schedule_year, 2020), 2100) ELSE NULL END;
  v_cairo_now timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_current_minute timestamp := date_trunc('minute', now() AT TIME ZONE 'Africa/Cairo');
  v_candidate_ts timestamp;
  v_next_ts timestamp;
  v_next_key text;
  v_last_key text;
  v_used_explicit_date boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR v_email IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  IF v_schedule_year IS NOT NULL AND v_schedule_month IS NOT NULL THEN
    v_candidate_ts := make_timestamp(v_schedule_year, v_schedule_month, v_day, v_hour, v_minute, 0);
    v_used_explicit_date := true;
  ELSE
    v_candidate_ts := make_timestamp(
      EXTRACT(YEAR FROM v_cairo_now)::int,
      EXTRACT(MONTH FROM v_cairo_now)::int,
      v_day,
      v_hour,
      v_minute,
      0
    );
  END IF;

  IF v_candidate_ts < (v_current_minute - interval '10 minutes') THEN
    IF v_used_explicit_date THEN
      v_next_ts := v_candidate_ts;
    ELSE
      v_next_ts := (v_candidate_ts + interval '1 month')::timestamp;
    END IF;
  ELSE
    v_next_ts := v_candidate_ts;
  END IF;

  IF NOT v_used_explicit_date THEN
    WHILE v_next_ts < (v_cairo_now - interval '10 minutes') LOOP
      v_next_ts := (v_next_ts + interval '1 month')::timestamp;
    END LOOP;
  END IF;

  v_next_key := to_char(v_next_ts, 'YYYY-MM-DD HH24:MI');
  SELECT value INTO v_last_key FROM public.platform_settings WHERE key = 'withdrawal_last_auto_release_schedule_key';

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_open_day', v_day::text, now()),
    ('withdrawal_open_hour', v_hour::text, now()),
    ('withdrawal_open_minute', v_minute::text, now()),
    ('withdrawal_manual_state', v_state, now()),
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', v_next_key, now()),
    ('withdrawal_schedule_day', v_day::text, now()),
    ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
    ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now()),
    ('withdrawal_schedule_saved_at', now()::text, now()),
    ('withdrawal_schedule_timezone', 'Africa/Cairo', now()),
    ('withdrawal_schedule_kind', CASE WHEN v_used_explicit_date THEN 'explicit_date' ELSE 'monthly_day' END, now()),
    ('withdrawal_scheduler_last_status', 'schedule_saved_waiting', now()),
    ('withdrawal_scheduler_last_payload', jsonb_build_object(
      'success', true,
      'saved', true,
      'schedule_kind', CASE WHEN v_used_explicit_date THEN 'explicit_date' ELSE 'monthly_day' END,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key,
      'grace_minutes', 10,
      'previous_last_release_key', v_last_key
    )::text, now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  IF v_profit_month IS NOT NULL AND v_profit_year IS NOT NULL THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_notification_month', v_profit_month::text, now()),
      ('withdrawal_notification_year', v_profit_year::text, now()),
      ('withdrawal_profit_label_period', v_profit_year::text || '-' || lpad(v_profit_month::text, 2, '0'), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  END IF;

  INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
  VALUES (
    v_caller,
    'withdrawal_schedule_saved',
    jsonb_build_object(
      'day', v_day,
      'hour', v_hour,
      'minute', v_minute,
      'manual_state', v_state,
      'schedule_month', EXTRACT(MONTH FROM v_next_ts)::int,
      'schedule_year', EXTRACT(YEAR FROM v_next_ts)::int,
      'schedule_kind', CASE WHEN v_used_explicit_date THEN 'explicit_date' ELSE 'monthly_day' END,
      'notification_month', v_profit_month,
      'notification_year', v_profit_year,
      'profit_label_period', CASE WHEN v_profit_month IS NOT NULL AND v_profit_year IS NOT NULL THEN v_profit_year::text || '-' || lpad(v_profit_month::text, 2, '0') ELSE NULL END,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key,
      'grace_minutes', 10
    ),
    'Withdrawal closing schedule saved with explicit date support and same-minute grace protection',
    jsonb_build_object('source', 'admin_set_withdrawal_schedule')
  );

  RETURN jsonb_build_object(
    'success', true,
    'day', v_day,
    'hour', v_hour,
    'minute', v_minute,
    'manual_state', v_state,
    'notification_month', v_profit_month,
    'notification_year', v_profit_year,
    'profit_label_period', CASE WHEN v_profit_month IS NOT NULL AND v_profit_year IS NOT NULL THEN v_profit_year::text || '-' || lpad(v_profit_month::text, 2, '0') ELSE NULL END,
    'schedule_day', v_day,
    'schedule_month', EXTRACT(MONTH FROM v_next_ts)::int,
    'schedule_year', EXTRACT(YEAR FROM v_next_ts)::int,
    'schedule_kind', CASE WHEN v_used_explicit_date THEN 'explicit_date' ELSE 'monthly_day' END,
    'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_release_key', v_next_key,
    'grace_minutes', 10
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_schedule(
  _day integer,
  _hour integer,
  _minute integer,
  _manual_state text DEFAULT 'auto'::text,
  _month integer DEFAULT NULL::integer,
  _year integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.admin_set_withdrawal_schedule($1, $2, $3, $4, $5, $6, NULL::integer, NULL::integer);
$function$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer, integer, integer) TO authenticated, service_role;

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
  v_saved_due_ts timestamp;
  v_current_due_ts timestamp;
  v_next_ts timestamp;
  v_due_key text;
  v_current_due_key text;
  v_last_schedule_key text;
  v_schedule_kind text;
  v_result jsonb;
  v_payload jsonb;
  v_got_lock boolean;
  v_due_source text := 'saved_next_release';
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
    COALESCE(MAX(CASE WHEN key = 'withdrawal_schedule_kind' THEN value END), 'monthly_day')
  INTO v_day, v_hour, v_minute, v_schedule_kind
  FROM public.platform_settings
  WHERE key IN ('withdrawal_open_day', 'withdrawal_open_hour', 'withdrawal_open_minute', 'withdrawal_schedule_kind');

  v_day := LEAST(GREATEST(COALESCE(v_day, 25), 1), 28);
  v_hour := LEAST(GREATEST(COALESCE(v_hour, 9), 0), 23);
  v_minute := LEAST(GREATEST(COALESCE(v_minute, 0), 0), 59);

  v_current_due_ts := make_timestamp(
    EXTRACT(YEAR FROM v_cairo_ts)::int,
    EXTRACT(MONTH FROM v_cairo_ts)::int,
    v_day,
    v_hour,
    v_minute,
    0
  );
  v_current_due_key := to_char(v_current_due_ts, 'YYYY-MM-DD HH24:MI');

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

  IF v_saved_due_ts IS NOT NULL THEN
    v_due_ts := v_saved_due_ts;
    v_due_source := 'saved_next_release';
  ELSIF COALESCE(v_schedule_kind, 'monthly_day') = 'monthly_day'
    AND v_current_due_ts <= v_cairo_ts
    AND v_current_due_ts >= (v_cairo_ts - interval '10 minutes')
    AND COALESCE(v_last_schedule_key, '') <> v_current_due_key THEN
    v_due_ts := v_current_due_ts;
    v_due_source := 'current_month_due_grace_rescue';
  ELSE
    v_due_ts := v_current_due_ts;
    v_due_source := 'computed_from_settings';
    IF v_due_ts < (v_cairo_ts - interval '10 minutes') THEN
      v_due_ts := (v_due_ts + interval '1 month')::timestamp;
      v_due_source := 'computed_next_month';
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
      'schedule_kind', v_schedule_kind,
      'due_source', v_due_source
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
      'schedule_kind', v_schedule_kind,
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

  v_next_ts := (v_due_ts + interval '1 month')::timestamp;
  WHILE v_next_ts <= v_cairo_ts LOOP
    v_next_ts := (v_next_ts + interval '1 month')::timestamp;
  END LOOP;

  v_payload := jsonb_build_object(
    'success', true,
    'executed', true,
    'schedule_key', v_due_key,
    'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'schedule_kind', v_schedule_kind,
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
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now()),
    ('withdrawal_schedule_day', EXTRACT(DAY FROM v_next_ts)::int::text, now()),
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
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_kind', v_schedule_kind,
      'due_source', v_due_source
    )
  );

  RETURN v_payload;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_scheduled_withdrawal_release() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_financial_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period text := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
  v_cal_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Cairo');
  v_period_start timestamptz;
  v_period_start_text text;
  v_result jsonb;
  v_top_teacher jsonb := '{}'::jsonb;
  v_revenue_series jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT value INTO v_period_start_text FROM public.platform_settings WHERE key = 'financial_period_start_at';
  BEGIN
    v_period_start := COALESCE(v_period_start_text::timestamptz, v_cal_month_start);
  EXCEPTION WHEN others THEN
    v_period_start := v_cal_month_start;
  END;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  SELECT ur.user_id, 0, 0, 0, v_period
  FROM public.user_roles ur
  LEFT JOIN public.teacher_wallets tw ON tw.teacher_id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'teacher'::public.app_role
    AND tw.teacher_id IS NULL
    AND COALESCE(p.is_test_account, false) = false
  ON CONFLICT (teacher_id) DO NOTHING;

  SELECT COALESCE(to_jsonb(t), '{}'::jsonb) INTO v_top_teacher
  FROM (
    SELECT ter.teacher_id,
           COALESCE(p.full_name, 'معلم') AS name,
           SUM(COALESCE(ter.net_amount, 0)) AS earnings
    FROM public.teacher_earning_records ter
    LEFT JOIN public.profiles p ON p.id = ter.teacher_id
    WHERE ter.created_at >= v_period_start
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY ter.teacher_id, p.full_name
    ORDER BY SUM(COALESCE(ter.net_amount, 0)) DESC
    LIMIT 1
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.period), '[]'::jsonb) INTO v_revenue_series
  FROM (
    SELECT to_char(m, 'YYYY-MM') AS period,
           COALESCE(SUM(ter.gross_amount) FILTER (WHERE ter.period_label = to_char(m, 'YYYY-MM')), 0) AS gross,
           COALESCE(SUM(ter.net_amount) FILTER (WHERE ter.period_label = to_char(m, 'YYYY-MM')), 0) AS teacher_net
    FROM generate_series(
           date_trunc('month', now() - INTERVAL '5 months'),
           date_trunc('month', now()),
           INTERVAL '1 month'
         ) AS m
    LEFT JOIN public.teacher_earning_records ter
      ON ter.period_label = to_char(m, 'YYYY-MM')
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY m
  ) x;

  SELECT jsonb_build_object(
    'success', true,
    'period', v_period,
    'period_start', v_period_start,
    'total_available', COALESCE((SELECT SUM(balance) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false), 0),
    'total_frozen', COALESCE((SELECT SUM(frozen_balance) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false), 0),
    'total_teachers', COALESCE((SELECT COUNT(*) FROM public.user_roles ur LEFT JOIN public.profiles p ON p.id = ur.user_id WHERE ur.role = 'teacher'::public.app_role AND COALESCE(p.is_test_account, false) = false), 0),
    'teachers_with_frozen', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false AND tw.frozen_balance > 0), 0),
    'teachers_with_available', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false AND tw.balance > 0), 0),
    'total_earned_all_time', COALESCE((SELECT SUM(total_earned) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false), 0),
    'month_gross', COALESCE((SELECT SUM(gross_amount) FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id)), 0),
    'month_teacher_net', COALESCE((SELECT SUM(net_amount) FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id)), 0),
    'month_platform_cut', COALESCE((SELECT SUM(gross_amount - net_amount) FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id)), 0),
    'month_paying_students', COALESCE((SELECT COUNT(DISTINCT student_id) FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id)), 0),
    'month_subscriptions', COALESCE((SELECT COUNT(*) FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id)), 0),
    'active_groups', COALESCE((SELECT COUNT(DISTINCT group_id) FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id)), 0),
    'pending_requests', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'pending_amount', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'approved_total', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved' AND processed_at >= v_period_start), 0),
    'approved_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'approved' AND processed_at >= v_period_start), 0),
    'approved_total_all_time', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'approved_count_all_time', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'rejected_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'rejected'), 0),
    'approved_this_month', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved' AND processed_at >= v_period_start), 0),
    'archives_this_month', COALESCE((SELECT COUNT(*) FROM public.teacher_monthly_archives WHERE archived_at >= v_period_start), 0),
    'avg_teacher_earnings_month', COALESCE((SELECT AVG(t.s) FROM (SELECT SUM(net_amount) AS s FROM public.teacher_earning_records WHERE created_at >= v_period_start AND NOT public.is_test_student(student_id) GROUP BY teacher_id) t), 0),
    'top_teacher', COALESCE(v_top_teacher, '{}'::jsonb),
    'revenue_series', COALESCE(v_revenue_series, '[]'::jsonb),
    'last_release_at', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_last_release_at'),
    'manual_state', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_manual_state'), 'auto'),
    'open_day', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_day'), '25'),
    'open_hour', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_hour'), '9'),
    'open_minute', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_minute'), '0'),
    'next_release_cairo', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_next_release_at_cairo'),
    'next_release_key', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_next_release_key'),
    'notification_month', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_notification_month'), (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_schedule_month')),
    'notification_year', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_notification_year'), (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_schedule_year')),
    'schedule_day', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_schedule_day'),
    'schedule_month', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_schedule_month'),
    'schedule_year', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_schedule_year'),
    'schedule_kind', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_schedule_kind'),
    'scheduler_last_check_at', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_scheduler_last_check_at'),
    'scheduler_last_status', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_scheduler_last_status'),
    'scheduler_last_payload', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_scheduler_last_payload'),
    'last_auto_release_key', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_last_auto_release_schedule_key')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_financial_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_financial_overview() TO authenticated, service_role;