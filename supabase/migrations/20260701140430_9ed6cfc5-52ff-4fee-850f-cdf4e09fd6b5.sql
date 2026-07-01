
-- 1) SECURITY FIX
DROP POLICY IF EXISTS "Students view options after submitting attempt" ON public.exam_question_options;
CREATE POLICY "Students view options after submitting attempt"
ON public.exam_question_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_questions q
    JOIN public.exam_attempts a ON a.exam_id = q.exam_id
    WHERE q.id = exam_question_options.question_id
      AND a.student_id = auth.uid()
      AND a.submitted_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.exam_attempts a3
        WHERE a3.exam_id = q.exam_id
          AND a3.student_id = auth.uid()
          AND a3.submitted_at IS NULL
      )
  )
);

-- Drop old signatures where return type may differ
DROP FUNCTION IF EXISTS public.get_developer_student_exams(uuid);
DROP FUNCTION IF EXISTS public.get_developer_student_progress_monthly(uuid, int);
DROP FUNCTION IF EXISTS public.get_developer_student_video_progress(uuid);
DROP FUNCTION IF EXISTS public.get_developer_student_teachers(uuid);
DROP FUNCTION IF EXISTS public.get_developer_teacher_overview(uuid);
DROP FUNCTION IF EXISTS public.get_developer_teacher_students_by_grade(uuid);
DROP FUNCTION IF EXISTS public.get_developer_teacher_subs_by_grade(uuid);
DROP FUNCTION IF EXISTS public.get_developer_teacher_group_details(uuid, text);
DROP FUNCTION IF EXISTS public.get_developer_teacher_courses(uuid);
DROP FUNCTION IF EXISTS public.get_developer_teacher_wallet_monthly(uuid, text);

