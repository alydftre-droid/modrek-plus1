-- =========================================================
-- 1. Approved-teacher source of truth (database level)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_approved_teacher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin'::public.app_role) THEN true
    ELSE (
      public.has_role(_user_id, 'teacher'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.teacher_requests tr
        WHERE tr.user_id = _user_id
          AND tr.status = 'approved'::public.approval_status
      )
    )
  END
$$;

REVOKE ALL ON FUNCTION public.is_approved_teacher(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_teacher(uuid) TO authenticated, service_role;

-- =========================================================
-- 2. Seed real admin rows BEFORE removing hardcoded emails
-- =========================================================
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'admin'::public.app_role
FROM auth.users au
WHERE lower(coalesce(au.email,'')) IN ('alyedaft@gmail.com','aliana200713@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2b. has_role now depends on data only (no hardcoded backdoor emails)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = _role
    )
  END
$$;

-- =========================================================
-- 3. content: writes require an APPROVED teacher (or admin)
-- =========================================================
DROP POLICY IF EXISTS "Teachers can insert current-term content" ON public.content;
CREATE POLICY "Approved teachers insert current-term content"
ON public.content FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by
  AND public.is_approved_teacher(auth.uid())
  AND COALESCE(type,'') <> 'student_library'
  AND term_item_matches_current_system_term(subject_id, group_id, term)
);

DROP POLICY IF EXISTS "Teachers can update own current-term content" ON public.content;
CREATE POLICY "Approved teachers update own current-term content"
ON public.content FOR UPDATE TO authenticated
USING (
  auth.uid() = uploaded_by
  AND public.is_approved_teacher(auth.uid())
  AND COALESCE(type,'') <> 'student_library'
  AND term_item_matches_current_system_term(subject_id, group_id, term)
)
WITH CHECK (
  auth.uid() = uploaded_by
  AND public.is_approved_teacher(auth.uid())
  AND COALESCE(type,'') <> 'student_library'
  AND term_item_matches_current_system_term(subject_id, group_id, term)
);

DROP POLICY IF EXISTS "Teachers can delete own content" ON public.content;
CREATE POLICY "Approved teachers delete own content"
ON public.content FOR DELETE TO authenticated
USING (
  auth.uid() = uploaded_by
  AND public.is_approved_teacher(auth.uid())
  AND COALESCE(type,'') <> 'student_library'
);

-- =========================================================
-- 4. content_groups
-- =========================================================
DROP POLICY IF EXISTS "Teachers can create own current-term groups" ON public.content_groups;
CREATE POLICY "Approved teachers create own current-term groups"
ON public.content_groups FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND public.is_approved_teacher(auth.uid())
  AND (teacher_id IS NULL OR auth.uid() = teacher_id)
  AND group_matches_current_system_term(subject_id, term)
);

DROP POLICY IF EXISTS "Teachers can update own current-term groups" ON public.content_groups;
CREATE POLICY "Approved teachers update own current-term groups"
ON public.content_groups FOR UPDATE TO authenticated
USING (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND public.is_approved_teacher(auth.uid())
  AND group_matches_current_system_term(subject_id, term)
)
WITH CHECK (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND public.is_approved_teacher(auth.uid())
  AND group_matches_current_system_term(subject_id, term)
);

DROP POLICY IF EXISTS "Teachers can delete own groups" ON public.content_groups;
CREATE POLICY "Approved teachers delete own groups"
ON public.content_groups FOR DELETE TO authenticated
USING (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND public.is_approved_teacher(auth.uid())
);

-- =========================================================
-- 5. exams + questions + options
-- =========================================================
DROP POLICY IF EXISTS "Teachers can create own current-term exams" ON public.exams;
CREATE POLICY "Approved teachers create own current-term exams"
ON public.exams FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND public.is_approved_teacher(auth.uid())
  AND term_item_matches_current_system_term(subject_id, group_id, term)
);

DROP POLICY IF EXISTS "Teachers can update own current-term exams" ON public.exams;
CREATE POLICY "Approved teachers update own current-term exams"
ON public.exams FOR UPDATE TO authenticated
USING (
  auth.uid() = teacher_id
  AND public.is_approved_teacher(auth.uid())
  AND term_item_matches_current_system_term(subject_id, group_id, term)
)
WITH CHECK (
  auth.uid() = teacher_id
  AND public.is_approved_teacher(auth.uid())
  AND term_item_matches_current_system_term(subject_id, group_id, term)
);

