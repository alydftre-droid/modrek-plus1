-- ============================================================
-- Admin Monitoring Center (مركز المتابعة) — additive only
-- ============================================================

-- 1) Alerts table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  student_id uuid,
  teacher_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  read_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.admin_monitoring_alerts TO authenticated;
GRANT ALL ON public.admin_monitoring_alerts TO service_role;
ALTER TABLE public.admin_monitoring_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read monitoring alerts" ON public.admin_monitoring_alerts;
CREATE POLICY "admins read monitoring alerts"
ON public.admin_monitoring_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins update monitoring alerts" ON public.admin_monitoring_alerts;
CREATE POLICY "admins update monitoring alerts"
ON public.admin_monitoring_alerts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_admin_monitoring_alerts_created ON public.admin_monitoring_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_monitoring_alerts_unread ON public.admin_monitoring_alerts (is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_monitoring_alerts_dedupe
  ON public.admin_monitoring_alerts (alert_type, (details->>'dedupe_key'))
  WHERE details->>'dedupe_key' IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_monitoring_alerts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_monitoring_alerts';
  END IF;
END $$;

-- 2) Future-proof AI request log (structure only, for token/cost later) ----
CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  feature text NOT NULL,
  model text,
  provider text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12,6),
  status text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_request_log TO authenticated;
GRANT ALL ON public.ai_request_log TO service_role;
ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read ai request log" ON public.ai_request_log;
CREATE POLICY "admins read ai request log"
ON public.ai_request_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_ai_request_log_created ON public.ai_request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_user ON public.ai_request_log (user_id, created_at DESC);

