DROP FUNCTION IF EXISTS public.get_developer_student_teachers(uuid);

CREATE FUNCTION public.get_developer_student_teachers(_student_id uuid)
RETURNS TABLE (
  teacher_id uuid,
  teacher_name text,
  avatar_url text,
  courses_count int,
  total_paid numeric,
  last_interaction timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR lower(COALESCE(auth.jwt() ->> 'email', '')) IN ('alyedaft@gmail.com', 'aliana200713@gmail.com')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH chosen AS (
    SELECT
      stc.teacher_id,
      MIN(stc.created_at) AS first_chosen_at
    FROM public.student_teacher_choices stc
    WHERE stc.student_id = _student_id
      AND stc.teacher_id IS NOT NULL
    GROUP BY stc.teacher_id
  ),
  paid AS (
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
  ),
  teacher_ids AS (
    SELECT chosen.teacher_id FROM chosen
    UNION
    SELECT paid.teacher_id FROM paid
  )
  SELECT
    ti.teacher_id,
    p.full_name AS teacher_name,
    p.avatar_url,
    COALESCE(pa.courses_count, 0)::int AS courses_count,
    COALESCE(pa.total_paid, 0)::numeric AS total_paid,
    COALESCE(pa.last_purchase_at, ch.first_chosen_at) AS last_interaction,
    CASE WHEN COALESCE(pa.courses_count, 0) > 0 THEN 'subscribed' ELSE 'chosen' END AS status
  FROM teacher_ids ti
  LEFT JOIN paid pa ON pa.teacher_id = ti.teacher_id
  LEFT JOIN chosen ch ON ch.teacher_id = ti.teacher_id
  LEFT JOIN public.profiles p ON p.id = ti.teacher_id
  ORDER BY COALESCE(pa.last_purchase_at, ch.first_chosen_at) DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_developer_student_teachers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_student_teachers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_developer_student_teachers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_developer_student_overview(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT to_jsonb(p)
  INTO v_profile
  FROM (
    SELECT id, full_name, email, phone, avatar_url, education_type, stage, grade, section, is_banned, created_at, student_code
    FROM public.profiles
    WHERE id = _student_id
  ) p;

  SELECT COUNT(*), COUNT(DISTINCT group_id), COALESCE(SUM(amount_paid), 0)
  INTO v_courses_count, v_groups_count, v_total_spent
  FROM public.student_group_purchases
  WHERE student_id = _student_id;

  WITH paid_teachers AS (
    SELECT DISTINCT COALESCE(cg.teacher_id, cg.created_by) AS teacher_id
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
    WHERE sgp.student_id = _student_id
      AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
  ),
  chosen_teachers AS (
    SELECT DISTINCT teacher_id
    FROM public.student_teacher_choices
    WHERE student_id = _student_id
      AND teacher_id IS NOT NULL
  )
  SELECT COUNT(DISTINCT teacher_id)
  INTO v_teachers_count
  FROM (
    SELECT teacher_id FROM paid_teachers
    UNION
    SELECT teacher_id FROM chosen_teachers
  ) all_teachers;

  WITH student_groups AS (
    SELECT DISTINCT group_id FROM public.student_group_purchases WHERE student_id = _student_id
  ), content_rows AS (
    SELECT id, type FROM public.content WHERE group_id IN (SELECT group_id FROM student_groups) AND is_active IS DISTINCT FROM false
  )
  SELECT
    COUNT(*) FILTER (WHERE type = 'video'),
    COUNT(*) FILTER (WHERE type = 'pdf')
  INTO v_videos_count, v_pdfs_count
  FROM content_rows;

  SELECT COUNT(*), COALESCE(ROUND(AVG(COALESCE(percentage, CASE WHEN max_score > 0 THEN (total_score / max_score) * 100 ELSE 0 END))), 0)
  INTO v_exams_count, v_average_score
  FROM public.exam_attempts
  WHERE student_id = _student_id
    AND submitted_at IS NOT NULL;

  SELECT
    COUNT(*) FILTER (WHERE duration_seconds > 0 AND progress_seconds / duration_seconds >= 0.9),
    COALESCE(ROUND(SUM(progress_seconds) / 60.0), 0)
  INTO v_watched_videos, v_watch_minutes
  FROM public.video_progress
  WHERE user_id = _student_id;

  IF COALESCE(v_videos_count, 0) > 0 THEN
    v_progress_percentage := ROUND((COALESCE(v_watched_videos, 0)::numeric / v_videos_count::numeric) * 100);
  END IF;

  SELECT COUNT(DISTINCT created_at::date), MAX(created_at)
  INTO v_active_days_30, v_last_activity
  FROM public.student_activity_logs
  WHERE student_id = _student_id
    AND created_at > now() - interval '30 days';

  v_activity_percentage := LEAST(100, ROUND((COALESCE(v_active_days_30, 0)::numeric / 30) * 100));

  SELECT COALESCE(balance, 0)
  INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = _student_id;

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
$$;

REVOKE ALL ON FUNCTION public.get_developer_student_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_student_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_developer_student_overview(uuid) TO authenticated;