
-- 1) Extend snapshots table
ALTER TABLE public.admin_overview_snapshots
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS period_start timestamptz,
  ADD COLUMN IF NOT EXISTS period_end timestamptz,
  ADD COLUMN IF NOT EXISTS is_closing boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_admin_overview_snapshots_kind
  ON public.admin_overview_snapshots(kind, created_at DESC);

-- 2) Seed the financial period start setting (idempotent)
INSERT INTO public.platform_settings (key, value)
VALUES ('financial_period_start_at', date_trunc('month', now() AT TIME ZONE 'Africa/Cairo')::text)
ON CONFLICT (key) DO NOTHING;

-- 3) Update admin_financial_overview to respect the period boundary
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
    'approved_total', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'approved_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
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
    'last_auto_release_key', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_last_auto_release_schedule_key')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 4) Rich snapshot builder (shared)
CREATE OR REPLACE FUNCTION public._admin_build_financial_snapshot(_period_start timestamptz, _period_end timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overview jsonb;
  v_teachers jsonb;
  v_groups jsonb;
  v_grades jsonb;
  v_subjects jsonb;
  v_txs jsonb;
  v_withdrawals jsonb;
BEGIN
  v_overview := public.admin_financial_overview();

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.net_amount DESC), '[]'::jsonb) INTO v_teachers FROM (
    SELECT ter.teacher_id,
           COALESCE(p.full_name, 'معلم') AS name,
           COALESCE(p.unique_id, '') AS unique_id,
           SUM(ter.gross_amount) AS gross_amount,
           SUM(ter.net_amount) AS net_amount,
           SUM(ter.gross_amount - ter.net_amount) AS platform_cut,
           COUNT(*) AS subscriptions,
           COUNT(DISTINCT ter.student_id) AS students,
           COUNT(DISTINCT ter.group_id) AS groups,
           COALESCE((SELECT balance FROM public.teacher_wallets WHERE teacher_id = ter.teacher_id), 0) AS wallet_balance,
           COALESCE((SELECT frozen_balance FROM public.teacher_wallets WHERE teacher_id = ter.teacher_id), 0) AS wallet_frozen,
           COALESCE((SELECT total_earned FROM public.teacher_wallets WHERE teacher_id = ter.teacher_id), 0) AS wallet_total
    FROM public.teacher_earning_records ter
    LEFT JOIN public.profiles p ON p.id = ter.teacher_id
    WHERE ter.created_at >= _period_start AND ter.created_at < _period_end
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY ter.teacher_id, p.full_name, p.unique_id
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(g) ORDER BY g.net_amount DESC), '[]'::jsonb) INTO v_groups FROM (
    SELECT ter.group_id,
           COALESCE(cg.title, 'مجموعة') AS group_title,
           ter.teacher_id,
           COALESCE(p.full_name, 'معلم') AS teacher_name,
           SUM(ter.gross_amount) AS gross_amount,
           SUM(ter.net_amount) AS net_amount,
           COUNT(*) AS subscriptions,
           COUNT(DISTINCT ter.student_id) AS students
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    LEFT JOIN public.profiles p ON p.id = ter.teacher_id
    WHERE ter.created_at >= _period_start AND ter.created_at < _period_end
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY ter.group_id, cg.title, ter.teacher_id, p.full_name
  ) g;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.net_amount DESC), '[]'::jsonb) INTO v_grades FROM (
    SELECT COALESCE(cg.stage, 'غير محدد') AS stage,
           COALESCE(cg.grade, 'غير محدد') AS grade,
           SUM(ter.gross_amount) AS gross_amount,
           SUM(ter.net_amount) AS net_amount,
           COUNT(*) AS subscriptions,
           COUNT(DISTINCT ter.student_id) AS students,
           COUNT(DISTINCT ter.group_id) AS groups
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    WHERE ter.created_at >= _period_start AND ter.created_at < _period_end
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY cg.stage, cg.grade
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.net_amount DESC), '[]'::jsonb) INTO v_subjects FROM (
    SELECT COALESCE(cg.subject, 'غير محدد') AS subject,
           SUM(ter.gross_amount) AS gross_amount,
           SUM(ter.net_amount) AS net_amount,
           COUNT(*) AS subscriptions,
           COUNT(DISTINCT ter.student_id) AS students
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    WHERE ter.created_at >= _period_start AND ter.created_at < _period_end
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY cg.subject
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_txs FROM (
    SELECT twt.id, twt.teacher_id, COALESCE(p.full_name, 'معلم') AS teacher_name,
           twt.transaction_type, twt.amount, twt.balance_after,
           twt.description, twt.created_at
    FROM public.teacher_wallet_transactions twt
    LEFT JOIN public.profiles p ON p.id = twt.teacher_id
    WHERE twt.created_at >= _period_start AND twt.created_at < _period_end
    LIMIT 2000
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(w) ORDER BY w.created_at DESC), '[]'::jsonb) INTO v_withdrawals FROM (
    SELECT twr.id, twr.teacher_id, COALESCE(p.full_name, 'معلم') AS teacher_name,
           twr.amount, twr.status, twr.created_at, twr.processed_at
    FROM public.teacher_withdrawal_requests twr
    LEFT JOIN public.profiles p ON p.id = twr.teacher_id
    WHERE twr.created_at >= _period_start AND twr.created_at < _period_end
  ) w;

  RETURN v_overview
    || jsonb_build_object(
      'period_start', _period_start,
      'period_end', _period_end,
      'breakdown_teachers', v_teachers,
      'breakdown_groups', v_groups,
      'breakdown_grades', v_grades,
      'breakdown_subjects', v_subjects,
      'period_transactions', v_txs,
      'period_withdrawals', v_withdrawals
    );