-- 3) Read-path indexes ------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_created ON public.student_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_activity_logs_student_created ON public.student_activity_logs (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_counters_date ON public.ai_usage_counters (usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_submitted ON public.exam_attempts (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sgp_purchased_at ON public.student_group_purchases (purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_processed ON public.deposit_requests (status, processed_at DESC);

-- 4) New-subscription realtime alert (only after real activation) ------
CREATE OR REPLACE FUNCTION public.admin_monitoring_notify_new_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student text;
  v_code text;
  v_teacher text;
  v_group text;
BEGIN
  SELECT full_name, student_code INTO v_student, v_code FROM public.profiles WHERE id = NEW.student_id;
  SELECT g.title, tp.full_name INTO v_group, v_teacher
  FROM public.content_groups g
  LEFT JOIN public.profiles tp ON tp.id = g.teacher_id
  WHERE g.id = NEW.group_id;

  INSERT INTO public.admin_monitoring_alerts (alert_type, severity, title, description, details, student_id)
  VALUES (
    'new_subscription', 'success', 'اشتراك جديد',
    COALESCE(v_student, 'طالب') || ' — ' || COALESCE(v_group, 'مجموعة'),
    jsonb_build_object(
      'dedupe_key', 'purchase:' || NEW.id::text,
      'student_id', NEW.student_id, 'student_name', v_student, 'student_code', v_code,
      'teacher_name', v_teacher, 'group_id', NEW.group_id, 'group_title', v_group,
      'amount', NEW.amount_paid, 'purchased_at', NEW.purchased_at
    ),
    NEW.student_id
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_monitoring_new_purchase ON public.student_group_purchases;
CREATE TRIGGER trg_admin_monitoring_new_purchase
AFTER INSERT ON public.student_group_purchases
FOR EACH ROW EXECUTE FUNCTION public.admin_monitoring_notify_new_purchase();

CREATE OR REPLACE FUNCTION public.admin_monitoring_notify_subscription_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student text;
  v_code text;
  v_teacher text;
  v_subject text;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active IS TRUE THEN RETURN NEW; END IF;

  SELECT full_name, student_code INTO v_student, v_code FROM public.profiles WHERE id = NEW.student_id;
  SELECT full_name INTO v_teacher FROM public.profiles WHERE id = NEW.teacher_id;
  SELECT name INTO v_subject FROM public.subjects WHERE id = NEW.subject_id;

  INSERT INTO public.admin_monitoring_alerts (alert_type, severity, title, description, details, student_id, teacher_id)
  VALUES (
    'new_subscription', 'success', 'اشتراك جديد',
    COALESCE(v_student, 'طالب') || ' — ' || COALESCE(v_subject, 'مادة'),
    jsonb_build_object(
      'dedupe_key', 'subscription:' || NEW.id::text,
      'student_id', NEW.student_id, 'student_name', v_student, 'student_code', v_code,
      'teacher_name', v_teacher, 'subject_name', v_subject,
      'start_date', NEW.start_date, 'end_date', NEW.end_date
    ),
    NEW.student_id, NEW.teacher_id
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_monitoring_subscription_active ON public.subscriptions;
CREATE TRIGGER trg_admin_monitoring_subscription_active
AFTER INSERT OR UPDATE OF is_active ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.admin_monitoring_notify_subscription_active();

-- 5) Thresholds -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_thresholds()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value::jsonb FROM public.platform_settings WHERE key = 'admin_monitoring_thresholds'),
    '{"ai_multiplier":3,"ai_min_requests":15,"burst_requests":30,"burst_minutes":10,"exam_attempts_per_hour":6}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_monitoring_set_thresholds(_thresholds jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_caller();
  INSERT INTO public.platform_settings (key, value)
  VALUES ('admin_monitoring_thresholds', _thresholds::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN public.admin_monitoring_thresholds();
END;
$$;

-- 6) Overview ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_overview(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(_from, (now() AT TIME ZONE 'Africa/Cairo')::date::timestamp AT TIME ZONE 'Africa/Cairo');
  v_to timestamptz := COALESCE(_to, now());
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  r jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  SELECT jsonb_build_object(
    'total_students', (SELECT count(*) FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'student'::public.app_role WHERE COALESCE(p.is_test_account,false) = false),
    'active_today', (SELECT count(DISTINCT student_id) FROM public.student_activity_logs WHERE created_at >= v_today::timestamp AT TIME ZONE 'Africa/Cairo'),
    'active_7d', (SELECT count(DISTINCT student_id) FROM public.student_activity_logs WHERE created_at >= now() - interval '7 days'),
    'active_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE is_active = true AND (end_date IS NULL OR end_date >= now())),
    'new_subscriptions_today', (SELECT count(*) FROM public.subscriptions WHERE created_at >= v_today::timestamp AT TIME ZONE 'Africa/Cairo')
      + (SELECT count(*) FROM public.student_group_purchases WHERE purchased_at >= v_today::timestamp AT TIME ZONE 'Africa/Cairo'),
    'new_subscriptions_range', (SELECT count(*) FROM public.subscriptions WHERE created_at BETWEEN v_from AND v_to)
      + (SELECT count(*) FROM public.student_group_purchases WHERE purchased_at BETWEEN v_from AND v_to),
    'ai_usage_today', (SELECT COALESCE(sum(day_count),0) FROM public.ai_usage_counters WHERE usage_date = v_today),
    'ai_students_today', (SELECT count(DISTINCT user_id) FROM public.ai_usage_counters WHERE usage_date = v_today AND day_count > 0),
    'wallet_total', (SELECT COALESCE(sum(w.balance),0) FROM public.wallets w JOIN public.user_roles ur ON ur.user_id = w.user_id AND ur.role = 'student'::public.app_role JOIN public.profiles p ON p.id = w.user_id WHERE COALESCE(p.is_test_account,false) = false),
    'exams_today', (SELECT count(*) FROM public.exam_attempts WHERE COALESCE(submitted_at, created_at) >= v_today::timestamp AT TIME ZONE 'Africa/Cairo'),
    'exams_range', (SELECT count(*) FROM public.exam_attempts WHERE COALESCE(submitted_at, created_at) BETWEEN v_from AND v_to),
    'unread_alerts', (SELECT count(*) FROM public.admin_monitoring_alerts WHERE is_read = false),
    'total_teachers', (SELECT count(*) FROM public.user_roles WHERE role = 'teacher'::public.app_role),
    'server_now', now(),
    'range_from', v_from,
    'range_to', v_to
  ) INTO r;
  RETURN r;
END;
$$;

-- 7) AI usage ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_ai_usage(
  _search text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,25),1),100);
  v_total bigint;
  v_rows jsonb;
  v_summary jsonb;
BEGIN
  PERFORM public.assert_admin_caller();

  WITH agg AS (
    SELECT c.user_id,
      SUM(CASE WHEN c.usage_date = v_today THEN c.day_count ELSE 0 END) AS today,
      SUM(CASE WHEN c.usage_date >= v_today - 6 THEN c.day_count ELSE 0 END) AS d7,
      SUM(CASE WHEN c.usage_date >= v_today - 29 THEN c.day_count ELSE 0 END) AS d30,
      MAX(c.updated_at) AS last_used
    FROM public.ai_usage_counters c
    GROUP BY c.user_id
  )
  SELECT count(*) INTO v_total
  FROM agg a JOIN public.profiles p ON p.id = a.user_id
  WHERE a.d30 > 0
    AND (_search IS NULL OR _search = '' OR p.full_name ILIKE '%'||_search||'%'
         OR COALESCE(p.student_code,'') ILIKE '%'||_search||'%' OR a.user_id::text ILIKE '%'||_search||'%');

  WITH agg AS (
    SELECT c.user_id,
      SUM(CASE WHEN c.usage_date = v_today THEN c.day_count ELSE 0 END) AS today,
      SUM(CASE WHEN c.usage_date >= v_today - 6 THEN c.day_count ELSE 0 END) AS d7,
      SUM(CASE WHEN c.usage_date >= v_today - 29 THEN c.day_count ELSE 0 END) AS d30,
      MAX(c.updated_at) AS last_used
    FROM public.ai_usage_counters c
    GROUP BY c.user_id
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'d30')::int DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'user_id', a.user_id, 'student_name', p.full_name, 'student_code', p.student_code,
      'stage', p.stage, 'grade', p.grade,
      'today', a.today, 'd7', a.d7, 'd30', a.d30, 'last_used', a.last_used,
      'plan', CASE WHEN public.student_ai_premium_until(a.user_id) > now() THEN 'premium' ELSE 'free' END
    ) AS x
    FROM agg a JOIN public.profiles p ON p.id = a.user_id
    WHERE a.d30 > 0
      AND (_search IS NULL OR _search = '' OR p.full_name ILIKE '%'||_search||'%'
           OR COALESCE(p.student_code,'') ILIKE '%'||_search||'%' OR a.user_id::text ILIKE '%'||_search||'%')
    ORDER BY a.d30 DESC
    LIMIT v_limit OFFSET GREATEST(COALESCE(_offset,0),0)
  ) s;

  SELECT jsonb_build_object(
    'today', (SELECT COALESCE(sum(day_count),0) FROM public.ai_usage_counters WHERE usage_date = v_today),
    'd7', (SELECT COALESCE(sum(day_count),0) FROM public.ai_usage_counters WHERE usage_date >= v_today - 6),
    'd30', (SELECT COALESCE(sum(day_count),0) FROM public.ai_usage_counters WHERE usage_date >= v_today - 29),
    'students_today', (SELECT count(DISTINCT user_id) FROM public.ai_usage_counters WHERE usage_date = v_today AND day_count > 0),
    'students_30d', (SELECT count(DISTINCT user_id) FROM public.ai_usage_counters WHERE usage_date >= v_today - 29 AND day_count > 0),
    'by_feature', (SELECT COALESCE(jsonb_object_agg(feature, total), '{}'::jsonb) FROM (
        SELECT feature, sum(day_count) AS total FROM public.ai_usage_counters
        WHERE usage_date >= v_today - 29 GROUP BY feature) f),
    'premium_usage_30d', (SELECT COALESCE(sum(c.day_count),0) FROM public.ai_usage_counters c
        WHERE c.usage_date >= v_today - 29 AND public.student_ai_premium_until(c.user_id) > now()),
    'free_usage_30d', (SELECT COALESCE(sum(c.day_count),0) FROM public.ai_usage_counters c
        WHERE c.usage_date >= v_today - 29 AND COALESCE(public.student_ai_premium_until(c.user_id), now() - interval '1 day') <= now()),
    'daily_limit', (SELECT COALESCE(daily_limit,10) FROM public.ai_rate_limits WHERE feature = 'student_ai_shared'),
    'token_cost_available', EXISTS (SELECT 1 FROM public.ai_request_log LIMIT 1),
    'tokens', (SELECT jsonb_build_object(
        'requests', count(*), 'input_tokens', COALESCE(sum(input_tokens),0),
        'output_tokens', COALESCE(sum(output_tokens),0), 'total_tokens', COALESCE(sum(total_tokens),0),
        'cost_usd', COALESCE(sum(estimated_cost_usd),0))
      FROM public.ai_request_log WHERE created_at >= now() - interval '30 days')
  ) INTO v_summary;

  RETURN jsonb_build_object('summary', v_summary, 'rows', v_rows, 'total', v_total);
