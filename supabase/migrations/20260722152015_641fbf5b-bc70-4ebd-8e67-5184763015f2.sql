CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_schedule(
  _day integer,
  _hour integer,
  _minute integer,
  _manual_state text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
  v_day integer := LEAST(GREATEST(COALESCE(_day, 25), 1), 28);
  v_hour integer := LEAST(GREATEST(COALESCE(_hour, 9), 0), 23);
  v_minute integer := LEAST(GREATEST(COALESCE(_minute, 0), 0), 59);
  v_state text := CASE WHEN COALESCE(_manual_state, 'auto') = 'closed' THEN 'closed' ELSE 'auto' END;
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
    ('withdrawal_schedule_saved_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

  INSERT INTO public.financial_audit_logs (actor_id, action, new_value, reason, metadata)
  VALUES (
    v_caller,
    'withdrawal_schedule_saved',
    jsonb_build_object(
      'day', v_day,
      'hour', v_hour,
      'minute', v_minute,
      'manual_state', v_state,
      'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_release_key', v_next_key
    ),
    'Withdrawal closing schedule saved by admin',
    jsonb_build_object('source', 'admin_set_withdrawal_schedule')
  );

  RETURN jsonb_build_object(
    'success', true,
    'day', v_day,
    'hour', v_hour,
    'minute', v_minute,
    'manual_state', v_state,
    'next_release_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_release_key', v_next_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_schedule(integer, integer, integer, text) TO service_role;

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
  v_gross_from_records numeric := 0;
  v_release_amount numeric := 0;
  v_subs int := 0;
  v_groups int := 0;
  v_rate numeric := 0.70;
  v_breakdown jsonb := '[]'::jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_archive_id uuid;
  v_balance_after numeric := 0;
  v_frozen_before numeric := 0;
  v_available_before numeric := 0;
BEGIN
  IF v_caller IS NOT NULL AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  VALUES (_teacher_id, 0, 0, 0, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM'))
  ON CONFLICT (teacher_id) DO NOTHING;

  SELECT
    COALESCE(NULLIF(current_period, ''), to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')),
    COALESCE(frozen_balance, 0),
    COALESCE(balance, 0),
    COALESCE(frozen_balance, 0)
  INTO v_period, v_release_amount, v_available_before, v_frozen_before
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
    COALESCE(SUM(gross_amount), 0),
    COUNT(DISTINCT student_id),
    COUNT(DISTINCT group_id),
    COALESCE(AVG(commission_rate), 0.70)
  INTO v_total_from_records, v_gross_from_records, v_subs, v_groups, v_rate
  FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false
    AND NOT public.is_test_student(student_id);

  v_release_amount := GREATEST(COALESCE(v_release_amount, 0), COALESCE(v_total_from_records, 0));

  SELECT COALESCE(jsonb_agg(group_payload ORDER BY (group_payload->>'net')::numeric DESC), '[]'::jsonb)
  INTO v_breakdown
  FROM (
    SELECT jsonb_build_object(
      'group_id', g.group_id,
      'group_title', COALESCE(g.group_title, 'مجموعة'),
      'price', g.price,
      'subject_id', g.subject_id,
      'subject_name', g.subject_name,
      'stage', g.stage,
      'grade', g.grade,
      'category', g.category,
      'section_name', g.section_name,
      'education_type', g.education_type,
      'students', g.students_count,
      'students_count', g.students_count,
      'subscriptions', g.subscriptions_count,
      'gross', g.gross,
      'net', g.net,
      'platform_cut', GREATEST(g.gross - g.net, 0),
      'commission_rate', g.commission_rate,
      'calculation', jsonb_build_object(
        'price', g.price,
        'students', g.students_count,
        'commission_rate', g.commission_rate,
        'teacher_net', g.net,
        'platform_cut', GREATEST(g.gross - g.net, 0)
      ),
      'student_details', COALESCE((
        SELECT jsonb_agg(to_jsonb(sd) ORDER BY sd.student_name, sd.student_code)
        FROM (
          SELECT
            ter2.student_id,
            COALESCE(NULLIF(p.full_name, ''), 'طالب') AS student_name,
            p.student_code,
            p.stage AS student_stage,
            p.grade AS student_grade,
            p.section AS student_section,
            p.education_type AS student_education_type,
            COUNT(DISTINCT ter2.purchase_id) AS subscriptions,
            SUM(ter2.gross_amount) AS gross,
            SUM(ter2.net_amount) AS net,
            MIN(ter2.created_at) AS first_purchase_at,
            MAX(ter2.created_at) AS last_purchase_at
          FROM public.teacher_earning_records ter2
          LEFT JOIN public.profiles p ON p.id = ter2.student_id
          WHERE ter2.teacher_id = _teacher_id
            AND ter2.period_label = v_period
            AND ter2.is_archived = false
            AND ter2.group_id = g.group_id
            AND NOT public.is_test_student(ter2.student_id)
          GROUP BY ter2.student_id, p.full_name, p.student_code, p.stage, p.grade, p.section, p.education_type
        ) sd
      ), '[]'::jsonb)
    ) AS group_payload
    FROM (
      SELECT
        ter.group_id,
        cg.title AS group_title,
        COALESCE(cg.price, MAX(ter.gross_amount)) AS price,
        COALESCE(cg.subject_id, ter.subject_id) AS subject_id,
        s.name AS subject_name,
        s.stage,
        s.grade,
        s.category,
        cg.section_name,
        cg.education_type,
        COUNT(DISTINCT ter.student_id) AS students_count,
        COUNT(DISTINCT ter.purchase_id) AS subscriptions_count,
        SUM(ter.gross_amount) AS gross,
        SUM(ter.net_amount) AS net,
        COALESCE(AVG(ter.commission_rate), v_rate) AS commission_rate
      FROM public.teacher_earning_records ter
      LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
      LEFT JOIN public.subjects s ON s.id = COALESCE(ter.subject_id, cg.subject_id)
      WHERE ter.teacher_id = _teacher_id
        AND ter.period_label = v_period
        AND ter.is_archived = false
        AND NOT public.is_test_student(ter.student_id)
      GROUP BY ter.group_id, cg.title, cg.price, cg.subject_id, ter.subject_id, s.name, s.stage, s.grade, s.category, cg.section_name, cg.education_type
    ) g
  ) payloads;

  IF v_release_amount <= 0 THEN
    UPDATE public.teacher_wallets
       SET current_period = CASE WHEN current_period = v_period THEN v_next_period ELSE current_period END,
           updated_at = now()
     WHERE teacher_id = _teacher_id;

    RETURN jsonb_build_object(
      'success', true,
      'period', v_period,
      'next_period', v_next_period,
      'total', 0,
      'record_total', v_total_from_records,
      'subscribers', v_subs,
      'groups', v_groups,
      'skipped', 'no_frozen_balance'
    );
  END IF;

  INSERT INTO public.teacher_monthly_archives
    (teacher_id, period_label, period_start, period_end,
     total_earned, total_subscribers, total_groups, commission_rate, breakdown, archived_at)
  VALUES
    (_teacher_id, v_period, v_period_start, v_period_end,
     v_release_amount, v_subs, v_groups, v_rate, v_breakdown, now())
  ON CONFLICT (teacher_id, period_label) DO UPDATE
  SET total_earned = public.teacher_monthly_archives.total_earned + EXCLUDED.total_earned,
      total_subscribers = GREATEST(public.teacher_monthly_archives.total_subscribers, EXCLUDED.total_subscribers),
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
     'إقفال شهري: نقل أرباح ' || v_period || ' من الرصيد المجمّد إلى المتاح للسحب مع حفظ سجل تفصيلي كامل',
     v_balance_after,
     jsonb_build_object(
       'archive_id', v_archive_id,
       'period_label', v_period,
       'next_period', v_next_period,
       'source', 'monthly_closing',
       'release_id', gen_random_uuid(),
       'available_before', v_available_before,
       'frozen_before', v_frozen_before,
       'released_amount', v_release_amount,
       'gross_from_records', v_gross_from_records,
       'record_total', v_total_from_records,
       'groups', v_groups,
       'students', v_subs,
       'breakdown', v_breakdown
     ),
     now());

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    _teacher_id,
    '✅ تم فتح السحب لشهر ' || v_period,
    'تم نقل أرباح الشهر إلى الرصيد المتاح للسحب: ' || v_release_amount || ' جنيه، وتم حفظ سجل المحفظة التفصيلي.',
    'wallet', '/teacher/wallet', false, true
  );

  RETURN jsonb_build_object(
    'success', true,
    'period', v_period,
    'next_period', v_next_period,
    'archive_id', v_archive_id,
    'total', v_release_amount,
    'record_total', v_total_from_records,
    'gross_total', v_gross_from_records,
    'subscribers', v_subs,
    'groups', v_groups,
    'balance_after', v_balance_after,
    'breakdown_groups', jsonb_array_length(v_breakdown)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO service_role;

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
  v_skipped int := 0;
  r record;
  v_result jsonb;
  v_got_lock boolean;
  v_results jsonb := '[]'::jsonb;
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
      IF COALESCE((v_result->>'total')::numeric, 0) > 0 THEN
        v_count := v_count + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      v_total_moved := v_total_moved + COALESCE((v_result->>'total')::numeric, 0);
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
$$;

GRANT EXECUTE ON FUNCTION public.archive_all_teachers_period() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_all_teachers_period() TO service_role;

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
  v_due_ts timestamp;
  v_next_ts timestamp;
  v_due_key text;
  v_last_schedule_key text;
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

  IF COALESCE(NULLIF(v_mode, ''), 'scheduled') NOT IN ('scheduled', 'auto') THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'release_mode_not_scheduled',
      'mode', v_mode,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
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

  SELECT NULLIF(value, '')::timestamp
  INTO v_due_ts
  FROM public.platform_settings
  WHERE key = 'withdrawal_next_release_at_cairo'
    AND value IS NOT NULL
    AND value <> '';

  IF v_due_ts IS NULL THEN
    v_due_ts := make_timestamp(
      EXTRACT(YEAR FROM v_cairo_ts)::int,
      EXTRACT(MONTH FROM v_cairo_ts)::int,
      v_day,
      v_hour,
      v_minute,
      0
    );
  END IF;

  v_due_key := to_char(v_due_ts, 'YYYY-MM-DD HH24:MI');

  SELECT value INTO v_last_schedule_key
  FROM public.platform_settings
  WHERE key = 'withdrawal_last_auto_release_schedule_key';

  IF v_cairo_ts < v_due_ts THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'not_due_yet',
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'schedule_key', v_due_key
    );
  END IF;

  IF COALESCE(v_last_schedule_key, '') = v_due_key THEN
    v_next_ts := (v_due_ts + interval '1 month')::timestamp;

    INSERT INTO public.platform_settings (key, value, updated_at)
    VALUES
      ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
      ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    RETURN jsonb_build_object(
      'success', true,
      'skipped', 'already_ran_this_exact_schedule',
      'schedule_key', v_due_key,
      'now_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS')
    );
  END IF;

  v_result := public.archive_all_teachers_period();
  v_next_ts := (v_due_ts + interval '1 month')::timestamp;

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_last_auto_release_period', to_char(v_due_ts, 'YYYY-MM'), now()),
    ('withdrawal_last_auto_release_schedule_key', v_due_key, now()),
    ('withdrawal_last_auto_release_at', now()::text, now()),
    ('withdrawal_last_auto_release_result', v_result::text, now()),
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_manual_state', 'auto', now()),
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.financial_audit_logs (actor_id, action, amount, new_value, reason, metadata)
  VALUES (
    NULL,
    'scheduled_monthly_closing_run',
    COALESCE((v_result->>'total_moved')::numeric, 0),
    v_result,
    'Scheduled monthly closing executed by backend cron',
    jsonb_build_object(
      'schedule_key', v_due_key,
      'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
      'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'executed', true,
    'schedule_key', v_due_key,
    'scheduled_cairo', to_char(v_due_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'executed_cairo', to_char(v_cairo_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'next_scheduled_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'),
    'result', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_scheduled_withdrawal_release() TO authenticated;

DO $$
DECLARE
  v_day int;
  v_hour int;
  v_minute int;
  v_cairo_now timestamp := now() AT TIME ZONE 'Africa/Cairo';
  v_next_ts timestamp;
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

  v_next_ts := make_timestamp(EXTRACT(YEAR FROM v_cairo_now)::int, EXTRACT(MONTH FROM v_cairo_now)::int, v_day, v_hour, v_minute, 0);
  IF v_next_ts <= v_cairo_now THEN
    v_next_ts := (v_next_ts + interval '1 month')::timestamp;
  END IF;

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES
    ('withdrawal_release_mode', 'scheduled', now()),
    ('withdrawal_manual_state', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_manual_state'), 'auto'), now()),
    ('withdrawal_next_release_at_cairo', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI:SS'), now()),
    ('withdrawal_next_release_key', to_char(v_next_ts, 'YYYY-MM-DD HH24:MI'), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END $$;

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