END;
$function$;

REVOKE ALL ON FUNCTION public._admin_build_financial_snapshot(timestamptz, timestamptz) FROM PUBLIC;

-- 5) Preview (no writes)
CREATE OR REPLACE FUNCTION public.admin_financial_close_preview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period_start timestamptz;
  v_period_start_text text;
  v_cal_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Cairo');
  v_snapshot jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT value INTO v_period_start_text FROM public.platform_settings WHERE key = 'financial_period_start_at';
  BEGIN v_period_start := COALESCE(v_period_start_text::timestamptz, v_cal_month_start);
  EXCEPTION WHEN others THEN v_period_start := v_cal_month_start; END;

  v_snapshot := public._admin_build_financial_snapshot(v_period_start, now());
  RETURN jsonb_build_object('success', true, 'snapshot', v_snapshot);
END;
$function$;

-- 6) Close the month: capture full snapshot then reset period
CREATE OR REPLACE FUNCTION public.admin_close_financial_month(_notes text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period_start timestamptz;
  v_period_start_text text;
  v_cal_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Cairo');
  v_end timestamptz := now();
  v_snapshot jsonb;
  v_id uuid;
  v_period_label text;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT value INTO v_period_start_text FROM public.platform_settings WHERE key = 'financial_period_start_at';
  BEGIN v_period_start := COALESCE(v_period_start_text::timestamptz, v_cal_month_start);
  EXCEPTION WHEN others THEN v_period_start := v_cal_month_start; END;

  -- Build the immutable, complete snapshot BEFORE any state change.
  v_snapshot := public._admin_build_financial_snapshot(v_period_start, v_end);
  v_period_label := to_char(v_period_start AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')
                    || ' → ' ||
                    to_char(v_end AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD');

  INSERT INTO public.admin_overview_snapshots (
    period_label, snapshot, notes, created_by,
    kind, period_start, period_end, is_closing
  ) VALUES (
    v_period_label, v_snapshot, _notes, v_caller,
    'closing', v_period_start, v_end, true
  ) RETURNING id INTO v_id;

  -- Only after a successful snapshot: advance the fiscal period marker.
  INSERT INTO public.platform_settings (key, value)
  VALUES ('financial_period_start_at', v_end::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO public.platform_settings (key, value)
  VALUES ('financial_last_close_at', v_end::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'period_label', v_period_label,
    'period_start', v_period_start,
    'period_end', v_end
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 7) Fetch a closing snapshot in full
CREATE OR REPLACE FUNCTION public.admin_get_financial_close(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_row public.admin_overview_snapshots;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT * INTO v_row FROM public.admin_overview_snapshots WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير موجود');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'kind', v_row.kind,
    'is_closing', v_row.is_closing,
    'period_label', v_row.period_label,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end,
    'created_at', v_row.created_at,
    'notes', v_row.notes,
    'snapshot', v_row.snapshot
  );
END;
$function$;

-- 8) Update list RPC to include closing metadata (kept backward compatible)
CREATE OR REPLACE FUNCTION public.admin_list_overview_snapshots()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, period_label, created_at, notes,
           COALESCE(kind, 'manual') AS kind,
           COALESCE(is_closing, false) AS is_closing,
           period_start, period_end,
           COALESCE((snapshot->>'total_available')::numeric, 0) AS total_available,
           COALESCE((snapshot->>'total_frozen')::numeric, 0) AS total_frozen,
           COALESCE((snapshot->>'month_gross')::numeric, 0) AS month_gross,
           COALESCE((snapshot->>'month_teacher_net')::numeric, 0) AS month_teacher_net,
           COALESCE((snapshot->>'month_platform_cut')::numeric, 0) AS month_platform_cut,
           COALESCE((snapshot->>'month_subscriptions')::int, 0) AS month_subscriptions,
           COALESCE((snapshot->>'month_paying_students')::int, 0) AS month_paying_students,
           COALESCE((snapshot->>'active_groups')::int, 0) AS active_groups
    FROM public.admin_overview_snapshots
  ) t;

  RETURN jsonb_build_object('success', true, 'rows', v_rows);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_financial_close_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_financial_month(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_financial_close(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_overview_snapshots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_financial_overview() TO authenticated;
