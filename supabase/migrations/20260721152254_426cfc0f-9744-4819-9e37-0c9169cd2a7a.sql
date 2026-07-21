
-- 1) Audit log table
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_teacher_id uuid,
  amount numeric,
  old_value jsonb,
  new_value jsonb,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fal_created ON public.financial_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fal_teacher ON public.financial_audit_logs (target_teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fal_action ON public.financial_audit_logs (action);

GRANT SELECT, INSERT ON public.financial_audit_logs TO authenticated;
GRANT ALL ON public.financial_audit_logs TO service_role;

ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit logs" ON public.financial_audit_logs;
CREATE POLICY "Admins read audit logs" ON public.financial_audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.financial_audit_logs;
CREATE POLICY "Admins insert audit logs" ON public.financial_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2) Harden archive_all_teachers_period with advisory lock + audit log
CREATE OR REPLACE FUNCTION public.archive_all_teachers_period()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_count int := 0;
  v_total_moved numeric := 0;
  r record;
  v_got_lock boolean;
BEGIN
  IF v_caller IS NOT NULL AND NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  -- Prevent concurrent closings
  v_got_lock := pg_try_advisory_xact_lock(hashtext('financial_monthly_closing'));
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object('success', false, 'error', 'عملية إقفال أخرى قيد التنفيذ الآن، حاول بعد لحظات');
  END IF;

  FOR r IN
    SELECT teacher_id, frozen_balance
    FROM public.teacher_wallets
    WHERE frozen_balance > 0
    ORDER BY teacher_id
  LOOP
    PERFORM public.archive_teacher_period(r.teacher_id);
    v_count := v_count + 1;
    v_total_moved := v_total_moved + COALESCE(r.frozen_balance, 0);
  END LOOP;

  INSERT INTO public.platform_settings (key, value)
  VALUES ('withdrawal_last_release_at', now()::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  -- Audit
  IF v_caller IS NOT NULL THEN
    INSERT INTO public.financial_audit_logs (actor_id, action, amount, new_value, reason)
    VALUES (v_caller, 'monthly_closing_run', v_total_moved,
      jsonb_build_object('archived_count', v_count, 'total_moved', v_total_moved),
      'Manual monthly closing executed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', v_count,
    'total_moved', v_total_moved,
    'ran_at', now()
  );
END;
$function$;

-- 3) Platform overview
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
  v_top_teacher jsonb;
  v_revenue_series jsonb;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  -- Top teacher this month
  SELECT to_jsonb(t) INTO v_top_teacher FROM (
    SELECT ter.teacher_id,
           COALESCE(p.full_name, 'معلم') AS name,
           SUM(ter.net_amount) AS earnings
    FROM public.teacher_earning_records ter
    LEFT JOIN public.profiles p ON p.id = ter.teacher_id
    WHERE ter.period_label = v_period
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY ter.teacher_id, p.full_name
    ORDER BY SUM(ter.net_amount) DESC
    LIMIT 1
  ) t;

  -- Last 6 months revenue series
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.period), '[]'::jsonb) INTO v_revenue_series
  FROM (
    SELECT to_char(m, 'YYYY-MM') AS period,
           COALESCE(SUM(ter.gross_amount) FILTER (WHERE ter.period_label = to_char(m, 'YYYY-MM')), 0) AS gross,
           COALESCE(SUM(ter.net_amount)  FILTER (WHERE ter.period_label = to_char(m, 'YYYY-MM')), 0) AS teacher_net
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
    'total_available', COALESCE((SELECT SUM(balance) FROM public.teacher_wallets), 0),
    'total_frozen', COALESCE((SELECT SUM(frozen_balance) FROM public.teacher_wallets), 0),
    'total_teachers', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets), 0),
    'teachers_with_frozen', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets WHERE frozen_balance > 0), 0),
    'teachers_with_available', COALESCE((SELECT COUNT(*) FROM public.teacher_wallets WHERE balance > 0), 0),
    'total_earned_all_time', COALESCE((SELECT SUM(total_earned) FROM public.teacher_wallets), 0),
    'month_gross', COALESCE((
      SELECT SUM(gross_amount) FROM public.teacher_earning_records
      WHERE period_label = v_period AND NOT public.is_test_student(student_id)
    ), 0),
    'month_teacher_net', COALESCE((
      SELECT SUM(net_amount) FROM public.teacher_earning_records
      WHERE period_label = v_period AND NOT public.is_test_student(student_id)
    ), 0),
    'month_platform_cut', COALESCE((
      SELECT SUM(gross_amount - net_amount) FROM public.teacher_earning_records
      WHERE period_label = v_period AND NOT public.is_test_student(student_id)
    ), 0),
    'month_paying_students', COALESCE((
      SELECT COUNT(DISTINCT student_id) FROM public.teacher_earning_records
      WHERE period_label = v_period AND NOT public.is_test_student(student_id)
    ), 0),
    'month_subscriptions', COALESCE((
      SELECT COUNT(*) FROM public.teacher_earning_records
      WHERE period_label = v_period AND NOT public.is_test_student(student_id)
    ), 0),
    'active_groups', COALESCE((
      SELECT COUNT(DISTINCT group_id) FROM public.teacher_earning_records
      WHERE period_label = v_period AND NOT public.is_test_student(student_id)
    ), 0),
    'pending_requests', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'pending_amount', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'pending'), 0),
    'approved_total', COALESCE((SELECT SUM(amount) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'approved_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'approved'), 0),
    'rejected_count', COALESCE((SELECT COUNT(*) FROM public.teacher_withdrawal_requests WHERE status = 'rejected'), 0),
    'approved_this_month', COALESCE((
      SELECT SUM(amount) FROM public.teacher_withdrawal_requests
      WHERE status = 'approved' AND processed_at >= v_month_start
    ), 0),
    'archives_this_month', COALESCE((
      SELECT COUNT(*) FROM public.teacher_monthly_archives
      WHERE archived_at >= v_month_start
    ), 0),
    'avg_teacher_earnings_month', COALESCE((
      SELECT AVG(t.s) FROM (
        SELECT SUM(net_amount) AS s FROM public.teacher_earning_records
        WHERE period_label = v_period AND NOT public.is_test_student(student_id)
        GROUP BY teacher_id
      ) t
    ), 0),
    'top_teacher', COALESCE(v_top_teacher, '{}'::jsonb),
    'revenue_series', v_revenue_series,
    'last_release_at', (SELECT value FROM public.platform_settings WHERE key = 'withdrawal_last_release_at'),
    'manual_state', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_manual_state'), 'auto'),
    'open_day', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_day'), '25'),
    'open_hour', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_hour'), '9'),
    'open_minute', COALESCE((SELECT value FROM public.platform_settings WHERE key = 'withdrawal_open_minute'), '0')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 4) List teacher wallets (admin)
CREATE OR REPLACE FUNCTION public.admin_list_teacher_wallets(
  _search text DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
  v_total int;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.teacher_wallets tw
  LEFT JOIN public.profiles p ON p.id = tw.teacher_id
  WHERE _search IS NULL OR _search = '' OR p.full_name ILIKE '%'||_search||'%' OR p.email ILIKE '%'||_search||'%';

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total_earned DESC NULLS LAST), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT tw.teacher_id,
           COALESCE(p.full_name, 'معلم') AS name,
           p.email,
           tw.balance,
           tw.frozen_balance,
           tw.total_earned,
           tw.current_period,
           tw.updated_at,
           (SELECT COUNT(*) FROM public.teacher_withdrawal_requests wr WHERE wr.teacher_id = tw.teacher_id AND wr.status = 'pending') AS pending_requests
    FROM public.teacher_wallets tw
    LEFT JOIN public.profiles p ON p.id = tw.teacher_id
    WHERE _search IS NULL OR _search = '' OR p.full_name ILIKE '%'||_search||'%' OR p.email ILIKE '%'||_search||'%'
    ORDER BY tw.total_earned DESC NULLS LAST
    LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0)
  ) x;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'rows', v_rows);
