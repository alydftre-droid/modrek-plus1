-- Central hardening for developer test-student isolation from teachers

CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (is_test_account = true) OR (test_account_code IS NOT NULL)
       FROM public.profiles
      WHERE id = _user_id),
    false
  );
$function$;

-- 1) Never persist teacher chat rows that involve test students.
CREATE OR REPLACE FUNCTION public.block_teacher_message_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_message_test_student_trg ON public.teacher_messages;
CREATE TRIGGER block_teacher_message_test_student_trg
BEFORE INSERT ON public.teacher_messages
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_message_for_test_student();

DROP POLICY IF EXISTS "Students can send messages" ON public.teacher_messages;
CREATE POLICY "Students can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND is_from_teacher = false
  AND NOT public.is_test_student(student_id)
);

DROP POLICY IF EXISTS "Teachers can send messages" ON public.teacher_messages;
CREATE POLICY "Teachers can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND is_from_teacher = true
  AND NOT public.is_test_student(student_id)
);

-- 2) Prevent teacher notifications/push rows whose creator or linked message is a test student.
CREATE OR REPLACE FUNCTION public.block_teacher_notification_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_teacher boolean := false;
  v_is_test boolean := false;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'teacher'::public.app_role
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NOT NULL AND public.is_test_student(NEW.created_by) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_notification_test_student_trg ON public.notifications;
CREATE TRIGGER block_teacher_notification_test_student_trg
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_notification_for_test_student();

CREATE OR REPLACE FUNCTION public.block_teacher_delivery_log_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid;
  v_is_teacher boolean := false;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'teacher'::public.app_role
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_student := NULLIF(COALESCE(NEW.details->>'student_id', NEW.details->>'target_student_id'), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_student := NULL;
  END;

  IF v_student IS NOT NULL AND public.is_test_student(v_student) THEN
    RETURN NULL;
  END IF;

  IF NEW.source_table = 'teacher_messages' AND NEW.source_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.teacher_messages tm
    WHERE tm.id = NEW.source_id
      AND public.is_test_student(tm.student_id)
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_delivery_log_test_student_trg ON public.notification_delivery_logs;
CREATE TRIGGER block_teacher_delivery_log_test_student_trg
BEFORE INSERT ON public.notification_delivery_logs
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_delivery_log_for_test_student();

-- 3) Clean up any previous teacher-facing financial contamination from test students.
CREATE TEMP TABLE _test_teacher_earnings ON COMMIT DROP AS
SELECT id, teacher_id, period_label, COALESCE(net_amount, 0) AS net_amount, COALESCE(is_archived, false) AS is_archived
FROM public.teacher_earning_records
WHERE public.is_test_student(student_id);

WITH bad AS (
  SELECT teacher_id,
         COALESCE(SUM(net_amount), 0) AS total_bad,
         COALESCE(SUM(net_amount) FILTER (WHERE is_archived = false), 0) AS frozen_bad,
         COALESCE(SUM(net_amount) FILTER (WHERE is_archived = true), 0) AS available_bad
  FROM _test_teacher_earnings
  GROUP BY teacher_id
)
UPDATE public.teacher_wallets tw
SET total_earned = GREATEST(0, COALESCE(tw.total_earned, 0) - bad.total_bad),
    frozen_balance = GREATEST(0, COALESCE(tw.frozen_balance, 0) - bad.frozen_bad),
    balance = GREATEST(0, COALESCE(tw.balance, 0) - bad.available_bad),
    updated_at = now()
FROM bad
WHERE tw.teacher_id = bad.teacher_id;

DELETE FROM public.teacher_wallet_transactions twt
WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata);

DELETE FROM public.teacher_earning_records ter
USING _test_teacher_earnings bad
WHERE ter.id = bad.id;

