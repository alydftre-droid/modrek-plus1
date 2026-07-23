CREATE OR REPLACE FUNCTION public.archive_teacher_period(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_grades jsonb := '[]'::jsonb;
  v_period_txns jsonb := '[]'::jsonb;
  v_period_withdrawals jsonb := '[]'::jsonb;
  v_payment_methods jsonb := '[]'::jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_archive_id uuid;
  v_balance_after numeric := 0;
  v_frozen_before numeric := 0;
  v_available_before numeric := 0;
  v_total_earned_before numeric := 0;
  v_subjects_count int := 0;
  v_snapshot jsonb;
  v_growth_series jsonb := '[]'::jsonb;
  v_grade_history jsonb := '{}'::jsonb;
  v_grade_details jsonb := '{}'::jsonb;
  v_summary jsonb;
  v_hero jsonb;
  v_teacher jsonb;
  v_teacher_name text;
  v_teacher_code text;
  v_prev_total numeric := 0;
  v_month_delta_pct numeric := 0;
  v_new_students int := 0;
  v_open_day int := 25;
  v_open_date_label text;
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
    COALESCE(frozen_balance, 0),
    COALESCE(total_earned, 0)
  INTO v_period, v_release_amount, v_available_before, v_frozen_before, v_total_earned_before
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
    COALESCE(AVG(commission_rate), 0.70),
    COUNT(DISTINCT subject_id)
  INTO v_total_from_records, v_gross_from_records, v_subs, v_groups, v_rate, v_subjects_count
  FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false
    AND NOT public.is_test_student(student_id);

  v_release_amount := GREATEST(COALESCE(v_release_amount, 0), COALESCE(v_total_from_records, 0));

  SELECT COUNT(DISTINCT student_id)
  INTO v_new_students
  FROM public.teacher_earning_records ter
  WHERE ter.teacher_id = _teacher_id
    AND ter.period_label = v_period
    AND NOT public.is_test_student(ter.student_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_earning_records ter_prev
      WHERE ter_prev.teacher_id = _teacher_id
        AND ter_prev.student_id = ter.student_id
        AND ter_prev.period_label < v_period
    );

  SELECT COALESCE(NULLIF(full_name,''),'المعلم'), teacher_code
  INTO v_teacher_name, v_teacher_code
  FROM public.profiles WHERE id = _teacher_id;

  v_teacher := jsonb_build_object(
    'id', _teacher_id,
    'name', COALESCE(v_teacher_name, 'المعلم'),
    'code', v_teacher_code,
    'commission_rate', v_rate
  );

  BEGIN
    SELECT COALESCE(
      (SELECT (value::jsonb->>'openDay')::int
       FROM public.platform_settings
       WHERE key = 'withdrawal_settings'
       LIMIT 1),
      25
    ) INTO v_open_day;
  EXCEPTION WHEN OTHERS THEN
    v_open_day := 25;
  END;
  v_open_date_label := v_open_day::text || ' ' || to_char(v_period_end AT TIME ZONE 'Africa/Cairo', 'Mon');

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
        AVG(ter.commission_rate) AS commission_rate
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

  SELECT COALESCE(jsonb_agg(gnode ORDER BY (gnode->>'totalEarned')::numeric DESC), '[]'::jsonb)
  INTO v_grades
  FROM (
    SELECT jsonb_build_object(
      'key', concat_ws('__', COALESCE(s.stage,''), COALESCE(s.grade,''), COALESCE(s.category,'')),
      'stage', s.stage,
      'grade', s.grade,
      'category', s.category,
      'totalEarned', SUM(ter.net_amount),
      'totalGross', SUM(ter.gross_amount),
      'subscriberCount', COUNT(DISTINCT ter.student_id),
      'groupCount', COUNT(DISTINCT ter.group_id),
      'subjectCount', COUNT(DISTINCT ter.subject_id)
    ) AS gnode
    FROM public.teacher_earning_records ter
    LEFT JOIN public.subjects s ON s.id = ter.subject_id
    WHERE ter.teacher_id = _teacher_id
      AND ter.period_label = v_period
      AND ter.is_archived = false
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY s.stage, s.grade, s.category
  ) grades;

  WITH per_group AS (
    SELECT
      concat_ws('__', COALESCE(s.stage,''), COALESCE(s.grade,''), COALESCE(s.category,'')) AS key,
      ter.group_id AS id,
      COALESCE(cg.title, 'مجموعة') AS title,
      COALESCE(cg.price, MAX(ter.gross_amount)) AS price,
      COUNT(DISTINCT ter.student_id) AS count,
      SUM(ter.net_amount) AS net
    FROM public.teacher_earning_records ter
    LEFT JOIN public.content_groups cg ON cg.id = ter.group_id
    LEFT JOIN public.subjects s ON s.id = COALESCE(ter.subject_id, cg.subject_id)
    WHERE ter.teacher_id = _teacher_id
      AND ter.period_label = v_period
      AND ter.is_archived = false
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY s.stage, s.grade, s.category, ter.group_id, cg.title, cg.price
  )
  SELECT COALESCE(jsonb_object_agg(key, groups), '{}'::jsonb)
  INTO v_grade_details
  FROM (
    SELECT key, jsonb_agg(jsonb_build_object('id', id, 'title', title, 'price', price, 'count', count, 'net', net) ORDER BY net DESC) AS groups
    FROM per_group
    GROUP BY key
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_period_txns
  FROM (
    SELECT id, amount, transaction_type, description, balance_after, metadata, created_at
    FROM public.teacher_wallet_transactions
    WHERE teacher_id = _teacher_id
      AND created_at >= v_period_start
      AND created_at < v_period_end
    ORDER BY created_at DESC
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC), '[]'::jsonb)
  INTO v_period_withdrawals
  FROM (
    SELECT id, amount, payment_method, phone_number, status, admin_message, created_at, processed_at
    FROM public.teacher_withdrawal_requests
    WHERE teacher_id = _teacher_id
      AND created_at >= v_period_start
      AND created_at < v_period_end
    ORDER BY created_at DESC
  ) w;

  SELECT COALESCE(jsonb_agg(to_jsonb(pm) ORDER BY pm.created_at), '[]'::jsonb)
  INTO v_payment_methods
  FROM (
    SELECT id, method_type, phone_number, created_at
    FROM public.teacher_payment_methods
    WHERE teacher_id = _teacher_id
    ORDER BY created_at
  ) pm;

  WITH last5 AS (
    SELECT period_label, total_earned
    FROM public.teacher_monthly_archives
    WHERE teacher_id = _teacher_id
      AND period_label < v_period
    ORDER BY period_label DESC
    LIMIT 5
  ), ordered AS (
    SELECT period_label, total_earned FROM last5 ORDER BY period_label ASC
  )
  SELECT jsonb_agg(jsonb_build_object(
    'name', to_char(to_date(period_label||'-01','YYYY-MM-DD'), 'Mon'),
    'period', period_label,
    'v', COALESCE(total_earned,0)
  ))
  INTO v_growth_series
  FROM ordered;
  v_growth_series := COALESCE(v_growth_series,'[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'name', to_char(to_date(v_period||'-01','YYYY-MM-DD'), 'Mon'),
      'period', v_period,
      'v', COALESCE(v_release_amount,0),
      'current', true
    )
  );

  SELECT COALESCE(total_earned,0) INTO v_prev_total
  FROM public.teacher_monthly_archives
  WHERE teacher_id = _teacher_id
    AND period_label < v_period
  ORDER BY period_label DESC
  LIMIT 1;
  v_month_delta_pct := CASE WHEN v_prev_total > 0
    THEN ROUND(((v_release_amount - v_prev_total) / v_prev_total) * 100)
    ELSE CASE WHEN v_release_amount > 0 THEN 100 ELSE 0 END
  END;

  WITH last5 AS (
    SELECT period_label, snapshot
    FROM public.teacher_monthly_archives
    WHERE teacher_id = _teacher_id
      AND period_label < v_period
    ORDER BY period_label DESC
    LIMIT 5
  ), unrolled AS (
    SELECT period_label,
           (gr->>'key') AS key,
           COALESCE((gr->>'totalEarned')::numeric, 0) AS v
    FROM last5, jsonb_array_elements(COALESCE(last5.snapshot->'grades','[]'::jsonb)) gr
  ), current_grades AS (
    SELECT v_period AS period_label,
           (gr->>'key') AS key,
           COALESCE((gr->>'totalEarned')::numeric,0) AS v
    FROM jsonb_array_elements(v_grades) gr
  ), combined AS (
    SELECT * FROM unrolled UNION ALL SELECT * FROM current_grades
  )
  SELECT COALESCE(jsonb_object_agg(key, arr), '{}'::jsonb)
  INTO v_grade_history
  FROM (
    SELECT key, jsonb_agg(v ORDER BY period_label ASC) AS arr
    FROM combined
    GROUP BY key
  ) x;

  v_summary := jsonb_build_object(
    'subsCount', v_subs,
    'newStudentsCount', v_new_students,
    'totalRevenue', v_gross_from_records,
    'currentMonthProfit', v_release_amount
  );

  v_hero := jsonb_build_object(
    'totalAll', v_available_before + v_frozen_before,
    'balance', v_available_before,
    'frozen', v_frozen_before,
    'ratePct', ROUND(v_rate * 100),
    'monthDeltaPct', v_month_delta_pct,
    'isWithdrawalOpen', false,
    'openDateLabel', v_open_date_label,
    'teacherName', COALESCE(v_teacher_name,'المعلم')
  );

  v_snapshot := jsonb_build_object(
    'version', 3,
    'captured_at', now(),
    'period_label', v_period,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'teacher', v_teacher,
    'hero', v_hero,
    'summary', v_summary,
    'growth_series', v_growth_series,
    'grade_history', v_grade_history,
    'grade_details', v_grade_details,
    'wallet_before', jsonb_build_object(
      'balance', v_available_before,
      'frozen_balance', v_frozen_before,
      'total_earned', v_total_earned_before,
      'current_period', v_period
    ),
    'stats', jsonb_build_object(
      'total_earned', v_release_amount,
      'total_gross', v_gross_from_records,
      'record_total', v_total_from_records,
      'platform_cut', GREATEST(v_gross_from_records - v_total_from_records, 0),
      'commission_rate', v_rate,
      'subscribers', v_subs,
      'subscriptions', v_subs,
      'groups', v_groups,
      'subjects', v_subjects_count,
      'new_students', v_new_students
    ),
    'grades', v_grades,
    'groups', v_breakdown,
    'transactions', v_period_txns,
    'withdrawals', v_period_withdrawals,
    'payment_methods', v_payment_methods
  );

  IF v_release_amount <= 0 THEN
    IF jsonb_array_length(v_breakdown) > 0 OR jsonb_array_length(v_period_txns) > 0 THEN
      INSERT INTO public.teacher_monthly_archives
        (teacher_id, period_label, period_start, period_end,
         total_earned, total_subscribers, total_groups, commission_rate, breakdown, snapshot, archived_at)
      VALUES
        (_teacher_id, v_period, v_period_start, v_period_end,
         0, v_subs, v_groups, v_rate, v_breakdown, v_snapshot, now())
      ON CONFLICT (teacher_id, period_label) DO UPDATE
      SET breakdown = EXCLUDED.breakdown,
          snapshot = EXCLUDED.snapshot,
          archived_at = EXCLUDED.archived_at;
    END IF;

    UPDATE public.teacher_wallets
    SET current_period = v_next_period, updated_at = now()
    WHERE teacher_id = _teacher_id;

    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'no_release_amount', 'period', v_period);
  END IF;

  INSERT INTO public.teacher_monthly_archives
    (teacher_id, period_label, period_start, period_end,
     total_earned, total_subscribers, total_groups, commission_rate, breakdown, snapshot, archived_at)
  VALUES
    (_teacher_id, v_period, v_period_start, v_period_end,
     v_release_amount, v_subs, v_groups, v_rate, v_breakdown, v_snapshot, now())
  ON CONFLICT (teacher_id, period_label) DO UPDATE
  SET total_earned = EXCLUDED.total_earned,
      total_subscribers = EXCLUDED.total_subscribers,
      total_groups = EXCLUDED.total_groups,
      commission_rate = EXCLUDED.commission_rate,
      breakdown = EXCLUDED.breakdown,
      snapshot = EXCLUDED.snapshot,
      archived_at = EXCLUDED.archived_at
  RETURNING id INTO v_archive_id;

  UPDATE public.teacher_wallets
  SET balance = COALESCE(balance,0) + v_release_amount,
      frozen_balance = 0,
      current_period = v_next_period,
      updated_at = now()
  WHERE teacher_id = _teacher_id
  RETURNING balance INTO v_balance_after;

  UPDATE public.teacher_earning_records
  SET is_archived = true
  WHERE teacher_id = _teacher_id AND period_label = v_period AND is_archived = false;

  INSERT INTO public.teacher_wallet_transactions
    (teacher_id, amount, transaction_type, description, balance_after, metadata)
  VALUES
    (_teacher_id, v_release_amount, 'frozen_release',
     'تحويل الرصيد المجمّد للمتاح لشهر ' || v_period,
     v_balance_after,
     jsonb_build_object('period_label', v_period, 'archive_id', v_archive_id));

  RETURN jsonb_build_object(
    'success', true,
    'archive_id', v_archive_id,
    'released', v_release_amount,
    'period', v_period,
    'balance_after', v_balance_after
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_teacher_period(uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.validate_financial_closing_functions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'archive_teacher_period_fixed', position('jsonb_agg( jsonb_build_object' in lower(pg_get_functiondef('public.archive_teacher_period(uuid)'::regprocedure))) = 0,
    'checked_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_financial_closing_functions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_financial_closing_functions() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_financial_closing_functions() TO postgres;