END;
$function$;

-- 5) Monthly statement detail
CREATE OR REPLACE FUNCTION public.admin_teacher_monthly_statement(
  _teacher_id uuid,
  _period_label text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_archive jsonb;
  v_wallet_tx jsonb;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT to_jsonb(a) INTO v_archive
  FROM public.teacher_monthly_archives a
  WHERE a.teacher_id = _teacher_id AND a.period_label = _period_label;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_wallet_tx
  FROM (
    SELECT * FROM public.teacher_wallet_transactions
    WHERE teacher_id = _teacher_id
      AND to_char(created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM') = _period_label
  ) t;

  RETURN jsonb_build_object('success', true, 'archive', COALESCE(v_archive, '{}'::jsonb), 'transactions', v_wallet_tx);
END;
$function$;

-- 6) Audit log reader
CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(
  _action text DEFAULT NULL,
  _teacher_id uuid DEFAULT NULL,
  _limit int DEFAULT 100,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
  v_total int;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.financial_audit_logs
  WHERE (_action IS NULL OR action = _action)
    AND (_teacher_id IS NULL OR target_teacher_id = _teacher_id);

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT l.*,
           COALESCE(pa.full_name, pa.email, 'System') AS actor_name,
           COALESCE(pt.full_name, pt.email, NULL) AS teacher_name
    FROM public.financial_audit_logs l
    LEFT JOIN public.profiles pa ON pa.id = l.actor_id
    LEFT JOIN public.profiles pt ON pt.id = l.target_teacher_id
    WHERE (_action IS NULL OR l.action = _action)
      AND (_teacher_id IS NULL OR l.target_teacher_id = _teacher_id)
    ORDER BY l.created_at DESC
    LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0)
  ) x;

  RETURN jsonb_build_object('success', true, 'total', v_total, 'rows', v_rows);