-- 2) STUDENT EXAMS
CREATE FUNCTION public.get_developer_student_exams(_student_id uuid)
RETURNS TABLE (
  exam_id uuid, attempt_id uuid, exam_title text, subject_name text,
  teacher_id uuid, teacher_name text, group_id uuid, group_title text,
  grade text, start_at timestamptz, end_at timestamptz, submitted_at timestamptz,
  score numeric, total numeric, percentage numeric, status text, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH student_groups AS (
    SELECT group_id FROM public.student_group_purchases WHERE student_id = _student_id
  ),
  eligible AS (
    SELECT e.* FROM public.exams e
    WHERE e.is_published = true AND (e.group_id IN (SELECT group_id FROM student_groups) OR e.group_id IS NULL)
  ),
  latest_attempts AS (
    SELECT DISTINCT ON (a.exam_id) a.id, a.exam_id, a.submitted_at, a.started_at, a.total_score, a.max_score, a.percentage
    FROM public.exam_attempts a WHERE a.student_id = _student_id
    ORDER BY a.exam_id, a.started_at DESC
  )
  SELECT
    e.id, la.id, e.title, s.name, e.teacher_id, tp.full_name, e.group_id, cg.title, s.grade,
    e.start_at, e.end_at, la.submitted_at,
    COALESCE(la.total_score, 0), COALESCE(la.max_score, e.total_marks), COALESCE(la.percentage, 0),
    CASE
      WHEN la.submitted_at IS NOT NULL THEN 'solved'
      WHEN la.started_at IS NOT NULL AND la.submitted_at IS NULL AND (e.end_at IS NULL OR now() < e.end_at) THEN 'in_progress'
      WHEN la.started_at IS NOT NULL AND la.submitted_at IS NULL AND e.end_at IS NOT NULL AND now() > e.end_at THEN 'abandoned'
      WHEN la.id IS NULL AND e.end_at IS NOT NULL AND now() > e.end_at THEN 'missed'
      WHEN la.id IS NULL AND e.start_at IS NOT NULL AND now() < e.start_at THEN 'upcoming'
      ELSE 'available'
    END,
    e.created_at
  FROM eligible e
  LEFT JOIN latest_attempts la ON la.exam_id = e.id
  LEFT JOIN public.subjects s ON s.id = e.subject_id
  LEFT JOIN public.content_groups cg ON cg.id = e.group_id
  LEFT JOIN public.profiles tp ON tp.id = e.teacher_id
  ORDER BY COALESCE(la.submitted_at, la.started_at, e.created_at) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_student_exams(uuid) TO authenticated;

-- 3) STUDENT PROGRESS MONTHLY
CREATE FUNCTION public.get_developer_student_progress_monthly(_student_id uuid, _months int DEFAULT 6)
RETURNS TABLE (period_label text, period_start timestamptz, exams_taken int, avg_percentage numeric, videos_watched int, watch_hours numeric, logins int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH months AS (
    SELECT date_trunc('month', now() - (n || ' months')::interval) AS ps
    FROM generate_series(0, GREATEST(_months, 1) - 1) n
  ),
  ex AS (
    SELECT date_trunc('month', submitted_at) AS ps, COUNT(*) AS cnt, AVG(percentage) AS avg_p
    FROM public.exam_attempts WHERE student_id = _student_id AND submitted_at IS NOT NULL GROUP BY 1
  ),
  vp AS (
    SELECT date_trunc('month', updated_at) AS ps, COUNT(DISTINCT content_id) AS videos, SUM(progress_seconds) / 3600.0 AS hrs
    FROM public.video_progress WHERE user_id = _student_id GROUP BY 1
  ),
  lg AS (
    SELECT date_trunc('month', created_at) AS ps, COUNT(*) AS c
    FROM public.student_activity_logs WHERE student_id = _student_id AND action_type = 'login' GROUP BY 1
  )
  SELECT to_char(m.ps, 'YYYY-MM'), m.ps, COALESCE(ex.cnt, 0)::int,
    ROUND(COALESCE(ex.avg_p, 0)::numeric, 1), COALESCE(vp.videos, 0)::int,
    ROUND(COALESCE(vp.hrs, 0)::numeric, 2), COALESCE(lg.c, 0)::int
  FROM months m LEFT JOIN ex ON ex.ps = m.ps LEFT JOIN vp ON vp.ps = m.ps LEFT JOIN lg ON lg.ps = m.ps
  ORDER BY m.ps;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_student_progress_monthly(uuid, int) TO authenticated;

-- 4) STUDENT VIDEO PROGRESS
CREATE FUNCTION public.get_developer_student_video_progress(_student_id uuid)
RETURNS TABLE (group_id uuid, group_title text, subject_name text, teacher_id uuid, teacher_name text,
  total_videos int, fully_watched int, partially_watched int, not_opened int, avg_completion numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sg AS (SELECT group_id FROM public.student_group_purchases WHERE student_id = _student_id),
  videos AS (
    SELECT c.id AS content_id, c.group_id FROM public.content c
    WHERE c.type = 'video' AND c.group_id IN (SELECT group_id FROM sg)
  ),
  progress AS (
    SELECT v.group_id, v.content_id,
      CASE WHEN vp.duration_seconds > 0 AND vp.progress_seconds / vp.duration_seconds >= 0.9 THEN 'full'
           WHEN vp.progress_seconds > 0 THEN 'partial' ELSE 'none' END AS state,
      CASE WHEN vp.duration_seconds > 0 THEN LEAST(vp.progress_seconds / vp.duration_seconds, 1) ELSE 0 END AS ratio
    FROM videos v LEFT JOIN public.video_progress vp ON vp.content_id = v.content_id AND vp.user_id = _student_id
  )
  SELECT cg.id, cg.title, s.name, cg.teacher_id, tp.full_name,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE p.state = 'full')::int,
    COUNT(*) FILTER (WHERE p.state = 'partial')::int,
    COUNT(*) FILTER (WHERE p.state = 'none' OR p.state IS NULL)::int,
    ROUND(COALESCE(AVG(p.ratio) * 100, 0)::numeric, 1)
  FROM progress p
  JOIN public.content_groups cg ON cg.id = p.group_id
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  LEFT JOIN public.profiles tp ON tp.id = cg.teacher_id
  GROUP BY cg.id, cg.title, s.name, cg.teacher_id, tp.full_name
  ORDER BY cg.title;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_student_video_progress(uuid) TO authenticated;

