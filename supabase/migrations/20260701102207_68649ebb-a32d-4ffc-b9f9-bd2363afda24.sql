
-- ============================================================
-- 1) student_activity_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  action_type text NOT NULL,
  action_label text,
  description text,
  subject_id uuid,
  group_id uuid,
  content_id uuid,
  teacher_id uuid,
  exam_id uuid,
  page_path text,
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  os text,
  session_id text,
  duration_seconds integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_activity_logs_student_created
  ON public.student_activity_logs (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_action_type
  ON public.student_activity_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_created
  ON public.student_activity_logs (created_at DESC);

GRANT SELECT, INSERT ON public.student_activity_logs TO authenticated;
GRANT ALL ON public.student_activity_logs TO service_role;

ALTER TABLE public.student_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert their own activity"
  ON public.student_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can read their own activity"
  ON public.student_activity_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can read all student activity"
  ON public.student_activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can read activity of their students"
  ON public.student_activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      WHERE sgp.student_id = student_activity_logs.student_id
        AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid()
    )
  );

-- ============================================================
-- 2) Enrich teacher_activity_logs
-- ============================================================
ALTER TABLE public.teacher_activity_logs
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS os text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS description text;

-- ============================================================
-- 3) Realtime
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_activity_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================
-- 4) Auto-log triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_exam_attempt_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject uuid;
  v_group uuid;
  v_teacher uuid;
  v_action text;
