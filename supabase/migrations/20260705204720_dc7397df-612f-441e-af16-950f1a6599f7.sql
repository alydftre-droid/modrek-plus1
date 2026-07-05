-- Harden developer test-student detection and teacher-facing isolation.

CREATE TABLE IF NOT EXISTS public.test_student_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id uuid,
  teacher_id uuid,
  student_id uuid,
  severity text NOT NULL DEFAULT 'critical',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL UNIQUE,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);
GRANT SELECT, UPDATE ON public.test_student_security_events TO authenticated;
GRANT ALL ON public.test_student_security_events TO service_role;
ALTER TABLE public.test_student_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer admins can view test student security events" ON public.test_student_security_events;
CREATE POLICY "Developer admins can view test student security events"
ON public.test_student_security_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_developer_admin(auth.uid()));

DROP POLICY IF EXISTS "Developer admins can acknowledge test student security events" ON public.test_student_security_events;
CREATE POLICY "Developer admins can acknowledge test student security events"
ON public.test_student_security_events
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_developer_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_developer_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_test_student_security_events_last_seen
ON public.test_student_security_events(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_student_security_events_teacher
ON public.test_student_security_events(teacher_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_student_security_events_student
ON public.test_student_security_events(student_id, last_seen_at DESC);

-- Some legacy test accounts were named as test students but were not flagged.
UPDATE public.profiles
SET is_test_account = true,
    test_account_code = COALESCE(NULLIF(test_account_code, ''), 'LEGACY-' || left(id::text, 8)),
    updated_at = now()
WHERE role = 'student'
  AND COALESCE(is_test_account, false) = false
  AND NULLIF(test_account_code, '') IS NULL
  AND full_name ILIKE '%تجريبي%';

CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT
        COALESCE(is_test_account, false) = true
        OR NULLIF(test_account_code, '') IS NOT NULL
        OR (COALESCE(role, '') = 'student' AND COALESCE(full_name, '') ILIKE '%تجريبي%')
      FROM public.profiles
      WHERE id = _user_id
    ),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_test_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_test_student(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teacher_wallet_tx_is_for_test_student(_metadata jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  student uuid;
  purchase uuid;
BEGIN
  IF _metadata IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    student := NULLIF(_metadata->>'student_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    student := NULL;
  END;

  IF student IS NOT NULL AND public.is_test_student(student) THEN
    RETURN true;
  END IF;

  BEGIN
    purchase := NULLIF(_metadata->>'purchase_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    purchase := NULL;
  END;

  IF purchase IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.id = purchase
        AND public.is_test_student(sgp.student_id)
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_wallet_tx_is_for_test_student(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_test_student_teacher_leak(
  _event_type text,
  _source_table text,
  _teacher_id uuid DEFAULT NULL,
  _student_id uuid DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fingerprint text;
  v_inserted boolean := false;
  v_admin uuid;
BEGIN
  v_fingerprint := md5(
    COALESCE(_event_type, '') || '|' ||
    COALESCE(_source_table, '') || '|' ||
    COALESCE(_teacher_id::text, '') || '|' ||
    COALESCE(_student_id::text, '') || '|' ||
    COALESCE(_source_id::text, '')
  );

  INSERT INTO public.test_student_security_events
    (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint)
  VALUES
    (_event_type, _source_table, _source_id, _teacher_id, _student_id, COALESCE(_details, '{}'::jsonb), v_fingerprint)
  ON CONFLICT (fingerprint) DO UPDATE
  SET occurrence_count = public.test_student_security_events.occurrence_count + 1,
      last_seen_at = now(),
      details = public.test_student_security_events.details || EXCLUDED.details
  RETURNING (xmax = 0) INTO v_inserted;

  IF COALESCE(v_inserted, false) THEN
    FOR v_admin IN
      SELECT DISTINCT p.id
      FROM public.profiles p
      WHERE p.email = 'alyedaft@gmail.com'
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
         )
    LOOP
      INSERT INTO public.notifications (user_id, title, message, notification_type, link, is_read, is_sent)
      VALUES (
        v_admin,
        'تنبيه أمني: محاولة ظهور طالب تجريبي للمعلم',
        'تم رصد ومنع تسريب بيانات طالب تجريبي ضمن نطاق معلم. راجع سجل حماية الحسابات التجريبية.',
        'security_alert',
        '/admin/test-students',
        false,
        true
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_test_student_teacher_leak(text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_test_student_teacher_leak(text, text, uuid, uuid, uuid, jsonb) TO service_role;

-- Log legacy contamination before removing it from teacher-facing tables.
INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_legacy_teacher_choice', 'student_teacher_choices', stc.id, stc.teacher_id, stc.student_id,
       jsonb_build_object('grade', stc.grade, 'stage', stc.stage, 'category', stc.category),
       md5('purged_legacy_teacher_choice|student_teacher_choices|' || COALESCE(stc.teacher_id::text,'') || '|' || stc.student_id::text || '|' || stc.id::text),
       1
FROM public.student_teacher_choices stc
WHERE public.is_test_student(stc.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_legacy_group_purchase', 'student_group_purchases', sgp.id, COALESCE(cg.teacher_id, cg.created_by), sgp.student_id,
       jsonb_build_object('group_id', sgp.group_id, 'amount_paid', sgp.amount_paid),
       md5('purged_legacy_group_purchase|student_group_purchases|' || COALESCE(COALESCE(cg.teacher_id, cg.created_by)::text,'') || '|' || sgp.student_id::text || '|' || sgp.id::text),
       1
FROM public.student_group_purchases sgp
LEFT JOIN public.content_groups cg ON cg.id = sgp.group_id
WHERE public.is_test_student(sgp.student_id)
  AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_legacy_teacher_message', 'teacher_messages', tm.id, tm.teacher_id, tm.student_id,
       jsonb_build_object('is_from_teacher', tm.is_from_teacher),
       md5('purged_legacy_teacher_message|teacher_messages|' || COALESCE(tm.teacher_id::text,'') || '|' || tm.student_id::text || '|' || tm.id::text),
       1
FROM public.teacher_messages tm
WHERE public.is_test_student(tm.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_legacy_teacher_earning', 'teacher_earning_records', ter.id, ter.teacher_id, ter.student_id,
       jsonb_build_object('purchase_id', ter.purchase_id, 'group_id', ter.group_id, 'net_amount', ter.net_amount, 'is_frozen', ter.is_frozen, 'is_archived', ter.is_archived),
       md5('purged_legacy_teacher_earning|teacher_earning_records|' || COALESCE(ter.teacher_id::text,'') || '|' || ter.student_id::text || '|' || ter.id::text),
       1
FROM public.teacher_earning_records ter
WHERE public.is_test_student(ter.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

-- Remove fake earnings from teacher wallet aggregates before deleting rows.
WITH bad AS (
  SELECT teacher_id,
         COALESCE(SUM(net_amount), 0) AS total_net,
         COALESCE(SUM(net_amount) FILTER (WHERE COALESCE(is_frozen, false) = true AND COALESCE(is_archived, false) = false), 0) AS frozen_net,
         COALESCE(SUM(net_amount) FILTER (WHERE COALESCE(is_archived, false) = true OR COALESCE(is_frozen, false) = false), 0) AS available_net
  FROM public.teacher_earning_records
  WHERE public.is_test_student(student_id)
  GROUP BY teacher_id
)
UPDATE public.teacher_wallets tw
SET total_earned = GREATEST(0, COALESCE(tw.total_earned, 0) - bad.total_net),
    frozen_balance = GREATEST(0, COALESCE(tw.frozen_balance, 0) - bad.frozen_net),
    balance = GREATEST(0, COALESCE(tw.balance, 0) - bad.available_net),
    updated_at = now()
FROM bad
WHERE tw.teacher_id = bad.teacher_id;

-- Recalculate archive totals from non-test earning records for affected teachers/periods.
WITH affected AS (
  SELECT DISTINCT teacher_id, period_label
  FROM public.teacher_earning_records
  WHERE public.is_test_student(student_id)
), recalculated AS (
  SELECT a.teacher_id,
         a.period_label,
         COALESCE(SUM(ter.net_amount), 0) AS total_earned,
         COUNT(DISTINCT ter.student_id)::int AS total_subscribers,
         COUNT(DISTINCT ter.group_id)::int AS total_groups
  FROM affected a
  LEFT JOIN public.teacher_earning_records ter
    ON ter.teacher_id = a.teacher_id
   AND ter.period_label = a.period_label
   AND NOT public.is_test_student(ter.student_id)
  GROUP BY a.teacher_id, a.period_label
)
UPDATE public.teacher_monthly_archives tma
SET total_earned = recalculated.total_earned,
    total_subscribers = recalculated.total_subscribers,
    total_groups = recalculated.total_groups,
    archived_at = now()
FROM recalculated
WHERE tma.teacher_id = recalculated.teacher_id
  AND tma.period_label = recalculated.period_label;

DELETE FROM public.teacher_wallet_transactions twt
WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata);
DELETE FROM public.teacher_earning_records ter
WHERE public.is_test_student(ter.student_id);
DELETE FROM public.teacher_messages tm
WHERE public.is_test_student(tm.student_id);
DELETE FROM public.student_group_purchases sgp
WHERE public.is_test_student(sgp.student_id);
DELETE FROM public.student_teacher_choices stc
WHERE public.is_test_student(stc.student_id);

CREATE OR REPLACE FUNCTION public.block_teacher_choice_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_choice',
      'student_teacher_choices',
      NEW.teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('grade', NEW.grade, 'stage', NEW.stage, 'category', NEW.category)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_choice_test_student_trg ON public.student_teacher_choices;
CREATE TRIGGER block_teacher_choice_test_student_trg
BEFORE INSERT OR UPDATE ON public.student_teacher_choices
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_choice_for_test_student();

CREATE OR REPLACE FUNCTION public.block_group_purchase_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_teacher_id uuid;
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    SELECT COALESCE(teacher_id, created_by) INTO v_teacher_id
    FROM public.content_groups
    WHERE id = NEW.group_id;

    PERFORM public.log_test_student_teacher_leak(
      'blocked_group_purchase',
      'student_group_purchases',
      v_teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('group_id', NEW.group_id, 'amount_paid', NEW.amount_paid)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_group_purchase_test_student_trg ON public.student_group_purchases;
CREATE TRIGGER block_group_purchase_test_student_trg
BEFORE INSERT OR UPDATE ON public.student_group_purchases
FOR EACH ROW
EXECUTE FUNCTION public.block_group_purchase_for_test_student();

CREATE OR REPLACE FUNCTION public.block_teacher_message_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_message',
      'teacher_messages',
      NEW.teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('is_from_teacher', NEW.is_from_teacher)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_message_test_student_trg ON public.teacher_messages;
CREATE TRIGGER block_teacher_message_test_student_trg
BEFORE INSERT OR UPDATE ON public.teacher_messages
FOR EACH ROW
EXECUTE FUNCTION public.block_teacher_message_for_test_student();

CREATE OR REPLACE FUNCTION public.block_earning_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    PERFORM public.log_test_student_teacher_leak(
      'blocked_teacher_earning',
      'teacher_earning_records',
      NEW.teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('purchase_id', NEW.purchase_id, 'group_id', NEW.group_id, 'net_amount', NEW.net_amount)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_earning_for_test_student_trg ON public.teacher_earning_records;
CREATE TRIGGER block_earning_for_test_student_trg
BEFORE INSERT OR UPDATE ON public.teacher_earning_records
FOR EACH ROW
EXECUTE FUNCTION public.block_earning_for_test_student();

-- Replace broad/old teacher-facing policies with non-test-only policies.
DROP POLICY IF EXISTS "Teachers can view choices for them" ON public.student_teacher_choices;
CREATE POLICY "Teachers can view choices for them"
ON public.student_teacher_choices
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can insert their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can insert their own choice"
ON public.student_teacher_choices
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can update their own choice" ON public.student_teacher_choices;
CREATE POLICY "Students can update their own choice"
ON public.student_teacher_choices
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id))
WITH CHECK (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can view their own choices" ON public.student_teacher_choices;
CREATE POLICY "Students can view their own choices"
ON public.student_teacher_choices
FOR SELECT
TO authenticated
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers can view purchases for their groups" ON public.student_group_purchases;
CREATE POLICY "Teachers can view purchases for their groups"
ON public.student_group_purchases
FOR SELECT
TO authenticated
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.content_groups
    WHERE content_groups.id = student_group_purchases.group_id
      AND (content_groups.teacher_id = auth.uid() OR content_groups.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Students see own purchases" ON public.student_group_purchases;
CREATE POLICY "Students see own purchases"
ON public.student_group_purchases
FOR SELECT
TO authenticated
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can insert own purchases" ON public.student_group_purchases;
CREATE POLICY "Students can insert own purchases"
ON public.student_group_purchases
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers can view their messages" ON public.teacher_messages;
CREATE POLICY "Teachers can view their messages"
ON public.teacher_messages
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can view their messages" ON public.teacher_messages;
CREATE POLICY "Students can view their messages"
ON public.teacher_messages
FOR SELECT
TO authenticated
USING (auth.uid() = student_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Students can send messages" ON public.teacher_messages;
CREATE POLICY "Students can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id AND is_from_teacher = false AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers can send messages" ON public.teacher_messages;
CREATE POLICY "Teachers can send messages"
ON public.teacher_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = teacher_id AND is_from_teacher = true AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.teacher_messages;
CREATE POLICY "Users can mark messages as read"
ON public.teacher_messages
FOR UPDATE
TO authenticated
USING (((auth.uid() = student_id) OR (auth.uid() = teacher_id)) AND NOT public.is_test_student(student_id))
WITH CHECK (((auth.uid() = student_id) OR (auth.uid() = teacher_id)) AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers view own earnings" ON public.teacher_earning_records;
CREATE POLICY "Teachers view own earnings"
ON public.teacher_earning_records
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id AND NOT public.is_test_student(student_id));

DROP POLICY IF EXISTS "Teachers view own transactions" ON public.teacher_wallet_transactions;
CREATE POLICY "Teachers view own transactions"
ON public.teacher_wallet_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id AND NOT public.teacher_wallet_tx_is_for_test_student(metadata));

DROP POLICY IF EXISTS "Teachers can view linked non-test student profiles" ON public.profiles;
CREATE POLICY "Teachers can view linked non-test student profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  role = 'student'
  AND NOT public.is_test_student(id)
  AND (
    EXISTS (SELECT 1 FROM public.student_teacher_choices stc WHERE stc.student_id = profiles.id AND stc.teacher_id = auth.uid() AND NOT public.is_test_student(stc.student_id))
    OR EXISTS (SELECT 1 FROM public.student_group_purchases sgp JOIN public.content_groups cg ON cg.id = sgp.group_id WHERE sgp.student_id = profiles.id AND COALESCE(cg.teacher_id, cg.created_by) = auth.uid() AND NOT public.is_test_student(sgp.student_id))
    OR EXISTS (SELECT 1 FROM public.teacher_messages tm WHERE tm.student_id = profiles.id AND tm.teacher_id = auth.uid() AND NOT public.is_test_student(tm.student_id))
  )
);

CREATE OR REPLACE FUNCTION public.audit_test_student_visibility()
RETURNS TABLE(source text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'student_teacher_choices'::text, COUNT(*)::bigint
    FROM public.student_teacher_choices stc
   WHERE public.is_test_student(stc.student_id)
     AND stc.teacher_id IS NOT NULL
  UNION ALL
  SELECT 'student_group_purchases', COUNT(*)::bigint
    FROM public.student_group_purchases sgp
    JOIN public.content_groups cg ON cg.id = sgp.group_id
   WHERE public.is_test_student(sgp.student_id)
     AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL
  UNION ALL
  SELECT 'teacher_messages', COUNT(*)::bigint
    FROM public.teacher_messages tm
   WHERE public.is_test_student(tm.student_id)
  UNION ALL
  SELECT 'teacher_earning_records', COUNT(*)::bigint
    FROM public.teacher_earning_records ter
   WHERE public.is_test_student(ter.student_id)
  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint
    FROM public.teacher_wallet_transactions twt
   WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)
  UNION ALL
  SELECT 'unflagged_named_test_profiles', COUNT(*)::bigint
    FROM public.profiles p
   WHERE COALESCE(p.role, '') = 'student'
     AND COALESCE(p.full_name, '') ILIKE '%تجريبي%'
     AND NOT public.is_test_student(p.id);
$$;

REVOKE ALL ON FUNCTION public.audit_test_student_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_test_student_visibility() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teacher_test_student_query_regression()
RETURNS TABLE(scenario text, leaked_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'grade_all_students'::text, COUNT(*)::bigint
  FROM public.student_teacher_choices stc
  JOIN public.profiles p ON p.id = stc.student_id
  WHERE public.is_test_student(stc.student_id)
    AND stc.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'grade_subscribed_students', COUNT(*)::bigint
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  JOIN public.profiles p ON p.id = sgp.student_id
  WHERE public.is_test_student(sgp.student_id)
    AND COALESCE(cg.teacher_id, cg.created_by) IS NOT NULL

  UNION ALL
  SELECT 'message_threads', COUNT(*)::bigint
  FROM public.teacher_messages tm
  JOIN public.profiles p ON p.id = tm.student_id
  WHERE public.is_test_student(tm.student_id)
    AND tm.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'teacher_earnings', COUNT(*)::bigint
  FROM public.teacher_earning_records ter
  JOIN public.profiles p ON p.id = ter.student_id
  WHERE public.is_test_student(ter.student_id)
    AND ter.teacher_id IS NOT NULL

  UNION ALL
  SELECT 'teacher_wallet_transactions', COUNT(*)::bigint
  FROM public.teacher_wallet_transactions twt
  WHERE public.teacher_wallet_tx_is_for_test_student(twt.metadata)

  UNION ALL
  SELECT 'unflagged_legacy_named_test_accounts', COUNT(*)::bigint
  FROM public.profiles p
  WHERE COALESCE(p.role, '') = 'student'
    AND COALESCE(p.full_name, '') ILIKE '%تجريبي%'
    AND NOT public.is_test_student(p.id);
$$;

REVOKE ALL ON FUNCTION public.teacher_test_student_query_regression() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_test_student_query_regression() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';