WITH affected AS (
  SELECT DISTINCT teacher_id, period_label
  FROM _test_teacher_earnings
), recomputed AS (
  SELECT a.teacher_id,
         a.period_label,
         COALESCE(SUM(ter.net_amount), 0) AS total_earned,
         COUNT(DISTINCT ter.student_id)::int AS total_subscribers,
         COUNT(DISTINCT ter.group_id)::int AS total_groups,
         COALESCE(AVG(ter.commission_rate), 0.70) AS commission_rate
  FROM affected a
  LEFT JOIN public.teacher_earning_records ter
    ON ter.teacher_id = a.teacher_id
   AND ter.period_label = a.period_label
   AND NOT public.is_test_student(ter.student_id)
  GROUP BY a.teacher_id, a.period_label
), breakdowns AS (
  SELECT a.teacher_id,
         a.period_label,
         COALESCE(jsonb_agg(g ORDER BY g.net DESC) FILTER (WHERE g.group_id IS NOT NULL), '[]'::jsonb) AS breakdown
  FROM affected a
  LEFT JOIN LATERAL (
    SELECT ter.group_id,
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
    WHERE ter.teacher_id = a.teacher_id
      AND ter.period_label = a.period_label
      AND NOT public.is_test_student(ter.student_id)
    GROUP BY ter.group_id, cg.title, cg.price, cg.subject_id, s.name, s.stage, s.grade, s.category
  ) g ON true
  GROUP BY a.teacher_id, a.period_label
)
UPDATE public.teacher_monthly_archives tma
SET total_earned = r.total_earned,
    total_subscribers = r.total_subscribers,
    total_groups = r.total_groups,
    commission_rate = r.commission_rate,
    breakdown = b.breakdown,
    archived_at = now()
FROM recomputed r
JOIN breakdowns b ON b.teacher_id = r.teacher_id AND b.period_label = r.period_label
WHERE tma.teacher_id = r.teacher_id
  AND tma.period_label = r.period_label;

