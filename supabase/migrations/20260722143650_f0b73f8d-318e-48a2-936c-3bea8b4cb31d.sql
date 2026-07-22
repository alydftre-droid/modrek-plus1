-- Restore reliable automatic monthly closing for teacher withdrawals.
-- Root cause fixed: the previous migration disabled pg_cron and replaced
-- process_scheduled_withdrawal_release() with a no-op, so scheduled releases
-- could never move frozen balances or archive teacher monthly records.

CREATE OR REPLACE FUNCTION public.archive_teacher_period(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_period text;
  v_next_period text;
  v_total_from_records numeric := 0;
  v_release_amount numeric := 0;
  v_subs int := 0;
  v_groups int := 0;
  v_rate numeric := 0.70;
  v_breakdown jsonb := '[]'::jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_archive_id uuid;
  v_balance_after numeric := 0;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (_teacher_id, 0, 0, 0, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM'))
  ON CONFLICT (teacher_id) DO NOTHING;

  SELECT
    COALESCE(NULLIF(current_period, ''), to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')),
    COALESCE(frozen_balance, 0)
  INTO v_period, v_release_amount
  FROM public.teacher_wallets
  WHERE teacher_id = _teacher_id
  FOR UPDATE;

  IF v_period IS NULL THEN
    v_period := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
  END IF;

  v_next_period := to_char((to_date(v_period || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')::date, 'YYYY-MM');
  v_period_start := (to_date(v_period || '-01', 'YYYY-MM-DD')::timestamp AT TIME ZONE 'Africa/Cairo');
  v_period_end := v_period_start + INTERVAL '1 month';

  SELECT
    COALESCE(SUM(net_amount), 0),
    COUNT(DISTINCT student_id),
    COUNT(DISTINCT group_id),
    COALESCE(AVG(commission_rate), 0.70)
  INTO v_total_from_records, v_subs, v_groups, v_rate
  FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false
    AND NOT public.is_test_student(student_id);

  -- The wallet frozen balance is the financial source of truth after cleanup.
  -- If records exist but frozen balance is stale/zero, still archive the records' net amount.
  v_release_amount := GREATEST(COALESCE(v_release_amount, 0), COALESCE(v_total_from_records, 0));

  IF v_release_amount <= 0 THEN
    UPDATE public.teacher_wallets
       SET current_period = CASE WHEN current_period = v_period THEN v_next_period ELSE current_period END,
           updated_at = now()
     WHERE teacher_id = _teacher_id;

    RETURN jsonb_build_object('success', true, 'period', v_period, 'next_period', v_next_period, 'total', 0, 'subscribers', v_subs, 'skipped', 'no_frozen_balance');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.net DESC), '[]'::jsonb) INTO v_breakdown
  FROM (
    SELECT
      ter.group_id,
      cg.title AS group_title,
      cg.price AS price,
      cg.subject_id,
      s.name AS subject_name,
      s.stage,
      s.grade,
      s.category,
      COUNT(DISTINCT ter.student_id) AS students,
      SUM(ter.gross_amount) AS gross,
      SUM(ter.net_amount) AS net
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    LEFT JOIN public.subjects s ON s.id = ter.subject_id
    WHERE ter.teacher_id = _teacher_id
      AND ter.period_label = v_period
      AND ter.is_archived = false
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY ter.group_id, cg.title, cg.price, cg.subject_id, s.name, s.stage, s.grade, s.category
  ) g;

  INSERT INTO public.teacher_monthly_archives
    (teacher_id, period_label, period_start, period_end,
     total_earned, total_subscribers, total_groups, commission_rate, breakdown, archived_at)
  VALUES
    (_teacher_id, v_period, v_period_start, v_period_end,
     v_release_amount, v_subs, v_groups, v_rate, v_breakdown, now())
  ON CONFLICT (teacher_id, period_label) DO UPDATE
  SET total_earned = public.teacher_monthly_archives.total_earned + EXCLUDED.total_earned,
      total_subscribers = public.teacher_monthly_archives.total_subscribers + EXCLUDED.total_subscribers,
      total_groups = GREATEST(public.teacher_monthly_archives.total_groups, EXCLUDED.total_groups),
      commission_rate = EXCLUDED.commission_rate,
      breakdown = EXCLUDED.breakdown,
      archived_at = now()
  RETURNING id INTO v_archive_id;

  UPDATE public.teacher_earning_records
    SET is_frozen = false, is_archived = true
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false
    AND NOT public.is_test_student(student_id);

  UPDATE public.teacher_wallets
    SET balance = balance + v_release_amount,
        frozen_balance = GREATEST(0, frozen_balance - v_release_amount),
        current_period = v_next_period,
        updated_at = now()
  WHERE teacher_id = _teacher_id
  RETURNING balance INTO v_balance_after;

  INSERT INTO public.teacher_wallet_transactions
    (teacher_id, amount, transaction_type, description, balance_after, metadata, created_at)
  VALUES
    (_teacher_id,
     v_release_amount,
     'frozen_release',
     'إقفال شهري: نقل أرباح ' || v_period || ' من الرصيد المجمّد إلى المتاح للسحب',
     v_balance_after,
     jsonb_build_object(
       'archive_id', v_archive_id,
       'period_label', v_period,
       'next_period', v_next_period,
       'source', 'monthly_closing',
       'release_id', gen_random_uuid()
     ),
     now());

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    _teacher_id,
    '✅ تم فتح السحب لشهر ' || v_period,
    'تم نقل أرباح الشهر إلى الرصيد المتاح للسحب: ' || v_release_amount || ' جنيه',
    'wallet', '/teacher/wallet', false, true
  );

  RETURN jsonb_build_object(
    'success', true,
    'period', v_period,
    'next_period', v_next_period,
    'archive_id', v_archive_id,
    'total', v_release_amount,
    'record_total', v_total_from_records,
    'subscribers', v_subs,
    'groups', v_groups,
    'balance_after', v_balance_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_all_teachers_period()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count int := 0;
  v_total_moved numeric := 0;
  v_processed int := 0;
  r record;
  v_result jsonb;
  v_got_lock boolean;
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
    IF COALESCE((v_result->>'success')::boolean, false) THEN
      IF COALESCE((v_result->>'total')::numeric, 0) > 0 THEN
        v_count := v_count + 1;
      END IF;
      v_total_moved := v_total_moved + COALESCE((v_result->>'total')::numeric, 0);
    END IF;
  END LOOP;

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES ('withdrawal_last_release_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  IF v_caller IS NOT NULL THEN
    INSERT INTO public.financial_audit_logs (actor_id, action, amount, new_value, reason)
    VALUES (v_caller, 'monthly_closing_run', v_total_moved,
      jsonb_build_object('archived_count', v_count, 'processed_count', v_processed, 'total_moved', v_total_moved),
      'Monthly closing executed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', v_count,
    'processed_count', v_processed,
    'total_moved', v_total_moved,
    'ran_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_scheduled_withdrawal_release()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state text;
  v_day int;
  v_hour int;
  v_minute int;
  v_cairo_ts timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_scheduled_ts timestamp;
  v_run_period text;
  v_last_auto_period text;
  v_result jsonb;
BEGIN
  SELECT value INTO v_state FROM public.platform_settings WHERE key = 'withdrawal_manual_state';
  IF COALESCE(v_state, 'auto') = 'closed' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'manual_closed', 'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'));
  END IF;

  SELECT COALESCE((SELECT value::int FROM public.platform_settings WHERE key = 'withdrawal_open_day'), 25) INTO v_day;
  SELECT COALESCE((SELECT value::int FROM public.platform_settings WHERE key = 'withdrawal_open_hour'), 9) INTO v_hour;
  SELECT COALESCE((SELECT value::int FROM public.platform_settings WHERE key = 'withdrawal_open_minute'), 0) INTO v_minute;

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
  v_run_period := to_char(v_scheduled_ts, 'YYYY-MM');

  -- Robust scheduling: if the cron worker is delayed by seconds/minutes/hours,
  -- execute on the first check after the configured Cairo time instead of requiring
  -- an exact minute match.
  IF v_cairo_ts < v_scheduled_ts THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'not_due_yet',
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'scheduled_cairo', to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  SELECT value INTO v_last_auto_period
  FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_period';

  IF COALESCE(v_last_auto_period, '') = v_run_period THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'already_auto_ran_this_period',
      'period', v_run_period,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  v_result := public.archive_all_teachers_period();

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_last_auto_release_period', v_run_period, now()),
    ('withdrawal_last_auto_release_at', now()::text, now()),
    ('withdrawal_release_mode', 'scheduled', now())
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
      'scheduled_cairo', to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'executed', true,
    'period', v_run_period,
    'scheduled_cairo', to_char(v_scheduled_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'result', v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_teacher_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_teacher_id uuid;
  v_subject_id uuid;
  v_amount numeric;
  v_commission_rate numeric;
  v_commission numeric;
  v_period text;
  v_inserted_id uuid;
BEGIN
  SELECT COALESCE(teacher_id, created_by), subject_id INTO v_teacher_id, v_subject_id
  FROM public.content_groups WHERE id = NEW.group_id;

  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_credit_trigger_test_student',
      'teacher_earning_records',
      v_teacher_id,
      NEW.student_id,
      NEW.id,
      jsonb_build_object('group_id', NEW.group_id, 'amount_paid', NEW.amount_paid)
    );
    RETURN NEW;
  END IF;

  IF v_teacher_id IS NULL THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount_paid, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  v_commission_rate := public.get_effective_teacher_commission(v_teacher_id);
  v_commission := ROUND(v_amount * v_commission_rate, 2);

  -- New earnings belong to the teacher wallet's active financial period.
  -- This is what makes the counters restart after monthly closing even when
  -- the closing day is not the last calendar day of the month.
  SELECT NULLIF(current_period, '') INTO v_period
  FROM public.teacher_wallets
  WHERE teacher_id = v_teacher_id;

  IF v_period IS NULL THEN
    v_period := to_char(COALESCE(NEW.purchased_at, now()) AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
  END IF;

  INSERT INTO public.teacher_earning_records
    (teacher_id, purchase_id, group_id, subject_id, student_id,
     gross_amount, commission_rate, net_amount, period_label, is_frozen, is_archived)
  VALUES
    (v_teacher_id, NEW.id, NEW.group_id, v_subject_id, NEW.student_id,
     v_amount, v_commission_rate, v_commission, v_period, true, false)
  ON CONFLICT (purchase_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (v_teacher_id, 0, v_commission, v_commission, v_period)
  ON CONFLICT (teacher_id) DO UPDATE
  SET frozen_balance = teacher_wallets.frozen_balance + v_commission,
      total_earned = teacher_wallets.total_earned + v_commission,
      updated_at = now();

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_all_teachers_period() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO service_role;

-- Ensure the background checker exists and runs every minute.
-- The function itself decides if the configured Cairo date/time is due.
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

INSERT INTO public.platform_settings (key, value, updated_at)
VALUES ('withdrawal_release_mode', 'scheduled', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();