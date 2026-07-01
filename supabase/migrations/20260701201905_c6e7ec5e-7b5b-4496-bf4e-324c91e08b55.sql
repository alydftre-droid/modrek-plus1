CREATE OR REPLACE FUNCTION public.get_developer_teacher_overview(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id;

  SELECT COUNT(DISTINCT sgp.student_id)
  INTO v_active_30
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND sgp.purchased_at > now() - interval '30 days';

  SELECT COUNT(*)
  INTO v_active_subs
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND COALESCE(cg.is_active, true) = true;

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
  WHERE c.uploaded_by = _teacher_id OR COALESCE(cg.teacher_id, cg.created_by) = _teacher_id;

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
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_students(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
            AND (a.submitted_at IS NOT NULL OR a.status::text IN ('submitted','graded'))
        ), 0),
        'avg_percentage', COALESCE((
          SELECT ROUND(AVG(a.percentage), 2)
          FROM public.exam_attempts a
          JOIN public.exams e ON e.id = a.exam_id
          WHERE a.student_id = p.id
            AND e.teacher_id = _teacher_id
            AND a.percentage IS NOT NULL
            AND (a.submitted_at IS NOT NULL OR a.status::text IN ('submitted','graded'))
        ), 0),
        'last_activity', COALESCE((
          SELECT MAX(l.created_at)
          FROM public.student_activity_logs l
          WHERE l.student_id = p.id
        ), MAX(sgp.purchased_at)),
        'first_purchase', MIN(sgp.purchased_at)
      ) AS row
      FROM public.student_group_purchases sgp
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      JOIN public.profiles p ON p.id = sgp.student_id
      WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
      GROUP BY p.id, p.full_name, p.avatar_url, p.email, p.phone, p.stage, p.grade, p.section, p.student_code
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_subs_by_grade(_teacher_id uuid)
RETURNS TABLE (grade text, stage text, active_subs int, monthly_revenue numeric, new_this_week int, new_this_month int, groups_count int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  GROUP BY COALESCE(s.grade, 'غير محدد'), COALESCE(s.stage, '')
  ORDER BY COUNT(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_group_details(_teacher_id uuid, _grade text DEFAULT NULL)
RETURNS TABLE (group_id uuid, group_title text, subject_name text, grade text, price numeric, students_count int, revenue numeric, new_today int, new_month int, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  LEFT JOIN public.student_group_purchases sgp ON sgp.group_id = cg.id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    AND (_grade IS NULL OR COALESCE(s.grade, 'غير محدد') = _grade)
  GROUP BY cg.id, cg.title, s.name, COALESCE(s.grade, 'غير محدد'), cg.price, cg.created_at
  ORDER BY COALESCE(SUM(sgp.amount_paid), 0) DESC, cg.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_developer_teacher_courses(_teacher_id uuid)
RETURNS TABLE (group_id uuid, group_title text, subject_name text, grade text, stage text, price numeric, students_count int, revenue numeric, videos_count int, pdfs_count int, created_at timestamptz, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
         COALESCE(s.stage, '')::text,
         COALESCE(cg.price, 0)::numeric,
         COALESCE(COUNT(DISTINCT sgp.student_id), 0)::int,
         COALESCE(SUM(DISTINCT sgp.amount_paid), 0)::numeric,
         COALESCE(COUNT(DISTINCT c.id) FILTER (WHERE lower(COALESCE(c.type, '')) IN ('video', 'videos', 'فيديو') AND COALESCE(c.is_active, true)), 0)::int,
         COALESCE(COUNT(DISTINCT c.id) FILTER (WHERE lower(COALESCE(c.type, '')) IN ('pdf', 'file', 'document', 'documents', 'ملف', 'ملفات') AND COALESCE(c.is_active, true)), 0)::int,
         cg.created_at,
         COALESCE(cg.is_active, true)
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  LEFT JOIN public.student_group_purchases sgp ON sgp.group_id = cg.id
  LEFT JOIN public.content c ON c.group_id = cg.id
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
  GROUP BY cg.id, cg.title, s.name, COALESCE(s.grade, 'غير محدد'), COALESCE(s.stage, ''), cg.price, cg.created_at, cg.is_active
  ORDER BY COALESCE(s.grade, 'غير محدد'), cg.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_developer_teacher_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_students(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_subs_by_grade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_group_details(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_developer_teacher_courses(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_developer_teacher_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_students(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_subs_by_grade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_group_details(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_courses(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_developer_teacher_overview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_students(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_subs_by_grade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_group_details(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_developer_teacher_courses(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';