END;
$$;

-- 8) Most active students --------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_active_students(
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(_from, now() - interval '7 days');
  v_to timestamptz := COALESCE(_to, now());
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,20),1),100);
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  WITH acts AS (
    SELECT student_id,
      count(*) AS events,
      count(*) FILTER (WHERE action_type ILIKE '%login%') AS logins,
      count(*) FILTER (WHERE action_type ILIKE '%video%' OR action_type ILIKE '%content%' OR action_type ILIKE '%lesson%') AS lessons,
      max(created_at) AS last_activity
    FROM public.student_activity_logs
    WHERE created_at BETWEEN v_from AND v_to
    GROUP BY student_id
  ), exams AS (
    SELECT student_id, count(*) AS attempts FROM public.exam_attempts
    WHERE COALESCE(submitted_at, created_at) BETWEEN v_from AND v_to GROUP BY student_id
  ), ai AS (
    SELECT user_id AS student_id, COALESCE(sum(day_count),0) AS ai_uses FROM public.ai_usage_counters
    WHERE updated_at BETWEEN v_from AND v_to GROUP BY user_id
  ), live AS (
    SELECT student_id, count(*) AS sessions FROM public.live_attendance
    WHERE joined_at BETWEEN v_from AND v_to GROUP BY student_id
  ), merged AS (
    SELECT p.id, p.full_name, p.student_code, p.stage, p.grade,
      COALESCE(a.events,0) AS events, COALESCE(a.logins,0) AS logins, COALESCE(a.lessons,0) AS lessons,
      COALESCE(e.attempts,0) AS exam_attempts, COALESCE(ai.ai_uses,0) AS ai_uses, COALESCE(l.sessions,0) AS live_sessions,
      GREATEST(COALESCE(a.last_activity, to_timestamp(0)), to_timestamp(0)) AS last_activity,
      (COALESCE(a.logins,0) * 1 + COALESCE(a.lessons,0) * 2 + COALESCE(e.attempts,0) * 5
        + COALESCE(ai.ai_uses,0) * 3 + COALESCE(l.sessions,0) * 4 + COALESCE(a.events,0) * 1) AS score
    FROM public.profiles p
    LEFT JOIN acts a ON a.student_id = p.id
    LEFT JOIN exams e ON e.student_id = p.id
    LEFT JOIN ai ON ai.student_id = p.id
    LEFT JOIN live l ON l.student_id = p.id
    WHERE COALESCE(p.is_test_account,false) = false
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'student'::public.app_role)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.score DESC), '[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM merged WHERE score > 0 ORDER BY score DESC LIMIT v_limit) m;
  RETURN jsonb_build_object('rows', v_rows, 'from', v_from, 'to', v_to);
