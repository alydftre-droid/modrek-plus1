-- Financial control center RPC repair + schema cache refresh
-- Root cause addressed: PostgREST/API schema cache did not know the newly-created RPCs,
-- so the client received "Could not find the function ... in the schema cache".

CREATE OR REPLACE FUNCTION public.admin_financial_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period text := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM');
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'Africa/Cairo');
  v_result jsonb;
  v_top_teacher jsonb := '{}'::jsonb;
  v_revenue_series jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  -- Ensure every real teacher has a wallet row before calculating KPIs.
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
    WHERE ter.period_label = v_period
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
    'total_available', COALESCE((SELECT SUM(balance) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false), 0),
    'total_frozen', COALESCE((SELECT SUM(frozen_balance) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false), 0),
    'total_teachers', COALESCE((SELECT COUNT(*) FROM public.user_roles ur LEFT JOIN public.profiles p ON p.id = ur.user_id WHERE ur.role = 'teacher'::public.app_role AND COALESCE(p.is_test_account, false) = false), 0),
    'teachers_with_frozen', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false AND tw.frozen_balance > 0), 0),
    'teachers_with_available', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false AND tw.balance > 0), 0),
    'total_earned_all_time', COALESCE((SELECT SUM(total_earned) FROM public.teacher_wallets tw JOIN public.user_roles ur ON ur.user_id = tw.teacher_id AND ur.role = 'teacher'::public.app_role LEFT JOIN public.profiles p ON p.id = tw.teacher_id WHERE COALESCE(p.is_test_account, false) = false), 0),
    'month_gross', COALESCE((SELECT SUM(gross_amount) FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id)), 0),
    'month_teacher_net', COALESCE((SELECT SUM(net_amount) FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id)), 0),
    'month_platform_cut', COALESCE((SELECT SUM(gross_amount - net_amount) FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id)), 0),
    'month_paying_students', COALESCE((SELECT COUNT(DISTINCT student_id) FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id)), 0),
    'month_subscriptions', COALESCE((SELECT COUNT(*) FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id)), 0),
    'active_groups', COALESCE((SELECT COUNT(DISTINCT group_id) FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id)), 0),
    'pending_requests', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'pending_amount', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'approved_total', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'approved_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'rejected_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'rejected'), 0),
    'approved_this_month', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved' AND processed_at >= v_month_start), 0),
    'archives_this_month', COALESCE((SELECT COUNT(*) FROM public.teacher_monthly_archives WHERE archived_at >= v_month_start), 0),
    'avg_teacher_earnings_month', COALESCE((SELECT AVG(t.s) FROM (SELECT SUM(net_amount) AS s FROM public.teacher_earning_records WHERE period_label = v_period AND NOT public.is_test_student(student_id) GROUP BY teacher_id) t), 0),
    'top_teacher', COALESCE(v_top_teacher, '{}'::jsonb),
    'revenue_series', COALESCE(v_revenue_series, '[]'::jsonb),
    'last_release_at', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_last_release_at'),
    'manual_state', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_manual_state'), 'auto'),
    'open_day', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_day'), '25'),
    'open_hour', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_hour'), '9'),
    'open_minute', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_minute'), '0')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_teacher_wallets(
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
  v_total int := 0;
  v_q text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_limit int := LEAST(GREATEST(COALESCE(_limit, 100), 1), 250);
  v_offset int := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, frozen_balance, total_earned, current_period)
  SELECT ur.user_id, 0, 0, 0, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')
  FROM public.user_roles ur
  LEFT JOIN public.teacher_wallets tw ON tw.teacher_id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'teacher'::public.app_role
    AND tw.teacher_id IS NULL
    AND COALESCE(p.is_test_account, false) = false
  ON CONFLICT (teacher_id) DO NOTHING;

  WITH base AS (
    SELECT ur.user_id AS teacher_id,
           COALESCE(NULLIF(p.full_name, ''), 'معلم') AS name,
           p.email,
           p.phone,
           p.teacher_code,
           COALESCE(tw.balance, 0) AS balance,
           COALESCE(tw.frozen_balance, 0) AS frozen_balance,
           COALESCE(tw.total_earned, 0) AS total_earned,
           COALESCE(tw.current_period, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')) AS current_period,
           tw.updated_at,
           (SELECT COUNT(*) FROM public.teacher_withdrawal_requests wr WHERE wr.teacher_id = ur.user_id AND wr.status = 'pending') AS pending_requests
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    LEFT JOIN public.teacher_wallets tw ON tw.teacher_id = ur.user_id
    WHERE ur.role = 'teacher'::public.app_role
      AND COALESCE(p.is_test_account, false) = false
      AND (
        v_q IS NULL
        OR COALESCE(p.full_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.email, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.teacher_code, '') ILIKE '%' || v_q || '%'
        OR ur.user_id::text ILIKE '%' || v_q || '%'
      )
  )
  SELECT COUNT(*) INTO v_total FROM base;

  WITH base AS (
    SELECT ur.user_id AS teacher_id,
           COALESCE(NULLIF(p.full_name, ''), 'معلم') AS name,
           p.email,
           p.phone,
           p.teacher_code,
           COALESCE(tw.balance, 0) AS balance,
           COALESCE(tw.frozen_balance, 0) AS frozen_balance,
           COALESCE(tw.total_earned, 0) AS total_earned,
           COALESCE(tw.current_period, to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')) AS current_period,
           tw.updated_at,
           (SELECT COUNT(*) FROM public.teacher_withdrawal_requests wr WHERE wr.teacher_id = ur.user_id AND wr.status = 'pending') AS pending_requests
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    LEFT JOIN public.teacher_wallets tw ON tw.teacher_id = ur.user_id
    WHERE ur.role = 'teacher'::public.app_role
      AND COALESCE(p.is_test_account, false) = false
      AND (
        v_q IS NULL
        OR COALESCE(p.full_name, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.email, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || v_q || '%'
        OR COALESCE(p.teacher_code, '') ILIKE '%' || v_q || '%'
        OR ur.user_id::text ILIKE '%' || v_q || '%'
      )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.total_earned DESC NULLS LAST, x.balance DESC NULLS LAST, x.name), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT * FROM base
    ORDER BY total_earned DESC NULLS LAST, balance DESC NULLS LAST, name
    LIMIT v_limit OFFSET v_offset
  ) x;

  RETURN jsonb_build_object('success', true, 'total', COALESCE(v_total, 0), 'rows', COALESCE(v_rows, '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_financial_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_financial_overview() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_teacher_wallets(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_wallets(text, integer, integer) TO authenticated, service_role;

-- Explicitly refresh the API schema cache immediately after replacing the RPCs.
NOTIFY pgrst, 'reload schema';