
-- 1) Overview: scope everything to paid groups only
CREATE OR REPLACE FUNCTION public.get_developer_student_overview(_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile jsonb;
  v_courses_count int := 0;
  v_groups_count int := 0;
  v_teachers_count int := 0;
  v_videos_count int := 0;
  v_pdfs_count int := 0;
  v_exams_count int := 0;
  v_average_score numeric := 0;
  v_progress_percentage numeric := 0;
  v_activity_percentage numeric := 0;
  v_active_days_30 int := 0;
  v_watched_videos int := 0;
  v_watch_minutes int := 0;
  v_wallet_balance numeric := 0;
  v_total_spent numeric := 0;
  v_last_activity timestamptz;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM (
    SELECT id, full_name, email, phone, avatar_url, education_type, stage, grade, section, is_banned, created_at, student_code
    FROM public.profiles WHERE id = _student_id
  ) p;

  -- Paid groups are the single source of truth
  SELECT COUNT(*), COUNT(DISTINCT group_id), COALESCE(SUM(amount_paid), 0)
  INTO v_courses_count, v_groups_count, v_total_spent
  FROM public.student_group_purchases
  WHERE student_id = _student_id;

  -- Teachers count = ONLY teachers of paid groups (no "chosen" leakage)
  SELECT COUNT(DISTINCT COALESCE(cg.teacher_id, cg.created_by))
  INTO v_teachers_count
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE sgp.student_id = _student_id
    AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL;

  -- Content counts strictly within paid groups
  WITH student_groups AS (
    SELECT DISTINCT group_id FROM public.student_group_purchases WHERE student_id = _student_id
  ), content_rows AS (
    SELECT id, type FROM public.content
    WHERE group_id IN (SELECT group_id FROM student_groups) AND is_active IS DISTINCT FROM false
  )
  SELECT
    COUNT(*) FILTER (WHERE type = 'video'),
    COUNT(*) FILTER (WHERE type = 'pdf')
  INTO v_videos_count, v_pdfs_count
  FROM content_rows;

  -- Exams and averages: only for attempts on exams belonging to paid groups
  SELECT COUNT(*),
    COALESCE(ROUND(AVG(COALESCE(a.percentage,
      CASE WHEN a.max_score > 0 THEN (a.total_score / a.max_score) * 100 ELSE 0 END))), 0)
  INTO v_exams_count, v_average_score
  FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  WHERE a.student_id = _student_id
    AND a.submitted_at IS NOT NULL
    AND e.group_id IN (SELECT group_id FROM public.student_group_purchases WHERE student_id = _student_id);

  -- Video watch stats: only for content in paid groups
  WITH student_groups AS (
    SELECT DISTINCT group_id FROM public.student_group_purchases WHERE student_id = _student_id
  ), paid_content AS (
    SELECT id FROM public.content WHERE group_id IN (SELECT group_id FROM student_groups)
  )
  SELECT
    COUNT(*) FILTER (WHERE vp.duration_seconds > 0 AND vp.progress_seconds / vp.duration_seconds >= 0.9),
    COALESCE(ROUND(SUM(vp.progress_seconds) / 60.0), 0)
  INTO v_watched_videos, v_watch_minutes
  FROM public.video_progress vp
  WHERE vp.user_id = _student_id
    AND vp.content_id IN (SELECT id FROM paid_content);

  IF COALESCE(v_videos_count, 0) > 0 THEN
    v_progress_percentage := ROUND((COALESCE(v_watched_videos, 0)::numeric / v_videos_count::numeric) * 100);
  END IF;

  SELECT COUNT(DISTINCT created_at::date), MAX(created_at)
  INTO v_active_days_30, v_last_activity
  FROM public.student_activity_logs
  WHERE student_id = _student_id AND created_at > now() - interval '30 days';

  v_activity_percentage := LEAST(100, ROUND((COALESCE(v_active_days_30, 0)::numeric / 30) * 100));

  SELECT COALESCE(balance, 0) INTO v_wallet_balance FROM public.wallets WHERE user_id = _student_id;

  RETURN jsonb_build_object(
    'profile', COALESCE(v_profile, '{}'::jsonb),
    'stats', jsonb_build_object(
      'courses_count', COALESCE(v_courses_count, 0),
      'groups_count', COALESCE(v_groups_count, 0),
      'teachers_count', COALESCE(v_teachers_count, 0),
      'videos_count', COALESCE(v_videos_count, 0),
      'pdfs_count', COALESCE(v_pdfs_count, 0),
      'exams_count', COALESCE(v_exams_count, 0),
      'average_score', COALESCE(v_average_score, 0),
      'progress_percentage', COALESCE(v_progress_percentage, 0),
      'activity_percentage', COALESCE(v_activity_percentage, 0),
      'active_days_30', COALESCE(v_active_days_30, 0),
      'watched_videos', COALESCE(v_watched_videos, 0),
      'watch_minutes', COALESCE(v_watch_minutes, 0),
      'wallet_balance', COALESCE(v_wallet_balance, 0),
      'total_spent', COALESCE(v_total_spent, 0),
      'last_activity', v_last_activity
    )
  );
END;
$function$;

-- 2) Exams: only from paid groups. No group_id IS NULL leakage.
CREATE OR REPLACE FUNCTION public.get_developer_student_exams(_student_id uuid)
 RETURNS TABLE(exam_id uuid, attempt_id uuid, exam_title text, subject_name text, teacher_id uuid, teacher_name text, group_id uuid, group_title text, grade text, start_at timestamptz, end_at timestamptz, submitted_at timestamptz, score numeric, total numeric, percentage numeric, status text, created_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT 1 WHERE auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ), student_groups AS (
    SELECT DISTINCT sgp.group_id
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = _student_id AND sgp.group_id IS NOT NULL
  ), latest_attempts AS (
    SELECT DISTINCT ON (a.exam_id)
      a.id, a.exam_id, a.submitted_at, a.started_at, a.total_score, a.max_score, a.percentage,
      a.status AS attempt_status, a.updated_at, a.created_at
    FROM public.exam_attempts a
    WHERE a.student_id = _student_id
    ORDER BY a.exam_id, COALESCE(a.submitted_at, a.updated_at, a.started_at, a.created_at) DESC
  ), eligible AS (
    SELECT e.*
    FROM public.exams e
    WHERE EXISTS (SELECT 1 FROM allowed)
      AND e.group_id IN (SELECT group_id FROM student_groups)
      AND (
        e.id IN (SELECT exam_id FROM latest_attempts)
        OR (e.is_published = true OR e.status = 'published'::public.exam_status)
      )
  )
  SELECT
    e.id, la.id, e.title, COALESCE(es.name, gs.name),
    COALESCE(e.teacher_id, cg.teacher_id, cg.created_by),
    tp.full_name, e.group_id, cg.title, COALESCE(es.grade, gs.grade),
    e.start_at, e.end_at, la.submitted_at,
    COALESCE(la.total_score, 0),
    COALESCE(la.max_score, e.total_marks, 0),
    COALESCE(la.percentage,
      CASE WHEN COALESCE(la.max_score, e.total_marks, 0) > 0
        THEN ROUND((COALESCE(la.total_score, 0) / COALESCE(la.max_score, e.total_marks)) * 100, 2)
        ELSE 0 END),
    CASE
      WHEN la.submitted_at IS NOT NULL OR la.attempt_status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status) THEN 'solved'
      ELSE 'missed'
    END,
    e.created_at
  FROM eligible e
  LEFT JOIN public.content_groups cg ON cg.id = e.group_id
  LEFT JOIN latest_attempts la ON la.exam_id = e.id
  LEFT JOIN public.subjects es ON es.id = e.subject_id
  LEFT JOIN public.subjects gs ON gs.id = cg.subject_id
  LEFT JOIN public.profiles tp ON tp.id = COALESCE(e.teacher_id, cg.teacher_id, cg.created_by)
  ORDER BY COALESCE(cg.title, 'امتحان عام'), e.created_at DESC;