END;
$$;

-- 9) Top exam students -----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_top_exam_students(
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit integer DEFAULT 10, _min_attempts integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(_to, now());
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  WITH att AS (
    SELECT a.student_id,
      round(avg(a.percentage)::numeric, 2) AS avg_percentage,
      count(*) AS attempts,
      max(a.percentage) AS best_percentage,
      max(COALESCE(a.submitted_at, a.created_at)) AS last_attempt_at
    FROM public.exam_attempts a
    WHERE a.percentage IS NOT NULL
      AND COALESCE(a.submitted_at, a.created_at) BETWEEN v_from AND v_to
    GROUP BY a.student_id
    HAVING count(*) >= GREATEST(COALESCE(_min_attempts,1),1)
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'avg_percentage')::numeric DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'student_id', t.student_id, 'student_name', p.full_name, 'student_code', p.student_code,
      'stage', p.stage, 'grade', p.grade, 'education_type', p.education_type,
      'avg_percentage', t.avg_percentage, 'attempts', t.attempts,
      'best_percentage', t.best_percentage, 'last_attempt_at', t.last_attempt_at
    ) AS x
    FROM att t JOIN public.profiles p ON p.id = t.student_id
    WHERE COALESCE(p.is_test_account,false) = false
    ORDER BY t.avg_percentage DESC, t.attempts DESC
    LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),50)
  ) s;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- 10) Subscriptions ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_subscriptions(
  _filter text DEFAULT 'all', _search text DEFAULT NULL, _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,25),1),100);
  v_off integer := GREATEST(COALESCE(_offset,0),0);
  v_total bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();

  CREATE TEMP TABLE IF NOT EXISTS _tmp_subs (x jsonb) ON COMMIT DROP;

  WITH base AS (
    SELECT s.id, s.student_id, p.full_name AS student_name, p.student_code,
      s.teacher_id, tp.full_name AS teacher_name,
      sub.name AS subject_name, s.start_date, s.end_date, s.is_active, s.created_at,
      (SELECT g.title FROM public.student_group_purchases sp
         JOIN public.content_groups g ON g.id = sp.group_id
        WHERE sp.student_id = s.student_id AND g.subject_id = s.subject_id
        ORDER BY sp.purchased_at DESC LIMIT 1) AS group_title,
      (SELECT sp.amount_paid FROM public.student_group_purchases sp
         JOIN public.content_groups g ON g.id = sp.group_id
        WHERE sp.student_id = s.student_id AND g.subject_id = s.subject_id
        ORDER BY sp.purchased_at DESC LIMIT 1) AS amount_paid,
      CASE
        WHEN s.is_active IS NOT TRUE THEN 'cancelled'
        WHEN s.end_date IS NOT NULL AND s.end_date < now() THEN 'expired'
        WHEN s.end_date IS NOT NULL AND s.end_date <= now() + interval '5 days' THEN 'expiring'
        WHEN s.created_at >= now() - interval '2 days' THEN 'new'
        ELSE 'active'
      END AS status
    FROM public.subscriptions s
    JOIN public.profiles p ON p.id = s.student_id
    LEFT JOIN public.profiles tp ON tp.id = s.teacher_id
    LEFT JOIN public.subjects sub ON sub.id = s.subject_id
    WHERE COALESCE(p.is_test_account,false) = false
  ), filtered AS (
    SELECT * FROM base
    WHERE (COALESCE(_filter,'all') = 'all'
        OR (_filter = 'active' AND status IN ('active','new','expiring'))
        OR status = _filter)
      AND (_search IS NULL OR _search = '' OR student_name ILIKE '%'||_search||'%'
           OR COALESCE(student_code,'') ILIKE '%'||_search||'%' OR student_id::text ILIKE '%'||_search||'%')
  )
  INSERT INTO _tmp_subs
  SELECT to_jsonb(f) FROM filtered f ORDER BY f.created_at DESC;

  SELECT count(*) INTO v_total FROM _tmp_subs;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_rows
  FROM (SELECT x FROM _tmp_subs ORDER BY (x->>'created_at') DESC LIMIT v_limit OFFSET v_off) t;

  DROP TABLE IF EXISTS _tmp_subs;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