END;
$function$;

-- 7) Manual wallet action wrapper (audited)
CREATE OR REPLACE FUNCTION public.admin_manual_wallet_action(
  _teacher_id uuid,
  _action text,
  _amount numeric,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_txtype text;
  v_signed numeric;
  v_resp jsonb;
BEGIN
  IF NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  IF _amount IS NULL OR _amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'المبلغ غير صالح');
  END IF;

  INSERT INTO public.teacher_wallets (teacher_id, balance, total_earned)
  VALUES (_teacher_id, 0, 0)
  ON CONFLICT (teacher_id) DO NOTHING;

  SELECT to_jsonb(w) INTO v_before FROM public.teacher_wallets w WHERE teacher_id = _teacher_id;

  IF _action = 'bonus' THEN
    v_txtype := 'admin_bonus'; v_signed := _amount;
  ELSIF _action = 'credit' THEN
    v_txtype := 'admin_credit'; v_signed := _amount;
  ELSIF _action = 'penalty' THEN
    v_txtype := 'admin_penalty'; v_signed := -_amount;
  ELSIF _action = 'debit' THEN
    v_txtype := 'admin_debit'; v_signed := -_amount;
  ELSIF _action = 'freeze' THEN
    -- move from available -> frozen
    UPDATE public.teacher_wallets
      SET balance = GREATEST(0, balance - _amount),
          frozen_balance = frozen_balance + _amount,
          updated_at = now()
    WHERE teacher_id = _teacher_id;
    INSERT INTO public.teacher_wallet_transactions
      (teacher_id, amount, transaction_type, description, admin_message, admin_id, balance_after)
    SELECT _teacher_id, -_amount, 'admin_freeze', 'تجميد رصيد يدوي', _reason, v_caller, balance
    FROM public.teacher_wallets WHERE teacher_id = _teacher_id;
    v_resp := jsonb_build_object('success', true);
  ELSIF _action = 'unfreeze' THEN
    UPDATE public.teacher_wallets
      SET balance = balance + _amount,
          frozen_balance = GREATEST(0, frozen_balance - _amount),
          updated_at = now()
    WHERE teacher_id = _teacher_id;
    INSERT INTO public.teacher_wallet_transactions
      (teacher_id, amount, transaction_type, description, admin_message, admin_id, balance_after)
    SELECT _teacher_id, _amount, 'admin_unfreeze', 'إفراج عن رصيد مجمّد', _reason, v_caller, balance
    FROM public.teacher_wallets WHERE teacher_id = _teacher_id;
    v_resp := jsonb_build_object('success', true);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'إجراء غير معروف');
  END IF;

  IF v_txtype IS NOT NULL THEN
    v_resp := public.admin_adjust_teacher_wallet(_teacher_id, v_signed, v_txtype, _reason, _reason);
    IF NOT COALESCE((v_resp->>'success')::boolean, false) THEN
      RETURN v_resp;
    END IF;
  END IF;

  SELECT to_jsonb(w) INTO v_after FROM public.teacher_wallets w WHERE teacher_id = _teacher_id;

  INSERT INTO public.financial_audit_logs
    (actor_id, action, target_teacher_id, amount, old_value, new_value, reason)
  VALUES
    (v_caller, 'wallet_' || _action, _teacher_id, _amount, v_before, v_after, _reason);

  -- Notify teacher for freeze/unfreeze (bonus/credit/penalty/debit already notify via admin_adjust)
  IF _action IN ('freeze','unfreeze') THEN
    INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
    VALUES (
      _teacher_id,
      CASE WHEN _action = 'freeze' THEN '❄️ تم تجميد رصيد' ELSE '✅ تم الإفراج عن رصيد' END,
      COALESCE(_reason, 'إجراء إداري على محفظتك بمبلغ ' || _amount || ' جنيه'),
      'wallet', '/teacher/wallet', false, true
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'before', v_before, 'after', v_after);
END;
$function$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.admin_financial_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_wallets(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_teacher_monthly_statement(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(text, uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_wallet_action(uuid, text, numeric, text) TO authenticated;