-- 4) Make archive operation itself ignore test students and move only verified real earnings.
CREATE OR REPLACE FUNCTION public.archive_teacher_period(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period text;
  v_total numeric;
  v_subs int;
  v_groups int;
  v_rate numeric;
  v_breakdown jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
BEGIN
  IF v_caller IS NOT NULL AND NOT has_role(v_caller, 'admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
  END IF;

  SELECT current_period INTO v_period FROM public.teacher_wallets WHERE teacher_id = _teacher_id;
  IF v_period IS NULL THEN
    v_period := to_char(now(), 'YYYY-MM');
  END IF;

  v_period_start := to_timestamp(v_period || '-01', 'YYYY-MM-DD');
  v_period_end := (v_period_start + INTERVAL '1 month');

  SELECT
    COALESCE(SUM(net_amount), 0),
    COUNT(DISTINCT student_id),
    COUNT(DISTINCT group_id),
    COALESCE(AVG(commission_rate), 0.70)
  INTO v_total, v_subs, v_groups, v_rate
  FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false
    AND NOT public.is_test_student(student_id);

  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO v_breakdown
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
     total_earned, total_subscribers, total_groups, commission_rate, breakdown)
  VALUES
    (_teacher_id, v_period, v_period_start, v_period_end,
     v_total, v_subs, v_groups, v_rate, v_breakdown)
  ON CONFLICT (teacher_id, period_label) DO UPDATE
  SET total_earned = EXCLUDED.total_earned,
      total_subscribers = EXCLUDED.total_subscribers,
      total_groups = EXCLUDED.total_groups,
      breakdown = EXCLUDED.breakdown,
      archived_at = now();

  UPDATE public.teacher_earning_records
    SET is_frozen = false, is_archived = true
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND is_archived = false
    AND NOT public.is_test_student(student_id);

  UPDATE public.teacher_wallets
    SET balance = balance + v_total,
        frozen_balance = GREATEST(0, frozen_balance - v_total),
        current_period = to_char(now(), 'YYYY-MM'),
        updated_at = now()
  WHERE teacher_id = _teacher_id;

  INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
  VALUES (
    _teacher_id,
    '✅ تم فتح السحب لشهر ' || v_period,
    'تم نقل أرباح الشهر إلى الرصيد المتاح للسحب: ' || v_total || ' جنيه',
    'wallet', '/teacher/wallet', false, true
  );

  RETURN jsonb_build_object('success', true, 'period', v_period, 'total', v_total, 'subscribers', v_subs);
END;
$function$;

-- 5) Developer teacher reports must also exclude test students because they run as SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_developer_teacher_group_details(_teacher_id uuid, _grade text DEFAULT NULL::text)
RETURNS TABLE(group_id uuid, group_title text, subject_name text, grade text, price numeric, students_count integer, revenue numeric, new_today integer, new_month integer, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT cg.id,
         cg.title,
         s.name,
         COALESCE(s.grade, 'غير محدد')::text,
         COALESCE(cg.price, 0)::numeric,
         COALESCE(COUNT(DISTINCT sgp.student_id), 0)::int,
         COALESCE(SUM(sgp.amount_paid), 0)::numeric,
         COUNT(sgp.id) FILTER (WHERE sgp.purchased_at::date = current_date)::int,
         COUNT(sgp.id) FILTER (WHERE sgp.purchased_at > now() - interval '30 days')::int,
         cg.created_at
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  LEFT JOIN public.student_group_purchases sgp
    ON sgp.group_id = cg.id
   AND NOT public.is_test_student(sgp.student_id)
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND (_grade IS NULL OR COALESCE(s.grade, 'غير محدد') = _grade)
  GROUP BY cg.id, cg.title, s.name, COALESCE(s.grade, 'غير محدد'), cg.price, cg.created_at
  ORDER BY COALESCE(SUM(sgp.amount_paid), 0) DESC, cg.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_overview(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_total_students int := 0;
  v_active_30 int := 0;
  v_courses int := 0;
  v_videos int := 0;
  v_pdfs int := 0;
  v_views bigint := 0;
  v_watch_hours numeric := 0;
  v_wallet jsonb;
  v_active_subs int := 0;
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COUNT(DISTINCT sgp.student_id)
  INTO v_total_students
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND NOT public.is_test_student(sgp.student_id);

  SELECT COUNT(DISTINCT sgp.student_id)
  INTO v_active_30
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND sgp.purchased_at > now() - interval '30 days'
    AND NOT public.is_test_student(sgp.student_id);

  SELECT COUNT(*)
  INTO v_active_subs
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND COALESCE(cg.is_active, true) = true
    AND NOT public.is_test_student(sgp.student_id);

  SELECT COUNT(*)
  INTO v_courses
  FROM public.content_groups
  WHERE COALESCE(teacher_id, created_by) = _teacher_id;

  SELECT COUNT(*) INTO v_videos
  FROM public.content c
  LEFT JOIN public.content_groups cg ON cg.id = c.group_id
  WHERE (c.uploaded_by = _teacher_id OR COALESCE(cg.teacher_id, cg.created_by) = _teacher_id)
    AND lower(COALESCE(c.type, '')) IN ('video', 'videos', 'فيديو')
    AND COALESCE(c.is_active, true) = true;

  SELECT COUNT(*) INTO v_pdfs
  FROM public.content c
  LEFT JOIN public.content_groups cg ON cg.id = c.group_id
  WHERE (c.uploaded_by = _teacher_id OR COALESCE(cg.teacher_id, cg.created_by) = _teacher_id)
    AND lower(COALESCE(c.type, '')) IN ('pdf', 'file', 'document', 'documents', 'ملف', 'ملفات')
    AND COALESCE(c.is_active, true) = true;

  SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(vp.progress_seconds) / 3600.0, 0)
  INTO v_views, v_watch_hours
  FROM public.video_progress vp
  JOIN public.content c ON c.id = vp.content_id
  LEFT JOIN public.content_groups cg ON cg.id = c.group_id
  WHERE (c.uploaded_by = _teacher_id OR COALESCE(cg.teacher_id, cg.created_by) = _teacher_id)
    AND NOT public.is_test_student(vp.user_id);

  SELECT jsonb_build_object(
    'balance', COALESCE(balance, 0),
    'total_earned', COALESCE(total_earned, 0),
    'frozen_balance', COALESCE(frozen_balance, 0)
  )
  INTO v_wallet
  FROM public.teacher_wallets
  WHERE teacher_id = _teacher_id;

  RETURN jsonb_build_object(
    'total_students', COALESCE(v_total_students, 0),
    'active_students_30d', COALESCE(v_active_30, 0),
    'active_subscriptions', COALESCE(v_active_subs, 0),
    'courses_count', COALESCE(v_courses, 0),
    'videos_count', COALESCE(v_videos, 0),
    'pdfs_count', COALESCE(v_pdfs, 0),
    'total_views', COALESCE(v_views, 0),
    'watch_hours', ROUND(COALESCE(v_watch_hours, 0), 1),
    'wallet', COALESCE(v_wallet, '{"balance":0,"total_earned":0,"frozen_balance":0}'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_students(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY (row->>'last_activity') DESC NULLS LAST)
    FROM (
      SELECT jsonb_build_object(
        'student_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'email', p.email,
        'phone', p.phone,
        'stage', p.stage,
        'grade', p.grade,
        'section', p.section,
        'student_code', p.student_code,
        'groups_count', COUNT(DISTINCT sgp.group_id),
        'total_paid', COALESCE(SUM(sgp.amount_paid), 0),
        'exams_count', COALESCE((
          SELECT COUNT(*)
          FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.student_id = p.id
            AND e.teacher_id = _teacher_id
            AND NOT public.is_test_student(a.student_id)
            AND (a.submitted_at IS NOT NULL OR a.status::text IN ('submitted','graded'))
        ), 0),
        'avg_percentage', COALESCE((
          SELECT ROUND(AVG(a.percentage), 2)
          FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.student_id = p.id
            AND e.teacher_id = _teacher_id
            AND a.percentage IS NOT NULL
            AND NOT public.is_test_student(a.student_id)
            AND (a.submitted_at IS NOT NULL OR a.status::text IN ('submitted','graded'))
        ), 0),
        'last_activity', COALESCE((
          SELECT MAX(l.created_at)
          FROM public.student_activity_logs l
          WHERE l.student_id = p.id
            AND NOT public.is_test_student(l.student_id)
        ), MAX(sgp.purchased_at)),
        'first_purchase', MIN(sgp.purchased_at)
      ) AS row
      FROM public.student_group_purchases sgp
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      JOIN public.profiles p ON p.id = sgp.student_id
      WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
        AND NOT public.is_test_student(sgp.student_id)
      GROUP BY p.id, p.full_name, p.avatar_url, p.email, p.phone, p.stage, p.grade, p.section, p.student_code
    ) t
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_students_by_grade(_teacher_id uuid)
RETURNS TABLE(student_id uuid, full_name text, avatar_url text, email text, phone text, stage text, grade text, section text, student_code text, groups_count integer, total_paid numeric, first_purchase timestamp with time zone, last_activity timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT sgp.student_id, COUNT(DISTINCT sgp.group_id)::int AS gc,
      COALESCE(SUM(sgp.amount_paid), 0) AS tp, MIN(sgp.purchased_at) AS fp, MAX(sgp.purchased_at) AS lp
    FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id
    WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
      AND NOT public.is_test_student(sgp.student_id)
    GROUP BY sgp.student_id
  ),
  la AS (
    SELECT student_id, MAX(created_at) AS last_activity
    FROM public.student_activity_logs
    WHERE student_id IN (SELECT student_id FROM agg)
      AND NOT public.is_test_student(student_id)
    GROUP BY student_id
  )
  SELECT p.id, p.full_name, p.avatar_url, p.email, p.phone, p.stage, p.grade, p.section, p.student_code,
    a.gc, a.tp, a.fp, COALESCE(la.last_activity, a.lp)
  FROM agg a JOIN public.profiles p ON p.id = a.student_id
  LEFT JOIN la ON la.student_id = a.student_id
  WHERE NOT public.is_test_student(p.id)
  ORDER BY COALESCE(la.last_activity, a.lp) DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_subs_by_grade(_teacher_id uuid)
RETURNS TABLE(grade text, stage text, active_subs integer, monthly_revenue numeric, new_this_week integer, new_this_month integer, groups_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT COALESCE(s.grade, 'غير محدد')::text,
         COALESCE(s.stage, '')::text,
         COUNT(*)::int,
         COALESCE(SUM(CASE WHEN date_trunc('month', sgp.purchased_at) = date_trunc('month', now()) THEN sgp.amount_paid ELSE 0 END), 0)::numeric,
         COUNT(*) FILTER (WHERE sgp.purchased_at > now() - interval '7 days')::int,
         COUNT(*) FILTER (WHERE sgp.purchased_at > now() - interval '30 days')::int,
         COUNT(DISTINCT cg.id)::int
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND NOT public.is_test_student(sgp.student_id)
  GROUP BY COALESCE(s.grade, 'غير محدد'), COALESCE(s.stage, '')
  ORDER BY COUNT(*) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_wallet_monthly(_teacher_id uuid, _period text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_period text := COALESCE(NULLIF(_period, ''), to_char(now(), 'YYYY-MM'));
  v_wallet jsonb;
  v_earned numeric := 0;
  v_earnings_count int := 0;
  v_tx jsonb := '[]'::jsonb;
  v_withdrawals jsonb := '[]'::jsonb;
  v_archive jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.is_developer_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'balance', COALESCE(balance,0),
    'total_earned', COALESCE(total_earned,0),
    'frozen_balance', COALESCE(frozen_balance,0),
    'current_period', current_period
  )
  INTO v_wallet
  FROM public.teacher_wallets
  WHERE teacher_id = _teacher_id;

  SELECT COALESCE(SUM(net_amount), 0), COUNT(*)
  INTO v_earned, v_earnings_count
  FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id
    AND period_label = v_period
    AND NOT public.is_test_student(student_id);

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_tx
  FROM (
    SELECT id, amount, transaction_type, description, balance_after, created_at
    FROM public.teacher_wallet_transactions
    WHERE teacher_id = _teacher_id
      AND to_char(created_at, 'YYYY-MM') = v_period
      AND NOT public.teacher_wallet_tx_is_for_test_student(metadata)
    ORDER BY created_at DESC
    LIMIT 200
  ) t;

  SELECT COALESCE(jsonb_agg(w ORDER BY w.created_at DESC), '[]'::jsonb)
  INTO v_withdrawals
  FROM (
    SELECT id, amount, payment_method, status, created_at, processed_at
    FROM public.teacher_withdrawal_requests
    WHERE teacher_id = _teacher_id AND to_char(created_at, 'YYYY-MM') = v_period
    ORDER BY created_at DESC
  ) w;

  SELECT to_jsonb(a)
  INTO v_archive
  FROM public.teacher_monthly_archives a
  WHERE a.teacher_id = _teacher_id AND a.period_label = v_period;

  RETURN jsonb_build_object(
    'period', v_period,
    'wallet', COALESCE(v_wallet, '{"balance":0,"total_earned":0,"frozen_balance":0,"current_period":null}'::jsonb),
    'period_earned', COALESCE(v_earned, 0),
    'earnings_count', COALESCE(v_earnings_count, 0),
    'transactions', COALESCE(v_tx, '[]'::jsonb),
    'withdrawals', COALESCE(v_withdrawals, '[]'::jsonb),
    'archive', v_archive
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_test_student_visibility()
RETURNS TABLE(source text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'teacher_earning_records'::text, COUNT(*)::bigint
    FROM public.teacher_earning_records
   WHERE public.is_test_student(student_id)
  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint
    FROM public.teacher_wallet_transactions
   WHERE public.teacher_wallet_tx_is_for_test_student(metadata)
  UNION ALL
  SELECT 'teacher_messages', COUNT(*)::bigint
    FROM public.teacher_messages
   WHERE public.is_test_student(student_id)
  UNION ALL
  SELECT 'developer_teacher_students', COUNT(*)::bigint
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
   WHERE public.is_test_student(sgp.student_id)
     AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.audit_test_student_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_test_student_visibility() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';