-- 11) Wallets ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_wallets(
  _search text DEFAULT NULL, _sort text DEFAULT 'balance_desc', _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,25),1),100);
  v_off integer := GREATEST(COALESCE(_offset,0),0);
  v_total bigint;
  v_sum numeric;
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();

  SELECT count(*), COALESCE(sum(w.balance),0) INTO v_total, v_sum
  FROM public.wallets w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE COALESCE(p.is_test_account,false) = false
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = w.user_id AND ur.role = 'student'::public.app_role)
    AND (_search IS NULL OR _search = '' OR p.full_name ILIKE '%'||_search||'%'
         OR COALESCE(p.student_code,'') ILIKE '%'||_search||'%' OR w.user_id::text ILIKE '%'||_search||'%');

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows FROM (
    SELECT w.user_id, p.full_name AS student_name, p.student_code, w.balance, w.updated_at,
      (SELECT jsonb_build_object('amount', a.amount, 'type', a.type, 'at', a.created_at)
         FROM public.wallet_adjustments a WHERE a.student_id = w.user_id
        ORDER BY a.created_at DESC LIMIT 1) AS last_movement
    FROM public.wallets w
    JOIN public.profiles p ON p.id = w.user_id
    WHERE COALESCE(p.is_test_account,false) = false
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = w.user_id AND ur.role = 'student'::public.app_role)
      AND (_search IS NULL OR _search = '' OR p.full_name ILIKE '%'||_search||'%'
           OR COALESCE(p.student_code,'') ILIKE '%'||_search||'%' OR w.user_id::text ILIKE '%'||_search||'%')
    ORDER BY
      CASE WHEN COALESCE(_sort,'balance_desc') = 'balance_asc' THEN w.balance END ASC NULLS LAST,
      CASE WHEN COALESCE(_sort,'balance_desc') = 'balance_desc' THEN w.balance END DESC NULLS LAST,
      CASE WHEN _sort = 'updated_desc' THEN w.updated_at END DESC NULLS LAST
    LIMIT v_limit OFFSET v_off
  ) t;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'total_balance', v_sum);
END;
$$;

-- 12) Alerts list / mark read ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_alerts_list(
  _only_unread boolean DEFAULT false, _limit integer DEFAULT 30, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,30),1),100);
  v_rows jsonb;
  v_total bigint;
  v_unread bigint;