-- 5) STUDENT TEACHERS
CREATE FUNCTION public.get_developer_student_teachers(_student_id uuid)
RETURNS TABLE (teacher_id uuid, teacher_name text, avatar_url text, courses_count int, total_paid numeric, last_interaction timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cg.teacher_id, tp.full_name, tp.avatar_url,
    COUNT(DISTINCT cg.id)::int, COALESCE(SUM(sgp.amount_paid), 0), MAX(sgp.purchased_at)
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  LEFT JOIN public.profiles tp ON tp.id = cg.teacher_id
  WHERE sgp.student_id = _student_id AND cg.teacher_id IS NOT NULL
  GROUP BY cg.teacher_id, tp.full_name, tp.avatar_url
  ORDER BY MAX(sgp.purchased_at) DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_student_teachers(uuid) TO authenticated;

-- 6) TEACHER OVERVIEW (real)
CREATE FUNCTION public.get_developer_teacher_overview(_teacher_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_students int := 0; v_active_30 int := 0; v_courses int := 0;
  v_videos int := 0; v_pdfs int := 0; v_views bigint := 0;
  v_watch_hours numeric := 0; v_wallet jsonb; v_active_subs int := 0;
BEGIN
  SELECT COUNT(DISTINCT sgp.student_id) INTO v_total_students
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE cg.teacher_id = _teacher_id;

  SELECT COUNT(DISTINCT sgp.student_id) INTO v_active_30
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE cg.teacher_id = _teacher_id AND sgp.purchased_at > now() - interval '30 days';

  SELECT COUNT(*) INTO v_active_subs
  FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE cg.teacher_id = _teacher_id AND cg.is_active = true;

  SELECT COUNT(*) INTO v_courses FROM public.content_groups WHERE teacher_id = _teacher_id;
  SELECT COUNT(*) INTO v_videos FROM public.content c JOIN public.content_groups cg ON cg.id = c.group_id
    WHERE cg.teacher_id = _teacher_id AND c.type = 'video';
  SELECT COUNT(*) INTO v_pdfs FROM public.content c JOIN public.content_groups cg ON cg.id = c.group_id
    WHERE cg.teacher_id = _teacher_id AND c.type = 'pdf';

  SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(vp.progress_seconds) / 3600.0, 0)
  INTO v_views, v_watch_hours
  FROM public.video_progress vp JOIN public.content c ON c.id = vp.content_id
  JOIN public.content_groups cg ON cg.id = c.group_id WHERE cg.teacher_id = _teacher_id;

  SELECT jsonb_build_object('balance', COALESCE(balance, 0), 'total_earned', COALESCE(total_earned, 0),
    'frozen_balance', COALESCE(frozen_balance, 0)) INTO v_wallet
  FROM public.teacher_wallets WHERE teacher_id = _teacher_id;

  RETURN jsonb_build_object(
    'total_students', v_total_students, 'active_students_30d', v_active_30,
    'active_subscriptions', v_active_subs, 'courses_count', v_courses,
    'videos_count', v_videos, 'pdfs_count', v_pdfs, 'total_views', v_views,
    'watch_hours', ROUND(v_watch_hours, 1),
    'wallet', COALESCE(v_wallet, '{"balance":0,"total_earned":0,"frozen_balance":0}'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_overview(uuid) TO authenticated;

-- 7) TEACHER STUDENTS BY GRADE
CREATE FUNCTION public.get_developer_teacher_students_by_grade(_teacher_id uuid)
RETURNS TABLE (student_id uuid, full_name text, avatar_url text, email text, phone text,
  stage text, grade text, section text, student_code text, groups_count int,
  total_paid numeric, first_purchase timestamptz, last_activity timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH agg AS (
    SELECT sgp.student_id, COUNT(DISTINCT sgp.group_id)::int AS gc,
      COALESCE(SUM(sgp.amount_paid), 0) AS tp, MIN(sgp.purchased_at) AS fp, MAX(sgp.purchased_at) AS lp
    FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id
    WHERE cg.teacher_id = _teacher_id GROUP BY sgp.student_id
  ),
  la AS (
    SELECT student_id, MAX(created_at) AS last_activity
    FROM public.student_activity_logs WHERE student_id IN (SELECT student_id FROM agg) GROUP BY student_id
  )
  SELECT p.id, p.full_name, p.avatar_url, p.email, p.phone, p.stage, p.grade, p.section, p.student_code,
    a.gc, a.tp, a.fp, COALESCE(la.last_activity, a.lp)
  FROM agg a JOIN public.profiles p ON p.id = a.student_id
  LEFT JOIN la ON la.student_id = a.student_id
  ORDER BY COALESCE(la.last_activity, a.lp) DESC NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_students_by_grade(uuid) TO authenticated;

-- 8) TEACHER SUBS BY GRADE
CREATE FUNCTION public.get_developer_teacher_subs_by_grade(_teacher_id uuid)
RETURNS TABLE (grade text, stage text, active_subs int, monthly_revenue numeric,
  new_this_week int, new_this_month int, groups_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.grade, 'غير محدد'), COALESCE(s.stage, ''),
    COUNT(*)::int,
    COALESCE(SUM(CASE WHEN date_trunc('month', sgp.purchased_at) = date_trunc('month', now()) THEN sgp.amount_paid END), 0),
    COUNT(*) FILTER (WHERE sgp.purchased_at > now() - interval '7 days')::int,
    COUNT(*) FILTER (WHERE sgp.purchased_at > now() - interval '30 days')::int,
    COUNT(DISTINCT cg.id)::int
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  WHERE cg.teacher_id = _teacher_id
  GROUP BY s.grade, s.stage ORDER BY COUNT(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_subs_by_grade(uuid) TO authenticated;

-- 9) TEACHER GROUP DETAILS
CREATE FUNCTION public.get_developer_teacher_group_details(_teacher_id uuid, _grade text DEFAULT NULL)
RETURNS TABLE (group_id uuid, group_title text, subject_name text, grade text, price numeric,
  students_count int, revenue numeric, new_today int, new_month int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cg.id, cg.title, s.name, s.grade, cg.price,
    COALESCE(COUNT(sgp.id), 0)::int, COALESCE(SUM(sgp.amount_paid), 0),
    COUNT(sgp.id) FILTER (WHERE sgp.purchased_at::date = current_date)::int,
    COUNT(sgp.id) FILTER (WHERE sgp.purchased_at > now() - interval '30 days')::int,
    cg.created_at
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  LEFT JOIN public.student_group_purchases sgp ON sgp.group_id = cg.id
  WHERE cg.teacher_id = _teacher_id AND (_grade IS NULL OR s.grade = _grade)
  GROUP BY cg.id, cg.title, s.name, s.grade, cg.price, cg.created_at
  ORDER BY SUM(sgp.amount_paid) DESC NULLS LAST, cg.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_group_details(uuid, text) TO authenticated;

-- 10) TEACHER COURSES
CREATE FUNCTION public.get_developer_teacher_courses(_teacher_id uuid)
RETURNS TABLE (group_id uuid, group_title text, subject_name text, grade text, stage text,
  price numeric, students_count int, revenue numeric, videos_count int, pdfs_count int,
  created_at timestamptz, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cg.id, cg.title, s.name, s.grade, s.stage, cg.price,
    COALESCE(COUNT(DISTINCT sgp.student_id), 0)::int,
    COALESCE(SUM(sgp.amount_paid), 0),
    COALESCE(COUNT(DISTINCT c.id) FILTER (WHERE c.type='video'), 0)::int,
    COALESCE(COUNT(DISTINCT c.id) FILTER (WHERE c.type='pdf'), 0)::int,
    cg.created_at, cg.is_active
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  LEFT JOIN public.student_group_purchases sgp ON sgp.group_id = cg.id
  LEFT JOIN public.content c ON c.group_id = cg.id
  WHERE cg.teacher_id = _teacher_id
  GROUP BY cg.id, cg.title, s.name, s.grade, s.stage, cg.price, cg.created_at, cg.is_active
  ORDER BY s.grade, cg.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_courses(uuid) TO authenticated;

-- 11) TEACHER WALLET MONTHLY
CREATE FUNCTION public.get_developer_teacher_wallet_monthly(_teacher_id uuid, _period text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_period text := COALESCE(_period, to_char(now(), 'YYYY-MM'));
  v_wallet jsonb; v_earned numeric := 0; v_earnings_count int := 0;
  v_tx jsonb; v_withdrawals jsonb; v_archive jsonb;
BEGIN
  SELECT jsonb_build_object('balance', COALESCE(balance,0), 'total_earned', COALESCE(total_earned,0),
    'frozen_balance', COALESCE(frozen_balance,0), 'current_period', current_period)
  INTO v_wallet FROM public.teacher_wallets WHERE teacher_id = _teacher_id;

  SELECT COALESCE(SUM(net_amount), 0), COUNT(*) INTO v_earned, v_earnings_count
  FROM public.teacher_earning_records WHERE teacher_id = _teacher_id AND period_label = v_period;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_tx
  FROM (SELECT id, amount, transaction_type, description, balance_after, created_at
        FROM public.teacher_wallet_transactions
        WHERE teacher_id = _teacher_id AND to_char(created_at, 'YYYY-MM') = v_period
        ORDER BY created_at DESC LIMIT 200) t;

  SELECT COALESCE(jsonb_agg(w ORDER BY w.created_at DESC), '[]'::jsonb) INTO v_withdrawals
  FROM (SELECT id, amount, payment_method, status, created_at, processed_at
        FROM public.teacher_withdrawal_requests
        WHERE teacher_id = _teacher_id AND to_char(created_at, 'YYYY-MM') = v_period
        ORDER BY created_at DESC) w;

  SELECT to_jsonb(a) INTO v_archive FROM public.teacher_monthly_archives a
  WHERE a.teacher_id = _teacher_id AND a.period_label = v_period;

  RETURN jsonb_build_object('period', v_period, 'wallet', COALESCE(v_wallet, '{}'::jsonb),
    'period_earned', v_earned, 'earnings_count', v_earnings_count,
    'transactions', v_tx, 'withdrawals', v_withdrawals, 'archive', v_archive);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_wallet_monthly(uuid, text) TO authenticated;

-- 12) Extended teacher activity triggers
CREATE OR REPLACE FUNCTION public.trg_log_teacher_withdrawal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.teacher_activity_logs (teacher_id, action_type, action_label, description, metadata)
    VALUES (NEW.teacher_id, 'withdrawal_requested', 'طلب سحب',
      'طلب سحب بمبلغ ' || NEW.amount || ' عبر ' || NEW.payment_method,
      jsonb_build_object('amount', NEW.amount, 'method', NEW.payment_method, 'status', NEW.status));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.teacher_activity_logs (teacher_id, action_type, action_label, description, metadata)
    VALUES (NEW.teacher_id, 'withdrawal_' || NEW.status, 'تحديث طلب سحب', 'الحالة: ' || NEW.status,
      jsonb_build_object('amount', NEW.amount, 'old_status', OLD.status, 'new_status', NEW.status));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_withdrawal ON public.teacher_withdrawal_requests;
CREATE TRIGGER trg_log_teacher_withdrawal
AFTER INSERT OR UPDATE ON public.teacher_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_log_teacher_withdrawal();

CREATE OR REPLACE FUNCTION public.trg_log_teacher_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_teacher boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'teacher') INTO is_teacher;
  IF is_teacher AND (
    OLD.full_name IS DISTINCT FROM NEW.full_name OR
    OLD.phone IS DISTINCT FROM NEW.phone OR
    OLD.avatar_url IS DISTINCT FROM NEW.avatar_url
  ) THEN
    INSERT INTO public.teacher_activity_logs (teacher_id, action_type, action_label, description, metadata)
    VALUES (NEW.id, 'profile_updated', 'تعديل البيانات', 'تم تعديل بيانات الحساب',
      jsonb_build_object(
        'name_changed', OLD.full_name IS DISTINCT FROM NEW.full_name,
        'phone_changed', OLD.phone IS DISTINCT FROM NEW.phone,
        'avatar_changed', OLD.avatar_url IS DISTINCT FROM NEW.avatar_url));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_teacher_profile_change ON public.profiles;
CREATE TRIGGER trg_log_teacher_profile_change
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_log_teacher_profile_change();