BEGIN
  SELECT subject_id, group_id, teacher_id INTO v_subject, v_group, v_teacher
  FROM public.exams WHERE id = NEW.exam_id;

  IF TG_OP = 'INSERT' THEN
    v_action := 'exam_started';
  ELSIF NEW.status IN ('submitted','graded') AND COALESCE(OLD.status,'') NOT IN ('submitted','graded') THEN
    v_action := 'exam_submitted';
  ELSIF NEW.status = 'expired' AND COALESCE(OLD.status,'') <> 'expired' THEN
    v_action := 'exam_expired';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.student_activity_logs
    (student_id, action_type, action_label, subject_id, group_id, teacher_id, exam_id,
     metadata)
  VALUES
    (NEW.student_id, v_action,
     CASE v_action
       WHEN 'exam_started' THEN 'بدء امتحان'
       WHEN 'exam_submitted' THEN 'تسليم امتحان'
       WHEN 'exam_expired' THEN 'انتهاء وقت امتحان'
     END,
     v_subject, v_group, v_teacher, NEW.exam_id,
     jsonb_build_object(
       'attempt_id', NEW.id,
       'percentage', NEW.percentage,
       'total_score', NEW.total_score,
       'max_score', NEW.max_score
     ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_exam_attempt_activity_ins ON public.exam_attempts;
CREATE TRIGGER trg_log_exam_attempt_activity_ins
  AFTER INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.log_exam_attempt_activity();

DROP TRIGGER IF EXISTS trg_log_exam_attempt_activity_upd ON public.exam_attempts;
CREATE TRIGGER trg_log_exam_attempt_activity_upd
  AFTER UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.log_exam_attempt_activity();

CREATE OR REPLACE FUNCTION public.log_group_purchase_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject uuid;
  v_teacher uuid;
BEGIN
  SELECT subject_id, COALESCE(teacher_id, created_by) INTO v_subject, v_teacher
  FROM public.content_groups WHERE id = NEW.group_id;

  INSERT INTO public.student_activity_logs
    (student_id, action_type, action_label, subject_id, group_id, teacher_id, metadata)
  VALUES
    (NEW.student_id, 'group_purchased', 'شراء اشتراك مجموعة',
     v_subject, NEW.group_id, v_teacher,
     jsonb_build_object('amount_paid', NEW.amount_paid));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_group_purchase_activity ON public.student_group_purchases;
CREATE TRIGGER trg_log_group_purchase_activity
  AFTER INSERT ON public.student_group_purchases
  FOR EACH ROW EXECUTE FUNCTION public.log_group_purchase_activity();

-- ============================================================
-- 5) RPC: get_developer_student_overview
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_developer_student_overview(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile jsonb;
  v_courses int;
  v_groups int;
  v_teachers int;
  v_videos int;
  v_pdfs int;
  v_exams int;
  v_avg numeric;
  v_progress numeric;
  v_activity_pct numeric;
  v_last_activity timestamptz;
  v_watched int;
  v_last_30_active_days int;
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT to_jsonb(p) INTO v_profile
  FROM (
    SELECT id, full_name, avatar_url, email, phone, education_type,
           stage, grade, section, is_banned, created_at, updated_at,
           student_code
    FROM public.profiles WHERE id = _student_id
  ) p;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'student not found';
  END IF;

  SELECT count(DISTINCT sgp.group_id) INTO v_groups
    FROM public.student_group_purchases sgp WHERE sgp.student_id = _student_id;

  SELECT count(DISTINCT cg.subject_id) INTO v_courses
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
   WHERE sgp.student_id = _student_id;

  SELECT count(DISTINCT COALESCE(cg.teacher_id, cg.created_by)) INTO v_teachers
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
   WHERE sgp.student_id = _student_id;

  SELECT
    count(*) FILTER (WHERE c.type = 'video'),
    count(*) FILTER (WHERE c.type = 'pdf')
  INTO v_videos, v_pdfs
  FROM public.student_group_purchases sgp
  JOIN public.content c ON c.group_id = sgp.group_id
  WHERE sgp.student_id = _student_id AND c.is_active = true;

  SELECT count(*), COALESCE(AVG(percentage),0)
    INTO v_exams, v_avg
    FROM public.exam_attempts
   WHERE student_id = _student_id AND status IN ('submitted','graded');

  SELECT count(*) INTO v_watched
    FROM public.video_progress
   WHERE user_id = _student_id AND completed = true;

  IF v_videos > 0 THEN
    v_progress := ROUND((v_watched::numeric / v_videos::numeric) * 100, 2);
  ELSE v_progress := 0;
  END IF;

  SELECT max(created_at) INTO v_last_activity
    FROM public.student_activity_logs WHERE student_id = _student_id;

  SELECT count(DISTINCT date(created_at)) INTO v_last_30_active_days
    FROM public.student_activity_logs
   WHERE student_id = _student_id
     AND created_at > now() - interval '30 days';

  v_activity_pct := ROUND((COALESCE(v_last_30_active_days,0)::numeric / 30) * 100, 2);

  RETURN jsonb_build_object(
    'profile', v_profile,
    'stats', jsonb_build_object(
      'courses_count', COALESCE(v_courses,0),
      'groups_count', COALESCE(v_groups,0),
      'teachers_count', COALESCE(v_teachers,0),
      'videos_count', COALESCE(v_videos,0),
      'pdfs_count', COALESCE(v_pdfs,0),
      'exams_count', COALESCE(v_exams,0),
      'average_score', ROUND(COALESCE(v_avg,0),2),
      'progress_percentage', v_progress,
      'activity_percentage', v_activity_pct,
      'active_days_30', COALESCE(v_last_30_active_days,0),
      'watched_videos', COALESCE(v_watched,0),
      'last_activity', v_last_activity
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_overview(uuid) TO authenticated;

-- ============================================================
-- 6) RPC: get_developer_student_exams
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_developer_student_exams(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'attempt_id', a.id,
      'exam_id', e.id,
      'exam_title', e.title,
      'subject_id', e.subject_id,
      'subject_name', s.name,
      'grade', e.grade,
      'stage', e.stage,
      'group_id', e.group_id,
      'group_title', cg.title,
      'teacher_id', e.teacher_id,
      'teacher_name', tp.full_name,
      'created_at', a.created_at,
      'started_at', a.started_at,
      'submitted_at', a.submitted_at,
      'duration_seconds', a.time_spent_seconds,
      'questions_count', (SELECT count(*) FROM public.exam_questions q WHERE q.exam_id = e.id),
      'correct_count', (SELECT count(*) FROM public.exam_answers ea WHERE ea.attempt_id = a.id AND ea.is_correct = true),
      'wrong_count', (SELECT count(*) FROM public.exam_answers ea WHERE ea.attempt_id = a.id AND ea.is_correct = false AND ea.selected_option_ids IS NOT NULL),
      'unanswered_count', GREATEST(
        (SELECT count(*) FROM public.exam_questions q WHERE q.exam_id = e.id)
        - (SELECT count(*) FROM public.exam_answers ea WHERE ea.attempt_id = a.id),
        0),
      'total_score', a.total_score,
      'max_score', a.max_score,
      'percentage', a.percentage,
      'status', a.status
    ) AS row
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    LEFT JOIN public.subjects s ON s.id = e.subject_id
    LEFT JOIN public.content_groups cg ON cg.id = e.group_id
    LEFT JOIN public.profiles tp ON tp.id = e.teacher_id
    WHERE a.student_id = _student_id
    ORDER BY a.created_at DESC
  ) t;

  SELECT jsonb_build_object(
    'total_exams', count(*),
    'submitted', count(*) FILTER (WHERE status IN ('submitted','graded')),
    'in_progress', count(*) FILTER (WHERE status = 'in_progress'),
    'expired', count(*) FILTER (WHERE status = 'expired'),
    'avg_percentage', ROUND(COALESCE(AVG(percentage) FILTER (WHERE status IN ('submitted','graded')),0),2),
    'max_percentage', COALESCE(MAX(percentage) FILTER (WHERE status IN ('submitted','graded')),0),
    'min_percentage', COALESCE(MIN(percentage) FILTER (WHERE status IN ('submitted','graded')),0)
  )
  INTO v_summary
  FROM public.exam_attempts WHERE student_id = _student_id;

  RETURN jsonb_build_object('rows', v_rows, 'summary', v_summary);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_exams(uuid) TO authenticated;

-- ============================================================
-- 7) RPC: get_developer_student_progress
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_developer_student_progress(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_monthly jsonb;
  v_heatmap jsonb;
  v_first_login timestamptz;
  v_last_login timestamptz;
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_agg(row ORDER BY month_key)
  INTO v_monthly
  FROM (
    SELECT
      to_char(m, 'YYYY-MM') AS month_key,
      to_char(m, 'Mon YYYY') AS month_label,
      jsonb_build_object(
        'month_key', to_char(m, 'YYYY-MM'),
        'month_label', to_char(m, 'Mon YYYY'),
        'videos_watched', COALESCE((
          SELECT count(*) FROM public.video_progress vp
          WHERE vp.user_id = _student_id AND vp.completed = true
            AND date_trunc('month', vp.updated_at) = m
        ),0),
        'exams_taken', COALESCE((
          SELECT count(*) FROM public.exam_attempts a
          WHERE a.student_id = _student_id AND a.status IN ('submitted','graded')
            AND date_trunc('month', a.submitted_at) = m
        ),0),
        'active_days', COALESCE((
          SELECT count(DISTINCT date(l.created_at))
          FROM public.student_activity_logs l
          WHERE l.student_id = _student_id
            AND date_trunc('month', l.created_at) = m
        ),0),
        'watch_seconds', COALESCE((
          SELECT SUM(vp.progress_seconds) FROM public.video_progress vp
          WHERE vp.user_id = _student_id
            AND date_trunc('month', vp.updated_at) = m
        ),0)
      ) AS row
    FROM generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) AS m
  ) x;

  SELECT jsonb_agg(jsonb_build_object('date', d, 'count', c) ORDER BY d)
  INTO v_heatmap
  FROM (
    SELECT date(created_at) AS d, count(*) AS c
    FROM public.student_activity_logs
    WHERE student_id = _student_id
      AND created_at > now() - interval '90 days'
    GROUP BY 1
  ) h;

  SELECT min(created_at), max(created_at)
    INTO v_first_login, v_last_login
    FROM public.student_activity_logs
   WHERE student_id = _student_id AND action_type = 'login';

  RETURN jsonb_build_object(
    'monthly', COALESCE(v_monthly, '[]'::jsonb),
    'heatmap', COALESCE(v_heatmap, '[]'::jsonb),
    'first_login', v_first_login,
    'last_login', v_last_login
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_progress(uuid) TO authenticated;

-- ============================================================
-- 8) RPC: get_developer_teacher_overview
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_developer_teacher_overview(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN jsonb_build_object(
    'total_students', COALESCE((
      SELECT count(DISTINCT sgp.student_id)
      FROM public.student_group_purchases sgp
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
    ),0),
    'active_students_30d', COALESCE((
      SELECT count(DISTINCT l.student_id)
      FROM public.student_activity_logs l
      JOIN public.student_group_purchases sgp ON sgp.student_id = l.student_id
      JOIN public.content_groups cg ON cg.id = sgp.group_id
      WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
        AND l.created_at > now() - interval '30 days'
    ),0),
    'courses_count', COALESCE((
      SELECT count(*) FROM public.content_groups
      WHERE COALESCE(teacher_id, created_by) = _teacher_id
    ),0),
    'videos_count', COALESCE((
      SELECT count(*) FROM public.content
      WHERE uploaded_by = _teacher_id AND type = 'video' AND is_active = true
    ),0),
    'pdfs_count', COALESCE((
      SELECT count(*) FROM public.content
      WHERE uploaded_by = _teacher_id AND type = 'pdf' AND is_active = true
    ),0),
    'total_views', COALESCE((
      SELECT count(*) FROM public.video_progress vp
      JOIN public.content c ON c.id = vp.content_id
      WHERE c.uploaded_by = _teacher_id
    ),0),
    'wallet', COALESCE((
      SELECT to_jsonb(w) FROM (
        SELECT balance, total_earned, frozen_balance
        FROM public.teacher_wallets WHERE teacher_id = _teacher_id
      ) w
    ), jsonb_build_object('balance',0,'total_earned',0,'frozen_balance',0))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_teacher_overview(uuid) TO authenticated;

-- ============================================================
-- 9) RPC: get_developer_teacher_subscriptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_developer_teacher_subscriptions(_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'group_id', cg.id,
      'group_title', cg.title,
      'grade', cg.grade,
      'stage', cg.stage,
      'subject_id', cg.subject_id,
      'subject_name', s.name,
      'price', cg.price,
      'students_count', COALESCE((SELECT count(*) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id),0),
      'revenue', COALESCE((SELECT SUM(sgp.amount_paid) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id),0),
      'new_today', COALESCE((SELECT count(*) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id AND sgp.created_at > now() - interval '1 day'),0),
      'new_month', COALESCE((SELECT count(*) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id AND sgp.created_at > now() - interval '30 days'),0)
    ) ORDER BY cg.created_at DESC)
    FROM public.content_groups cg
    LEFT JOIN public.subjects s ON s.id = cg.subject_id
    WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_teacher_subscriptions(uuid) TO authenticated;

-- ============================================================
-- 10) RPC: get_developer_smart_reports
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_developer_smart_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN jsonb_build_object(
    'top_students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'student_id', student_id,
        'full_name', full_name,
        'avg_percentage', avg_pct,
        'exams_count', exams_count
      ))
      FROM (
        SELECT a.student_id, p.full_name,
               ROUND(AVG(a.percentage),2) AS avg_pct,
               count(*) AS exams_count
        FROM public.exam_attempts a
        JOIN public.profiles p ON p.id = a.student_id
        WHERE a.status IN ('submitted','graded')
        GROUP BY a.student_id, p.full_name
        HAVING count(*) >= 1
        ORDER BY AVG(a.percentage) DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    'top_teachers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'teacher_id', teacher_id,
        'full_name', full_name,
        'students', students,
        'revenue', revenue
      ))
      FROM (
        SELECT COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
               p.full_name,
               count(DISTINCT sgp.student_id) AS students,
               COALESCE(SUM(sgp.amount_paid),0) AS revenue
        FROM public.content_groups cg
        JOIN public.student_group_purchases sgp ON sgp.group_id = cg.id
        LEFT JOIN public.profiles p ON p.id = COALESCE(cg.teacher_id, cg.created_by)
        GROUP BY COALESCE(cg.teacher_id, cg.created_by), p.full_name
        ORDER BY revenue DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    'top_courses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'content_id', c.id, 'title', c.title, 'views', views
      ))
      FROM (
        SELECT vp.content_id, count(*) AS views
        FROM public.video_progress vp
        GROUP BY vp.content_id ORDER BY count(*) DESC LIMIT 10
      ) x
      JOIN public.content c ON c.id = x.content_id
    ), '[]'::jsonb),
    'inactive_teachers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'teacher_id', p.id, 'full_name', p.full_name, 'last_content', last_c
      ))
      FROM (
        SELECT ur.user_id, MAX(c.created_at) AS last_c
        FROM public.user_roles ur
        LEFT JOIN public.content c ON c.uploaded_by = ur.user_id
        WHERE ur.role = 'teacher'
        GROUP BY ur.user_id
        HAVING MAX(c.created_at) IS NULL OR MAX(c.created_at) < now() - interval '30 days'
        LIMIT 20
      ) t
      JOIN public.profiles p ON p.id = t.user_id
    ), '[]'::jsonb),
    'at_risk_students', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'student_id', p.id, 'full_name', p.full_name, 'last_activity', last_a
      ))
      FROM (
        SELECT sgp.student_id, MAX(l.created_at) AS last_a
        FROM public.student_group_purchases sgp
        LEFT JOIN public.student_activity_logs l ON l.student_id = sgp.student_id
        GROUP BY sgp.student_id
        HAVING MAX(l.created_at) IS NULL OR MAX(l.created_at) < now() - interval '14 days'
        LIMIT 20
      ) x
      JOIN public.profiles p ON p.id = x.student_id
    ), '[]'::jsonb),
    'subscriptions_daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', c) ORDER BY d)
      FROM (
        SELECT date(created_at) AS d, count(*) AS c
        FROM public.student_group_purchases
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'revenue_total', COALESCE((SELECT SUM(amount_paid) FROM public.student_group_purchases),0),
    'revenue_today', COALESCE((SELECT SUM(amount_paid) FROM public.student_group_purchases WHERE created_at > now() - interval '1 day'),0),
    'revenue_month', COALESCE((SELECT SUM(amount_paid) FROM public.student_group_purchases WHERE created_at > now() - interval '30 days'),0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_smart_reports() TO authenticated;