BEGIN
  PERFORM public.assert_admin_caller();
  SELECT count(*), count(*) FILTER (WHERE is_read = false) INTO v_total, v_unread
  FROM public.admin_monitoring_alerts;
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows FROM (
    SELECT * FROM public.admin_monitoring_alerts
    WHERE (_only_unread IS NOT TRUE OR is_read = false)
    ORDER BY created_at DESC LIMIT v_limit OFFSET GREATEST(COALESCE(_offset,0),0)
  ) t;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'unread', v_unread);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_monitoring_mark_alerts_read(_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.assert_admin_caller();
  UPDATE public.admin_monitoring_alerts
  SET is_read = true, read_at = now(), read_by = auth.uid()
  WHERE is_read = false AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 13) Payments --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_payments(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today timestamptz := ((now() AT TIME ZONE 'Africa/Cairo')::date)::timestamp AT TIME ZONE 'Africa/Cairo';
  v_from timestamptz := COALESCE(_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(_to, now());
BEGIN
  PERFORM public.assert_admin_caller();
  RETURN jsonb_build_object(
    'deposits_today', (SELECT COALESCE(sum(amount),0) FROM public.deposit_requests WHERE status = 'approved' AND COALESCE(processed_at, updated_at) >= v_today),
    'deposits_7d', (SELECT COALESCE(sum(amount),0) FROM public.deposit_requests WHERE status = 'approved' AND COALESCE(processed_at, updated_at) >= now() - interval '7 days'),
    'deposits_30d', (SELECT COALESCE(sum(amount),0) FROM public.deposit_requests WHERE status = 'approved' AND COALESCE(processed_at, updated_at) >= now() - interval '30 days'),
    'deposits_range', (SELECT COALESCE(sum(amount),0) FROM public.deposit_requests WHERE status = 'approved' AND COALESCE(processed_at, updated_at) BETWEEN v_from AND v_to),
    'approved_count', (SELECT count(*) FROM public.deposit_requests WHERE status = 'approved' AND COALESCE(processed_at, updated_at) BETWEEN v_from AND v_to),
    'rejected_count', (SELECT count(*) FROM public.deposit_requests WHERE status = 'rejected' AND COALESCE(processed_at, updated_at) BETWEEN v_from AND v_to),
    'pending_count', (SELECT count(*) FROM public.deposit_requests WHERE status = 'pending'),
    'pending_amount', (SELECT COALESCE(sum(amount),0) FROM public.deposit_requests WHERE status = 'pending'),
    'purchases_range_count', (SELECT count(*) FROM public.student_group_purchases WHERE purchased_at BETWEEN v_from AND v_to),
    'purchases_range_amount', (SELECT COALESCE(sum(amount_paid),0) FROM public.student_group_purchases WHERE purchased_at BETWEEN v_from AND v_to),
    'purchases_today_amount', (SELECT COALESCE(sum(amount_paid),0) FROM public.student_group_purchases WHERE purchased_at >= v_today),
    'purchases_7d_amount', (SELECT COALESCE(sum(amount_paid),0) FROM public.student_group_purchases WHERE purchased_at >= now() - interval '7 days'),
    'purchases_30d_amount', (SELECT COALESCE(sum(amount_paid),0) FROM public.student_group_purchases WHERE purchased_at >= now() - interval '30 days'),
    'from', v_from, 'to', v_to
  );
END;
$$;

-- 14) Teacher activity ------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_teacher_activity(
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(_to, now());
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.activity_events DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT p.id AS teacher_id, p.full_name AS teacher_name, p.teacher_code,
      (SELECT count(*) FROM public.content_groups g WHERE g.teacher_id = p.id) AS groups_count,
      (SELECT count(DISTINCT sp.student_id) FROM public.student_group_purchases sp
         JOIN public.content_groups g ON g.id = sp.group_id WHERE g.teacher_id = p.id) AS students_count,
      (SELECT count(*) FROM public.content c WHERE c.uploaded_by = p.id) AS lessons_count,
      (SELECT count(*) FROM public.exams e WHERE e.teacher_id = p.id) AS exams_count,
      (SELECT count(*) FROM public.live_sessions ls WHERE ls.teacher_id = p.id) AS live_count,
      (SELECT count(*) FROM public.teacher_activity_logs l WHERE l.teacher_id = p.id AND l.created_at BETWEEN v_from AND v_to) AS activity_events,
      (SELECT max(l.created_at) FROM public.teacher_activity_logs l WHERE l.teacher_id = p.id) AS last_activity
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'teacher'::public.app_role)
    ORDER BY activity_events DESC
    LIMIT LEAST(GREATEST(COALESCE(_limit,20),1),100)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- 15) Inactive students -----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_inactive_students(
  _days integer DEFAULT 7, _limit integer DEFAULT 25, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(_days,7),1);
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,25),1),100);
  v_total bigint;
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  WITH last_act AS (
    SELECT p.id, p.full_name, p.student_code, p.stage, p.grade, p.created_at,
      (SELECT max(l.created_at) FROM public.student_activity_logs l WHERE l.student_id = p.id) AS last_activity
    FROM public.profiles p
    WHERE COALESCE(p.is_test_account,false) = false
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'student'::public.app_role)
  ), inactive AS (
    SELECT * FROM last_act
    WHERE last_activity IS NULL OR last_activity < now() - (v_days || ' days')::interval
  )
  SELECT count(*) INTO v_total FROM inactive;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows FROM (
    SELECT p.id AS student_id, p.full_name AS student_name, p.student_code, p.stage, p.grade,
      (SELECT max(l.created_at) FROM public.student_activity_logs l WHERE l.student_id = p.id) AS last_activity,
      (SELECT count(*) FROM public.subscriptions s WHERE s.student_id = p.id AND s.is_active = true) AS active_subscriptions
    FROM public.profiles p
    WHERE COALESCE(p.is_test_account,false) = false
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'student'::public.app_role)
      AND COALESCE((SELECT max(l.created_at) FROM public.student_activity_logs l WHERE l.student_id = p.id), to_timestamp(0))
          < now() - (v_days || ' days')::interval
    ORDER BY (SELECT max(l.created_at) FROM public.student_activity_logs l WHERE l.student_id = p.id) ASC NULLS FIRST
    LIMIT v_limit OFFSET GREATEST(COALESCE(_offset,0),0)
  ) t;
  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'days', v_days);
END;
$$;

-- 16) Anomalies -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_th jsonb := public.admin_monitoring_thresholds();
  v_mult numeric := COALESCE((v_th->>'ai_multiplier')::numeric, 3);
  v_min integer := COALESCE((v_th->>'ai_min_requests')::integer, 15);
  v_burst integer := COALESCE((v_th->>'burst_requests')::integer, 30);
  v_burst_min integer := COALESCE((v_th->>'burst_minutes')::integer, 10);
  v_exam_hour integer := COALESCE((v_th->>'exam_attempts_per_hour')::integer, 6);
  v_avg numeric;
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  SELECT COALESCE(avg(day_count),0) INTO v_avg FROM public.ai_usage_counters WHERE usage_date >= v_today - 6 AND day_count > 0;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_rows FROM (
    -- high AI usage vs platform average
    SELECT jsonb_build_object(
      'student_id', c.user_id, 'student_name', p.full_name, 'student_code', p.student_code,
      'reason', 'استخدام AI أعلى من المتوسط بكثير', 'severity',
        CASE WHEN c.day_count >= v_avg * v_mult * 2 THEN 'high' ELSE 'medium' END,
      'occurred_at', c.updated_at, 'requests', c.day_count,
      'detail', 'المتوسط اليومي للمنصة: ' || round(v_avg,1)::text
    ) AS x
    FROM public.ai_usage_counters c JOIN public.profiles p ON p.id = c.user_id
    WHERE c.usage_date >= v_today - 1 AND c.day_count >= GREATEST(v_min, v_avg * v_mult)
    UNION ALL
    -- burst usage in a short window
    SELECT jsonb_build_object(
      'student_id', c.user_id, 'student_name', p.full_name, 'student_code', p.student_code,
      'reason', 'عدد كبير من طلبات AI في وقت قصير', 'severity', 'high',
      'occurred_at', c.updated_at, 'requests', c.minute_count,
      'detail', 'الحد المسموح: ' || v_burst::text || ' طلب خلال ' || v_burst_min::text || ' دقيقة'
    )
    FROM public.ai_usage_counters c JOIN public.profiles p ON p.id = c.user_id
    WHERE c.minute_bucket >= now() - (v_burst_min || ' minutes')::interval AND c.minute_count >= v_burst
    UNION ALL
    -- exam attempt bursts
    SELECT jsonb_build_object(
      'student_id', a.student_id, 'student_name', p.full_name, 'student_code', p.student_code,
      'reason', 'محاولات امتحان متكررة في وقت قصير', 'severity', 'medium',
      'occurred_at', max(a.created_at), 'requests', count(*),
      'detail', 'الحد المسموح: ' || v_exam_hour::text || ' محاولة/ساعة'
    )
    FROM public.exam_attempts a JOIN public.profiles p ON p.id = a.student_id
    WHERE a.created_at >= now() - interval '1 hour'
    GROUP BY a.student_id, p.full_name, p.student_code
    HAVING count(*) >= v_exam_hour
  ) s;
  RETURN jsonb_build_object('rows', v_rows, 'thresholds', v_th, 'platform_avg_ai_daily', round(v_avg,2));
