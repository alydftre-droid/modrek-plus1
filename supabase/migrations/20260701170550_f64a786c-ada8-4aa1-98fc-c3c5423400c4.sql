CREATE OR REPLACE FUNCTION public.get_developer_student_overview(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile jsonb;
  v_groups int := 0;
  v_courses int := 0;
  v_teachers int := 0;
  v_videos int := 0;
  v_pdfs int := 0;
  v_exams int := 0;
  v_avg numeric := 0;
  v_progress numeric := 0;
  v_activity_pct numeric := 0;
  v_last_activity timestamptz;
  v_watched int := 0;
  v_watch_minutes numeric := 0;
  v_last_30_active_days int := 0;
  v_wallet_balance numeric := 0;
  v_total_spent numeric := 0;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM (
    SELECT id, full_name, avatar_url, email, phone, education_type,
           stage, grade, section, is_banned, created_at, updated_at,
           student_code
    FROM public.profiles
    WHERE id = _student_id
  ) p;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'student not found';
  END IF;

  WITH purchased_groups AS (
    SELECT DISTINCT sgp.group_id
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = _student_id
      AND sgp.group_id IS NOT NULL
  ), groups AS (
    SELECT cg.*
    FROM public.content_groups cg
    JOIN purchased_groups pg ON pg.group_id = cg.id
  )
  SELECT
    (SELECT count(*) FROM purchased_groups),
    (SELECT count(*) FROM purchased_groups),
    (SELECT count(DISTINCT COALESCE(g.teacher_id, g.created_by)) FROM groups g),
    (SELECT count(*) FROM public.content c JOIN purchased_groups pg ON pg.group_id = c.group_id WHERE c.type = 'video' AND COALESCE(c.is_active, true) = true),
    (SELECT count(*) FROM public.content c JOIN purchased_groups pg ON pg.group_id = c.group_id WHERE c.type = 'pdf' AND COALESCE(c.is_active, true) = true),
    (SELECT COALESCE(sum(sgp.amount_paid), 0) FROM public.student_group_purchases sgp WHERE sgp.student_id = _student_id),
    (SELECT COALESCE(w.balance, 0) FROM public.wallets w WHERE w.user_id = _student_id LIMIT 1)
  INTO v_groups, v_courses, v_teachers, v_videos, v_pdfs, v_total_spent, v_wallet_balance;

  SELECT count(*),
         COALESCE(AVG(COALESCE(a.percentage, CASE WHEN a.max_score > 0 THEN (a.total_score / a.max_score) * 100 ELSE 0 END)), 0)
  INTO v_exams, v_avg
  FROM public.exam_attempts a
  WHERE a.student_id = _student_id
    AND (a.submitted_at IS NOT NULL OR a.status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status));

  WITH purchased_groups AS (
    SELECT DISTINCT group_id
    FROM public.student_group_purchases
    WHERE student_id = _student_id AND group_id IS NOT NULL
  ), visible_videos AS (
    SELECT c.id
    FROM public.content c
    JOIN purchased_groups pg ON pg.group_id = c.group_id
    WHERE c.type = 'video' AND COALESCE(c.is_active, true) = true
  ), progress AS (
    SELECT vp.content_id, vp.progress_seconds, vp.duration_seconds
    FROM public.video_progress vp
    JOIN visible_videos vv ON vv.id = vp.content_id
    WHERE vp.user_id = _student_id
  )
  SELECT
    count(*) FILTER (WHERE duration_seconds > 0 AND progress_seconds / duration_seconds >= 0.9),
    COALESCE(sum(progress_seconds), 0) / 60.0
  INTO v_watched, v_watch_minutes
  FROM progress;

  IF v_videos > 0 THEN
    v_progress := ROUND((COALESCE(v_watched, 0)::numeric / v_videos::numeric) * 100, 2);
  ELSE
    v_progress := 0;
  END IF;

  SELECT max(created_at) INTO v_last_activity
  FROM public.student_activity_logs
  WHERE student_id = _student_id;

  SELECT count(DISTINCT date(created_at)) INTO v_last_30_active_days
  FROM public.student_activity_logs
  WHERE student_id = _student_id
    AND created_at > now() - interval '30 days';

  v_activity_pct := ROUND((COALESCE(v_last_30_active_days, 0)::numeric / 30) * 100, 2);

  RETURN jsonb_build_object(
    'profile', v_profile,
    'stats', jsonb_build_object(
      'courses_count', COALESCE(v_courses, 0),
      'groups_count', COALESCE(v_groups, 0),
      'teachers_count', COALESCE(v_teachers, 0),
      'videos_count', COALESCE(v_videos, 0),
      'pdfs_count', COALESCE(v_pdfs, 0),
      'exams_count', COALESCE(v_exams, 0),
      'average_score', ROUND(COALESCE(v_avg, 0), 2),
      'progress_percentage', COALESCE(v_progress, 0),
      'activity_percentage', COALESCE(v_activity_pct, 0),
      'active_days_30', COALESCE(v_last_30_active_days, 0),
      'watched_videos', COALESCE(v_watched, 0),
      'watch_minutes', ROUND(COALESCE(v_watch_minutes, 0), 0),
      'wallet_balance', COALESCE(v_wallet_balance, 0),
      'total_spent', COALESCE(v_total_spent, 0),
      'last_activity', v_last_activity
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_overview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_developer_student_exams(_student_id uuid)
RETURNS TABLE (
  exam_id uuid,
  attempt_id uuid,
  exam_title text,
  subject_name text,
  teacher_id uuid,
  teacher_name text,
  group_id uuid,
  group_title text,
  grade text,
  start_at timestamptz,
  end_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  total numeric,
  percentage numeric,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT auth.uid() AS id
  ), allowed AS (
    SELECT 1
    FROM caller
    WHERE id IS NOT NULL AND public.has_role(id, 'admin'::public.app_role)
  ), student_groups AS (
    SELECT DISTINCT sgp.group_id
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = _student_id
      AND sgp.group_id IS NOT NULL
  ), latest_attempts AS (
    SELECT DISTINCT ON (a.exam_id)
      a.id,
      a.exam_id,
      a.submitted_at,
      a.started_at,
      a.total_score,
      a.max_score,
      a.percentage,
      a.status AS attempt_status,
      a.updated_at,
      a.created_at
    FROM public.exam_attempts a
    WHERE a.student_id = _student_id
    ORDER BY a.exam_id, COALESCE(a.submitted_at, a.updated_at, a.started_at, a.created_at) DESC
  ), eligible AS (
    SELECT e.*
    FROM public.exams e
    WHERE EXISTS (SELECT 1 FROM allowed)
      AND (
        e.id IN (SELECT exam_id FROM latest_attempts)
        OR ((e.is_published = true OR e.status = 'published'::public.exam_status)
          AND (e.group_id IN (SELECT group_id FROM student_groups) OR e.group_id IS NULL))
      )
  )
  SELECT
    e.id AS exam_id,
    la.id AS attempt_id,
    e.title AS exam_title,
    COALESCE(es.name, gs.name) AS subject_name,
    COALESCE(e.teacher_id, cg.teacher_id, cg.created_by) AS teacher_id,
    tp.full_name AS teacher_name,
    e.group_id AS group_id,
    cg.title AS group_title,
    COALESCE(es.grade, gs.grade) AS grade,
    e.start_at,
    e.end_at,
    la.submitted_at,
    COALESCE(la.total_score, 0) AS score,
    COALESCE(la.max_score, e.total_marks, 0) AS total,
    COALESCE(
      la.percentage,
      CASE WHEN COALESCE(la.max_score, e.total_marks, 0) > 0 THEN ROUND((COALESCE(la.total_score, 0) / COALESCE(la.max_score, e.total_marks)) * 100, 2) ELSE 0 END
    ) AS percentage,
    CASE
      WHEN la.submitted_at IS NOT NULL OR la.attempt_status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status) THEN 'solved'
      ELSE 'missed'
    END AS status,
    e.created_at
  FROM eligible e
  LEFT JOIN public.content_groups cg ON cg.id = e.group_id
  LEFT JOIN latest_attempts la ON la.exam_id = e.id
  LEFT JOIN public.subjects es ON es.id = e.subject_id
  LEFT JOIN public.subjects gs ON gs.id = cg.subject_id
  LEFT JOIN public.profiles tp ON tp.id = COALESCE(e.teacher_id, cg.teacher_id, cg.created_by)
  ORDER BY COALESCE(cg.title, 'امتحان عام'), e.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_exams(uuid) TO authenticated;