DROP POLICY IF EXISTS "Teachers manage own exam questions" ON public.exam_questions;
CREATE POLICY "Approved teachers manage own exam questions"
ON public.exam_questions FOR ALL TO authenticated
USING (
  public.is_approved_teacher(auth.uid())
  AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
)
WITH CHECK (
  public.is_approved_teacher(auth.uid())
  AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_questions.exam_id AND e.teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Teachers manage own question options" ON public.exam_question_options;
CREATE POLICY "Approved teachers manage own question options"
ON public.exam_question_options FOR ALL TO authenticated
USING (
  public.is_approved_teacher(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id
    WHERE q.id = exam_question_options.question_id AND e.teacher_id = auth.uid()
  )
)
WITH CHECK (
  public.is_approved_teacher(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.exam_questions q
    JOIN public.exams e ON e.id = q.exam_id
    WHERE q.id = exam_question_options.question_id AND e.teacher_id = auth.uid()
  )
);

-- =========================================================
-- 6. group_weekly_schedule: writes need approved teacher,
--    reads need entitlement (teacher / purchaser / admin)
-- =========================================================
DROP POLICY IF EXISTS "Teachers manage own group schedules" ON public.group_weekly_schedule;
CREATE POLICY "Approved teachers manage own group schedules"
ON public.group_weekly_schedule FOR ALL TO authenticated
USING (
  public.is_approved_teacher(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.content_groups g
    WHERE g.id = group_weekly_schedule.group_id
      AND (g.teacher_id = auth.uid() OR g.created_by = auth.uid())
  )
)
WITH CHECK (
  public.is_approved_teacher(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.content_groups g
    WHERE g.id = group_weekly_schedule.group_id
      AND (g.teacher_id = auth.uid() OR g.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Schedules visible with their group" ON public.group_weekly_schedule;
CREATE POLICY "Entitled users view group schedules"
ON public.group_weekly_schedule FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.content_groups g
    WHERE g.id = group_weekly_schedule.group_id
      AND (
        g.teacher_id = auth.uid()
        OR g.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.student_group_purchases sgp
          WHERE sgp.group_id = g.id AND sgp.student_id = auth.uid()
        )
      )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- =========================================================
-- 7. knowledge_lesson_index: admin-only reads (internal index)
-- =========================================================
DROP POLICY IF EXISTS "Authenticated read lesson index" ON public.knowledge_lesson_index;
CREATE POLICY "Admins read lesson index"
ON public.knowledge_lesson_index FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================================================
-- 8. get_email_by_phone: no longer reachable by anon/authenticated
--    (moved behind a rate-limited edge function using service_role)
-- =========================================================
REVOKE ALL ON FUNCTION public.get_email_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_by_phone(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_email_by_phone(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.login_lookup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  phone_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_lookup_attempts_ip_time_idx
  ON public.login_lookup_attempts (ip_hash, created_at DESC);

GRANT ALL ON public.login_lookup_attempts TO service_role;
ALTER TABLE public.login_lookup_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read login lookup attempts"
ON public.login_lookup_attempts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =========================================================
-- 9. Per-user AI quota enforcement (server side)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.ai_rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_rate_limit_events_lookup_idx
  ON public.ai_rate_limit_events (user_id, function_name, created_at DESC);

GRANT ALL ON public.ai_rate_limit_events TO service_role;
ALTER TABLE public.ai_rate_limit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own ai rate events"
ON public.ai_rate_limit_events FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.ai_rate_limit_consume(
  _user_id uuid,
  _function_name text,
  _max_per_hour integer DEFAULT 40,
  _max_per_day integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  hourly integer;
  daily integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_user');
  END IF;

  IF public.has_role(_user_id, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin');
  END IF;

  SELECT count(*) INTO hourly
  FROM public.ai_rate_limit_events
  WHERE user_id = _user_id AND function_name = _function_name
    AND created_at > now() - interval '1 hour';

  SELECT count(*) INTO daily
  FROM public.ai_rate_limit_events
  WHERE user_id = _user_id AND function_name = _function_name
    AND created_at > now() - interval '24 hours';

  IF hourly >= GREATEST(_max_per_hour, 1) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'hourly_limit', 'hourly', hourly, 'daily', daily);
  END IF;
  IF daily >= GREATEST(_max_per_day, 1) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'hourly', hourly, 'daily', daily);
  END IF;

  INSERT INTO public.ai_rate_limit_events (user_id, function_name) VALUES (_user_id, _function_name);
  RETURN jsonb_build_object('allowed', true, 'hourly', hourly + 1, 'daily', daily + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_rate_limit_consume(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_rate_limit_consume(uuid, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_ai_rate_limit_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.ai_rate_limit_events WHERE created_at < now() - interval '3 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_ai_rate_limit_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_rate_limit_events() TO service_role;