END;
$$;

-- 17) Health ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ai_failed bigint;
  v_lib_failed bigint;
  v_notif_failed bigint;
  v_zoom_failed bigint;
  v_pending_payments bigint;
  v_recent_logins bigint;
  v_storage_recent bigint;
BEGIN
  PERFORM public.assert_admin_caller();
  SELECT count(*) INTO v_ai_failed FROM public.processing_jobs WHERE status = 'failed'::public.processing_job_status AND updated_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_lib_failed FROM public.library_processing_jobs WHERE state = 'failed' AND updated_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_notif_failed FROM public.notification_delivery_logs WHERE status <> 'sent' AND created_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_zoom_failed FROM public.zoom_webhook_events WHERE process_error IS NOT NULL AND created_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_pending_payments FROM public.deposit_requests WHERE status = 'pending' AND created_at < now() - interval '24 hours';
  SELECT count(*) INTO v_recent_logins FROM public.student_activity_logs WHERE created_at >= now() - interval '24 hours';
  SELECT count(*) INTO v_storage_recent FROM public.storage_assets WHERE created_at >= now() - interval '7 days';

  RETURN jsonb_build_object(
    'checked_at', now(),
    'services', jsonb_build_array(
      jsonb_build_object('key','database','label','قاعدة البيانات','status','ok','detail','الاستعلامات تعمل'),
      jsonb_build_object('key','auth','label','المصادقة','status', CASE WHEN v_recent_logins > 0 THEN 'ok' ELSE 'warn' END,
        'detail','نشاط مسجّل خلال 24 ساعة: ' || v_recent_logins::text),
      jsonb_build_object('key','storage','label','التخزين','status', CASE WHEN v_storage_recent > 0 THEN 'ok' ELSE 'warn' END,
        'detail','ملفات مرفوعة خلال 7 أيام: ' || v_storage_recent::text),
      jsonb_build_object('key','ai','label','الذكاء الاصطناعي','status', CASE WHEN v_ai_failed = 0 THEN 'ok' WHEN v_ai_failed < 10 THEN 'warn' ELSE 'error' END,
        'detail','مهام فاشلة (24س): ' || v_ai_failed::text),
      jsonb_build_object('key','library','label','فهرسة المكتبة','status', CASE WHEN v_lib_failed = 0 THEN 'ok' WHEN v_lib_failed < 10 THEN 'warn' ELSE 'error' END,
        'detail','مهام فاشلة (24س): ' || v_lib_failed::text),
      jsonb_build_object('key','live','label','الحصص المباشرة / Zoom','status', CASE WHEN v_zoom_failed = 0 THEN 'ok' WHEN v_zoom_failed < 5 THEN 'warn' ELSE 'error' END,
        'detail','أحداث webhook فاشلة (24س): ' || v_zoom_failed::text),
      jsonb_build_object('key','payments','label','المدفوعات','status', CASE WHEN v_pending_payments = 0 THEN 'ok' WHEN v_pending_payments < 10 THEN 'warn' ELSE 'error' END,
        'detail','طلبات إيداع معلّقة أكثر من 24 ساعة: ' || v_pending_payments::text),
      jsonb_build_object('key','notifications','label','الإشعارات / Webhooks','status', CASE WHEN v_notif_failed = 0 THEN 'ok' WHEN v_notif_failed < 20 THEN 'warn' ELSE 'error' END,
        'detail','رسائل غير مُسلّمة (24س): ' || v_notif_failed::text)
    )
  );
END;
$$;

