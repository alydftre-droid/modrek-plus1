CREATE OR REPLACE FUNCTION public._admin_build_financial_snapshot(_period_start timestamp with time zone, _period_end timestamp with time zone)
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
           COALESCE(p.teacher_code, '') AS teacher_code,
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
    GROUP BY ter.teacher_id, p.full_name, p.teacher_code
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
    SELECT COALESCE(s.stage::text, 'غير محدد') AS stage,
           COALESCE(s.grade::text, 'غير محدد') AS grade,
           SUM(ter.gross_amount) AS gross_amount,
           SUM(ter.net_amount) AS net_amount,
           COUNT(*) AS subscriptions,
           COUNT(DISTINCT ter.student_id) AS students,
           COUNT(DISTINCT ter.group_id) AS groups
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    LEFT JOIN public.subjects s ON s.id = cg.subject_id
    WHERE ter.created_at >= _period_start AND ter.created_at < _period_end
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY s.stage, s.grade
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(sj) ORDER BY sj.net_amount DESC), '[]'::jsonb) INTO v_subjects FROM (
    SELECT COALESCE(s.name, 'غير محدد') AS subject,
           SUM(ter.gross_amount) AS gross_amount,
           SUM(ter.net_amount) AS net_amount,
           COUNT(*) AS subscriptions,
           COUNT(DISTINCT ter.student_id) AS students,
           COUNT(DISTINCT ter.group_id) AS groups
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    LEFT JOIN public.subjects s ON s.id = cg.subject_id
    WHERE ter.created_at >= _period_start AND ter.created_at < _period_end
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY s.name
  ) sj;

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