$function$;

-- 3) Monthly progress: scope exams and videos to paid groups only
CREATE OR REPLACE FUNCTION public.get_developer_student_progress_monthly(_student_id uuid, _months integer DEFAULT 6)
 RETURNS TABLE(period_label text, period_start timestamptz, exams_taken integer, avg_percentage numeric, videos_watched integer, watch_hours numeric, logins integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH months AS (
    SELECT date_trunc('month', now() - (n || ' months')::interval) AS ps
    FROM generate_series(0, GREATEST(_months, 1) - 1) n
  ),
  paid_groups AS (
    SELECT DISTINCT group_id FROM public.student_group_purchases WHERE student_id = _student_id
  ),
  paid_content AS (
    SELECT id FROM public.content WHERE group_id IN (SELECT group_id FROM paid_groups)
  ),
  ex AS (
    SELECT date_trunc('month', a.submitted_at) AS ps, COUNT(*) AS cnt, AVG(a.percentage) AS avg_p
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.student_id = _student_id
      AND a.submitted_at IS NOT NULL
      AND e.group_id IN (SELECT group_id FROM paid_groups)
    GROUP BY 1
  ),
  vp AS (
    SELECT date_trunc('month', updated_at) AS ps, COUNT(DISTINCT content_id) AS videos, SUM(progress_seconds) / 3600.0 AS hrs
    FROM public.video_progress
    WHERE user_id = _student_id AND content_id IN (SELECT id FROM paid_content)
    GROUP BY 1
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
$function$;

-- 4) Teachers: only teachers of paid groups
CREATE OR REPLACE FUNCTION public.get_developer_student_teachers(_student_id uuid)
 RETURNS TABLE(teacher_id uuid, teacher_name text, avatar_url text, courses_count integer, total_paid numeric, last_interaction timestamptz, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH paid AS (
    SELECT
      COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
      COUNT(DISTINCT cg.id)::int AS courses_count,
      COALESCE(SUM(sgp.amount_paid), 0)::numeric AS total_paid,
      MAX(sgp.purchased_at) AS last_purchase_at
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
    WHERE sgp.student_id = _student_id
      AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
    GROUP BY COALESCE(cg.teacher_id, cg.created_by)
  )
  SELECT pa.teacher_id, p.full_name, p.avatar_url,
    pa.courses_count, pa.total_paid, pa.last_purchase_at,
    'subscribed'::text
  FROM paid pa
  LEFT JOIN public.profiles p ON p.id = pa.teacher_id
  ORDER BY pa.last_purchase_at DESC NULLS LAST;
END;
$function$;

-- 5) Filter options: subjects & groups from actual paid purchases only
CREATE OR REPLACE FUNCTION public.get_developer_student_exam_filter_options(_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_subjects jsonb := '[]'::jsonb;
  v_groups jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name)) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb)
  INTO v_subjects
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  JOIN public.subjects s ON s.id = cg.subject_id
  WHERE sgp.student_id = _student_id;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'id', cg.id, 'title', cg.title, 'subject_id', s.id, 'subject_name', s.name
  )) FILTER (WHERE cg.id IS NOT NULL), '[]'::jsonb)
  INTO v_groups
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  WHERE sgp.student_id = _student_id;

  RETURN jsonb_build_object('subjects', v_subjects, 'groups', v_groups);
END;
$function$;