-- 18) Errors ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_errors(_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(_limit,30),1),100);
  v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.occurrences DESC), '[]'::jsonb) INTO v_rows FROM (
    SELECT 'AI / المعالجة' AS source, COALESCE(left(error, 160), 'خطأ غير معروف') AS message,
      count(*) AS occurrences, max(updated_at) AS last_seen
    FROM public.processing_jobs
    WHERE status = 'failed'::public.processing_job_status AND updated_at >= now() - interval '30 days'
    GROUP BY 2
    UNION ALL
    SELECT 'فهرسة المكتبة', COALESCE(left(last_error, 160), 'خطأ غير معروف'), count(*), max(updated_at)
    FROM public.library_processing_jobs
    WHERE state = 'failed' AND updated_at >= now() - interval '30 days'
    GROUP BY 2
    UNION ALL
    SELECT 'الإشعارات', COALESCE(left(error_message, 160), status), count(*), max(created_at)
    FROM public.notification_delivery_logs
    WHERE status <> 'sent' AND created_at >= now() - interval '30 days'
    GROUP BY 2
    UNION ALL
    SELECT 'Zoom Webhook', COALESCE(left(process_error, 160), 'خطأ غير معروف'), count(*), max(created_at)
    FROM public.zoom_webhook_events
    WHERE process_error IS NOT NULL AND created_at >= now() - interval '30 days'
    GROUP BY 2
    ORDER BY 3 DESC
    LIMIT v_limit
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- 19) Student 360 summary ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_monitoring_student_search(_search text, _limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  PERFORM public.assert_admin_caller();
  IF _search IS NULL OR length(trim(_search)) < 2 THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb);
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows FROM (
    SELECT p.id AS student_id, p.full_name AS student_name, p.student_code, p.stage, p.grade, p.education_type
    FROM public.profiles p
    WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'student'::public.app_role)
      AND (p.full_name ILIKE '%'||_search||'%' OR COALESCE(p.student_code,'') ILIKE '%'||_search||'%' OR p.id::text ILIKE '%'||_search||'%')
    ORDER BY p.full_name
    LIMIT LEAST(GREATEST(COALESCE(_limit,10),1),25)
  ) t;
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_monitoring_student_summary(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
BEGIN
  PERFORM public.assert_admin_caller();
  RETURN jsonb_build_object(
    'profile', (SELECT jsonb_build_object('student_id', p.id, 'student_name', p.full_name, 'student_code', p.student_code,
        'stage', p.stage, 'grade', p.grade, 'section', p.section, 'education_type', p.education_type,
        'created_at', p.created_at, 'is_banned', p.is_banned)
      FROM public.profiles p WHERE p.id = _student_id),
    'wallet_balance', (SELECT COALESCE(balance,0) FROM public.wallets WHERE user_id = _student_id),
    'subscriptions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'subject', sub.name, 'teacher', tp.full_name, 'is_active', s.is_active,
        'start_date', s.start_date, 'end_date', s.end_date)), '[]'::jsonb)
      FROM public.subscriptions s
      LEFT JOIN public.subjects sub ON sub.id = s.subject_id
      LEFT JOIN public.profiles tp ON tp.id = s.teacher_id
      WHERE s.student_id = _student_id),
    'ai', jsonb_build_object(
      'today', (SELECT COALESCE(sum(day_count),0) FROM public.ai_usage_counters WHERE user_id = _student_id AND usage_date = v_today),
      'd30', (SELECT COALESCE(sum(day_count),0) FROM public.ai_usage_counters WHERE user_id = _student_id AND usage_date >= v_today - 29),
      'last_used', (SELECT max(updated_at) FROM public.ai_usage_counters WHERE user_id = _student_id),
      'premium_until', public.student_ai_premium_until(_student_id)),
    'exams', (SELECT jsonb_build_object('attempts', count(*), 'avg_percentage', round(COALESCE(avg(percentage),0)::numeric,2),
        'best', max(percentage), 'last_attempt_at', max(COALESCE(submitted_at, created_at)))
      FROM public.exam_attempts WHERE student_id = _student_id),
    'activity', jsonb_build_object(
      'events_30d', (SELECT count(*) FROM public.student_activity_logs WHERE student_id = _student_id AND created_at >= now() - interval '30 days'),
      'last_activity', (SELECT max(created_at) FROM public.student_activity_logs WHERE student_id = _student_id)),
    'live_sessions', (SELECT count(*) FROM public.live_attendance WHERE student_id = _student_id)
  );
END;
$$;

-- 20) Execution grants: admin-only enforced inside each function ------
REVOKE ALL ON FUNCTION public.admin_monitoring_overview(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_ai_usage(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_active_students(timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_top_exam_students(timestamptz, timestamptz, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_subscriptions(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_wallets(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_alerts_list(boolean, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_mark_alerts_read(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_payments(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_teacher_activity(timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_inactive_students(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_anomalies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_errors(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_student_search(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_student_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_monitoring_set_thresholds(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_monitoring_overview(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_ai_usage(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_active_students(timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_top_exam_students(timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_subscriptions(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_wallets(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_alerts_list(boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_mark_alerts_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_payments(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_teacher_activity(timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_inactive_students(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_anomalies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_errors(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_student_search(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_student_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_set_thresholds(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_monitoring_thresholds() TO authenticated;