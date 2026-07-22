
-- Add full snapshot column to teacher_monthly_archives
ALTER TABLE public.teacher_monthly_archives
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Rebuild archive_teacher_period to capture a full page-replica snapshot BEFORE resetting month data.
CREATE OR REPLACE FUNCTION public.archive_teacher_period(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Build detailed per-group breakdown (same shape used by teacher wallet page)
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

  -- Aggregate per grade (stage/grade/category)
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

  -- Snapshot the wallet transactions that belong to this period
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

  -- Snapshot withdrawal requests in this period
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

  -- Snapshot payment methods active at closing
  SELECT COALESCE(jsonb_agg(to_jsonb(pm) ORDER BY pm.created_at), '[]'::jsonb)
  INTO v_payment_methods
  FROM (
    SELECT id, method_type, phone_number, created_at
    FROM public.teacher_payment_methods
    WHERE teacher_id = _teacher_id
    ORDER BY created_at
  ) pm;

  -- Build the comprehensive snapshot (full page replica)
  v_snapshot := jsonb_build_object(
    'version', 2,
    'captured_at', now(),
    'period_label', v_period,
    'period_start', v_period_start,
    'period_end', v_period_end,
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
      'subjects', v_subjects_count
    ),
    'grades', v_grades,
    'groups', v_breakdown,
    'transactions', v_period_txns,
    'withdrawals', v_period_withdrawals,
    'payment_methods', v_payment_methods
  );

  IF v_release_amount <= 0 THEN
    -- Still persist snapshot if there's data to preserve
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
          archived_at = now();
    END IF;

    UPDATE public.teacher_wallets
       SET current_period = CASE WHEN current_period = v_period THEN v_next_period ELSE current_period END,
           updated_at = now()
     WHERE teacher_id = _teacher_id;

    RETURN jsonb_build_object(
      'success', true, 'period', v_period, 'next_period', v_next_period,
      'total', 0, 'record_total', v_total_from_records,
      'subscribers', v_subs, 'groups', v_groups,
      'skipped', 'no_frozen_balance'
    );
  END IF;

  -- Persist archive with FULL snapshot BEFORE resetting anything.
  INSERT INTO public.teacher_monthly_archives
    (teacher_id, period_label, period_start, period_end,
     total_earned, total_subscribers, total_groups, commission_rate, breakdown, snapshot, archived_at)
  VALUES
    (_teacher_id, v_period, v_period_start, v_period_end,
     v_release_amount, v_subs, v_groups, v_rate, v_breakdown, v_snapshot, now())
  ON CONFLICT (teacher_id, period_label) DO UPDATE
  SET total_earned = public.teacher_monthly_archives.total_earned + EXCLUDED.total_earned,
      total_subscribers = GREATEST(public.teacher_monthly_archives.total_subscribers, EXCLUDED.total_subscribers),
      total_groups = GREATEST(public.teacher_monthly_archives.total_groups, EXCLUDED.total_groups),
      commission_rate = EXCLUDED.commission_rate,
      breakdown = EXCLUDED.breakdown,
      snapshot = EXCLUDED.snapshot,
      archived_at = now()
  RETURNING id INTO v_archive_id;

  -- Only after snapshot success, mutate live data
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
    (_teacher_id, v_release_amount, 'frozen_release',
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
       'students', v_subs
     ),
     now());

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    _teacher_id,
    '✅ تم فتح السحب لشهر ' || v_period,
    'تم نقل أرباح الشهر إلى الرصيد المتاح للسحب: ' || v_release_amount || ' جنيه، وتم حفظ نسخة أرشيفية كاملة للمحفظة.',
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
    'snapshot_saved', true,
    'breakdown_groups', jsonb_array_length(v_breakdown)
  );
END;
$function$;

-- Backfill snapshot for existing archives from breakdown so old months render richer
UPDATE public.teacher_monthly_archives a
SET snapshot = jsonb_build_object(
  'version', 1,
  'captured_at', a.archived_at,
  'period_label', a.period_label,
  'period_start', a.period_start,
  'period_end', a.period_end,
  'wallet_before', jsonb_build_object(
    'balance', NULL, 'frozen_balance', a.total_earned, 'total_earned', NULL,
    'current_period', a.period_label
  ),
  'stats', jsonb_build_object(
    'total_earned', a.total_earned,
    'commission_rate', a.commission_rate,
    'subscribers', a.total_subscribers,
    'groups', a.total_groups
  ),
  'grades', '[]'::jsonb,
  'groups', COALESCE(a.breakdown, '[]'::jsonb),
  'transactions', '[]'::jsonb,
  'withdrawals', '[]'::jsonb,
  'payment_methods', '[]'::jsonb
)
WHERE (snapshot = '{}'::jsonb OR snapshot IS NULL);
