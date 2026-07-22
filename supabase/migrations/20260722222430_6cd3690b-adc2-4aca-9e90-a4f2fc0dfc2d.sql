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
  v_month integer := CASE WHEN _month IS NOT NULL THEN LEAST(GREATEST(_month, 1), 12) ELSE NULL END;
  v_year integer := CASE WHEN _year IS NOT NULL THEN LEAST(GREATEST(_year, 2020), 2100) ELSE NULL END;
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

  -- الشهر/السنة اليدوية ليست موعد التنفيذ؛ هي تسمية للأرباح والإشعار والأرشيف فقط.
  -- التنفيذ الفعلي يُحسب شهرياً من اليوم/الساعة/الدقيقة بتوقيت القاهرة.
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
    ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
    ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now()),
    ('withdrawal_schedule_saved_at', now()::text, now()),
    ('withdrawal_schedule_timezone', 'Africa/Cairo', now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  IF v_month IS NOT NULL AND v_year IS NOT NULL THEN
    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_notification_month', v_month::text, now()),
      ('withdrawal_notification_year', v_year::text, now()),
      ('withdrawal_profit_label_period', v_year::text || '-' || lpad(v_month::text, 2, '0'), now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  END IF;

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
      'notification_month', v_month,
      'notification_year', v_year,
      'profit_label_period', CASE WHEN v_month IS NOT NULL AND v_year IS NOT NULL THEN v_year::text || '-' || lpad(v_month::text, 2, '0') ELSE NULL END,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key
    ),
    'Withdrawal closing schedule and profit label saved by admin',
    jsonb_build_object('source', 'admin_set_withdrawal_schedule')
  );

  RETURN jsonb_build_object(
    'success', true,
    'day', v_day,
    'hour', v_hour,
    'minute', v_minute,
    'manual_state', v_state,
    'notification_month', v_month,
    'notification_year', v_year,
    'profit_label_period', CASE WHEN v_month IS NOT NULL AND v_year IS NOT NULL THEN v_year::text || '-' || lpad(v_month::text, 2, '0') ELSE NULL END,
    'schedule_month', EXTRACT(MONTH FROM v_next_ts)::int,
    'schedule_year', EXTRACT(YEAR FROM v_next_ts)::int,
    'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_release_key', v_next_key
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_profit_label(
  _month integer,
  _year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
  v_month integer := LEAST(GREATEST(COALESCE(_month, EXTRACT(MONTH FROM now() AT TIME ZONE 'Africa/Cairo')::int), 1), 12);
  v_year integer := LEAST(GREATEST(COALESCE(_year, EXTRACT(YEAR FROM now() AT TIME ZONE 'Africa/Cairo')::int), 2020), 2100);
  v_label text;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR v_email IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  v_label := v_year::text || '-' || lpad(v_month::text, 2, '0');

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_notification_month', v_month::text, now()),
    ('withdrawal_notification_year', v_year::text, now()),
    ('withdrawal_profit_label_period', v_label, now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
  VALUES (
    v_caller,
    'withdrawal_profit_label_saved',
    jsonb_build_object('month', v_month, 'year', v_year, 'profit_label_period', v_label),
    'Withdrawal profit label saved without changing the closing schedule',
    jsonb_build_object('source', 'admin_set_withdrawal_profit_label')
  );

  RETURN jsonb_build_object('success', true, 'notification_month', v_month, 'notification_year', v_year, 'profit_label_period', v_label);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_withdrawal_profit_label(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_profit_label(integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_teacher_archive_display_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month text;
  v_year text;
  v_display_period text;
  v_source_period text;
  v_wallet_before jsonb;
BEGIN
  SELECT value INTO v_month FROM public.platform_settings WHERE key = 'withdrawal_notification_month';
  SELECT value INTO v_year FROM public.platform_settings WHERE key = 'withdrawal_notification_year';

  IF v_month IS NULL OR v_year IS NULL
     OR v_month !~ '^\d+$' OR v_year !~ '^\d+$'
     OR v_month::int NOT BETWEEN 1 AND 12
     OR v_year::int NOT BETWEEN 2020 AND 2100 THEN
    RETURN NEW;
  END IF;

  v_source_period := COALESCE(NEW.period_label, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM'));
  v_display_period := v_year || '-' || lpad(v_month, 2, '0');

  NEW.period_label := v_display_period;
  NEW.snapshot := COALESCE(NEW.snapshot, '{}'::jsonb) || jsonb_build_object(
    'period_label', v_display_period,
    'display_period_label', v_display_period,
    'source_period_label', v_source_period,
    'profit_label_period', v_display_period
  );

  v_wallet_before := COALESCE(NEW.snapshot->'wallet_before', '{}'::jsonb) || jsonb_build_object(
    'display_period_label', v_display_period,
    'source_period_label', v_source_period
  );
  NEW.snapshot := jsonb_set(NEW.snapshot, '{wallet_before}', v_wallet_before, true);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_teacher_archive_display_period ON public.teacher_monthly_archives;
CREATE TRIGGER trg_apply_teacher_archive_display_period
BEFORE INSERT ON public.teacher_monthly_archives
FOR EACH ROW
EXECUTE FUNCTION public.apply_teacher_archive_display_period();

CREATE OR REPLACE FUNCTION public.apply_teacher_wallet_transaction_display_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month text;
  v_year text;
  v_display_period text;
  v_source_period text;
BEGIN
  IF NEW.transaction_type IS DISTINCT FROM 'frozen_release' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_month FROM public.platform_settings WHERE key = 'withdrawal_notification_month';
  SELECT value INTO v_year FROM public.platform_settings WHERE key = 'withdrawal_notification_year';

  IF v_month IS NULL OR v_year IS NULL
     OR v_month !~ '^\d+$' OR v_year !~ '^\d+$'
     OR v_month::int NOT BETWEEN 1 AND 12
     OR v_year::int NOT BETWEEN 2020 AND 2100 THEN
    RETURN NEW;
  END IF;

  v_source_period := COALESCE(NEW.metadata->>'period_label', to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM'));
  v_display_period := v_year || '-' || lpad(v_month, 2, '0');

  NEW.description := 'تحويل الرصيد المجمّد للمتاح لشهر ' || v_display_period;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'period_label', v_display_period,
    'display_period_label', v_display_period,
    'source_period_label', v_source_period,
    'profit_label_period', v_display_period
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_teacher_wallet_transaction_display_period ON public.teacher_wallet_transactions;
CREATE TRIGGER trg_apply_teacher_wallet_transaction_display_period
BEFORE INSERT ON public.teacher_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.apply_teacher_wallet_transaction_display_period();

CREATE OR REPLACE FUNCTION public._notify_teacher_frozen_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_override text;
  v_year_override text;
  v_period_meta text;
  v_display_label text;
BEGIN
  IF NEW.transaction_type IS DISTINCT FROM 'frozen_release' THEN
    RETURN NEW;
  END IF;

  v_period_meta := COALESCE(
    NEW.metadata->>'display_period_label',
    NEW.metadata->>'period_label',
    NULL
  );

  IF v_period_meta IS NOT NULL AND v_period_meta ~ '^\d{4}-\d{2}$' THEN
    v_display_label := split_part(v_period_meta, '-', 2) || '-' || split_part(v_period_meta, '-', 1);
  ELSE
    SELECT value INTO v_month_override FROM public.platform_settings WHERE key = 'withdrawal_notification_month';
    SELECT value INTO v_year_override  FROM public.platform_settings WHERE key = 'withdrawal_notification_year';

    IF v_month_override IS NOT NULL AND v_month_override <> ''
       AND v_year_override IS NOT NULL AND v_year_override <> '' THEN
      v_display_label := lpad(v_month_override, 2, '0') || '-' || v_year_override;
    ELSE
      v_period_meta := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
      v_display_label := split_part(v_period_meta, '-', 2) || '-' || split_part(v_period_meta, '-', 1);
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (
      NEW.teacher_id,
      '✅ تم فتح السحب لشهر ' || v_display_label,
      'تم نقل أرباح شهر ' || v_display_label || ' إلى الرصيد المتاح للسحب: ' || NEW.amount::text || ' جنيه، وتم حفظ نسخة أرشيفية كاملة للمحفظة.',
      'wallet',
      '/teacher/wallet',
      false,
      true
    );
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_teacher_frozen_release ON public.teacher_wallet_transactions;
CREATE TRIGGER trg_notify_teacher_frozen_release
AFTER INSERT ON public.teacher_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public._notify_teacher_frozen_release();

CREATE OR REPLACE FUNCTION public.archive_all_teachers_period()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_count int := 0;
  v_total_moved numeric := 0;
  v_processed int := 0;
  v_skipped int := 0;
  r record;
  v_result jsonb;
  v_got_lock boolean;
  v_results jsonb := '[]'::jsonb;
  v_moved numeric := 0;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  v_got_lock := pg_try_advisory_xact_lock(hashtext('financial_monthly_closing'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('success', false, 'error', 'عملية إقفال أخرى قيد التنفيذ الآن، حاول بعد لحظات');
  END IF;

  FOR r IN
    SELECT teacher_id
    FROM public.teacher_wallets
    WHERE COALESCE(frozen_balance, 0) > 0
       OR EXISTS (
         SELECT 1
         FROM public.teacher_earning_records ter
         WHERE ter.teacher_id = teacher_wallets.teacher_id
           AND ter.period_label = teacher_wallets.current_period
           AND ter.is_archived = false
           AND NOT public.is_test_student(ter.student_id)
       )
    ORDER BY teacher_id
  LOOP
    v_processed := v_processed + 1;
    v_result := public.archive_teacher_period(r.teacher_id);
    v_results := v_results || jsonb_build_array(jsonb_build_object('teacher_id', r.teacher_id, 'result', v_result));

    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_moved := COALESCE((v_result->>'total')::numeric, (v_result->>'released')::numeric, 0);
      IF v_moved > 0 THEN
        v_count := v_count + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      v_total_moved := v_total_moved + v_moved;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES ('withdrawal_last_release_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF v_caller IS NOT NULL THEN
    INSERT INTO public.financial_audit_logs (actor_id, action, amount, new_value, reason)
    VALUES (v_caller, 'monthly_closing_run', v_total_moved,
      jsonb_build_object('archived_count', v_count, 'processed_count', v_processed, 'skipped_count', v_skipped, 'total_moved', v_total_moved, 'teacher_results', v_results),
      'Monthly closing executed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', v_count,
    'processed_count', v_processed,
    'skipped_count', v_skipped,
    'total_moved', v_total_moved,
    'teacher_results', v_results,
    'ran_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_all_teachers_period() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_all_teachers_period() TO authenticated, service_role;

DO $$
DECLARE
  v_day int;
  v_hour int;
  v_minute int;
  v_cairo_now timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_next_ts timestamp;
  v_next_key text;
BEGIN
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

  v_next_key := to_char(v_next_ts, 'YYYY-MM-DD HH24:MI');

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', v_next_key, now()),
    ('withdrawal_schedule_month', EXTRACT(MONTH FROM v_next_ts)::int::text, now()),
    ('withdrawal_schedule_year', EXTRACT(YEAR FROM v_next_ts)::int::text, now()),
    ('withdrawal_release_mode', 'scheduled', now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  DELETE FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_schedule_key'
    AND value = v_next_key;
END $$;