-- Close remaining teacher-facing test-student leak surfaces: exam answers and live sessions

DROP POLICY IF EXISTS "Teachers view answers on their exams" ON public.exam_answers;
CREATE POLICY "Teachers view answers on their exams"
ON public.exam_answers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = exam_answers.attempt_id
      AND e.teacher_id = auth.uid()
      AND NOT public.is_test_student(a.student_id)
  )
);

DROP POLICY IF EXISTS "Teachers grade answers on their exams" ON public.exam_answers;
CREATE POLICY "Teachers grade answers on their exams"
ON public.exam_answers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = exam_answers.attempt_id
      AND e.teacher_id = auth.uid()
      AND NOT public.is_test_student(a.student_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.id = exam_answers.attempt_id
      AND e.teacher_id = auth.uid()
      AND NOT public.is_test_student(a.student_id)
  )
);

DROP POLICY IF EXISTS "Students can send session messages" ON public.live_session_messages;
CREATE POLICY "Students can send session messages"
ON public.live_session_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND is_teacher = false
  AND NOT public.is_test_student(user_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    JOIN public.student_group_purchases sgp ON sgp.group_id = ls.group_id
    WHERE ls.id = live_session_messages.session_id
      AND sgp.student_id = auth.uid()
      AND NOT public.is_test_student(sgp.student_id)
  )
);

DROP POLICY IF EXISTS "Students can view session messages" ON public.live_session_messages;
CREATE POLICY "Students can view session messages"
ON public.live_session_messages
FOR SELECT
TO authenticated
USING (
  NOT public.is_test_student(user_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    JOIN public.student_group_purchases sgp ON sgp.group_id = ls.group_id
    WHERE ls.id = live_session_messages.session_id
      AND sgp.student_id = auth.uid()
      AND NOT public.is_test_student(sgp.student_id)
  )
);

DROP POLICY IF EXISTS "Teachers manage own session messages" ON public.live_session_messages;
CREATE POLICY "Teachers manage own session messages"
ON public.live_session_messages
FOR ALL
TO authenticated
USING (
  NOT public.is_test_student(user_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions
    WHERE live_sessions.id = live_session_messages.session_id
      AND live_sessions.teacher_id = auth.uid()
  )
)
WITH CHECK (
  NOT public.is_test_student(user_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions
    WHERE live_sessions.id = live_session_messages.session_id
      AND live_sessions.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Students can view actions for their sessions" ON public.live_session_actions;
CREATE POLICY "Students can view actions for their sessions"
ON public.live_session_actions
FOR SELECT
TO authenticated
USING (
  auth.uid() = student_id
  AND NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions ls
    JOIN public.content_groups cg ON cg.id = ls.group_id
    JOIN public.subscriptions s ON s.subject_id = cg.subject_id AND s.student_id = auth.uid() AND s.is_active = true
    WHERE ls.id = live_session_actions.session_id
  )
);

DROP POLICY IF EXISTS "Teachers manage actions for own sessions" ON public.live_session_actions;
CREATE POLICY "Teachers manage actions for own sessions"
ON public.live_session_actions
FOR ALL
TO authenticated
USING (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions
    WHERE live_sessions.id = live_session_actions.session_id
      AND live_sessions.teacher_id = auth.uid()
  )
)
WITH CHECK (
  NOT public.is_test_student(student_id)
  AND EXISTS (
    SELECT 1
    FROM public.live_sessions
    WHERE live_sessions.id = live_session_actions.session_id
      AND live_sessions.teacher_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.block_live_session_message_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_teacher_id uuid;
BEGIN
  IF NEW.user_id IS NOT NULL AND public.is_test_student(NEW.user_id) THEN
    SELECT teacher_id INTO v_teacher_id
    FROM public.live_sessions
    WHERE id = NEW.session_id;

    PERFORM public.log_test_student_teacher_leak(
      'blocked_live_session_message',
      'live_session_messages',
      v_teacher_id,
      NEW.user_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('session_id', NEW.session_id, 'is_teacher', NEW.is_teacher)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_live_session_message_test_student_trg ON public.live_session_messages;
CREATE TRIGGER block_live_session_message_test_student_trg
BEFORE INSERT OR UPDATE ON public.live_session_messages
FOR EACH ROW
EXECUTE FUNCTION public.block_live_session_message_for_test_student();

CREATE OR REPLACE FUNCTION public.block_live_session_action_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_teacher_id uuid;
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    SELECT teacher_id INTO v_teacher_id
    FROM public.live_sessions
    WHERE id = NEW.session_id;

    PERFORM public.log_test_student_teacher_leak(
      'blocked_live_session_action',
      'live_session_actions',
      v_teacher_id,
      NEW.student_id,
      COALESCE(NEW.id, gen_random_uuid()),
      jsonb_build_object('session_id', NEW.session_id, 'action', NEW.action)
    );
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_live_session_action_test_student_trg ON public.live_session_actions;
CREATE TRIGGER block_live_session_action_test_student_trg
BEFORE INSERT OR UPDATE ON public.live_session_actions
FOR EACH ROW
EXECUTE FUNCTION public.block_live_session_action_for_test_student();

-- Log and purge any existing teacher-facing live-session contamination.
INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_live_session_message', 'live_session_messages', lsm.id, ls.teacher_id, lsm.user_id,
       jsonb_build_object('session_id', lsm.session_id, 'is_teacher', lsm.is_teacher),
       md5('purged_existing_live_session_message|live_session_messages|' || COALESCE(ls.teacher_id::text,'') || '|' || lsm.user_id::text || '|' || lsm.id::text),
       1
FROM public.live_session_messages lsm
LEFT JOIN public.live_sessions ls ON ls.id = lsm.session_id
WHERE public.is_test_student(lsm.user_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

INSERT INTO public.test_student_security_events
  (event_type, source_table, source_id, teacher_id, student_id, details, fingerprint, occurrence_count)
SELECT 'purged_existing_live_session_action', 'live_session_actions', lsa.id, ls.teacher_id, lsa.student_id,
       jsonb_build_object('session_id', lsa.session_id, 'action', lsa.action),
       md5('purged_existing_live_session_action|live_session_actions|' || COALESCE(ls.teacher_id::text,'') || '|' || lsa.student_id::text || '|' || lsa.id::text),
       1
FROM public.live_session_actions lsa
LEFT JOIN public.live_sessions ls ON ls.id = lsa.session_id
WHERE public.is_test_student(lsa.student_id)
ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = public.test_student_security_events.occurrence_count + 1, last_seen_at = now();

DELETE FROM public.live_session_messages lsm
WHERE public.is_test_student(lsm.user_id);

DELETE FROM public.live_session_actions lsa
WHERE public.is_test_student(lsa.student_id);

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
  SELECT 'exam_answers', COUNT(*)::bigint
    FROM public.exam_answers ea
    JOIN public.exam_attempts a ON a.id = ea.attempt_id
    JOIN public.exams e ON e.id = a.exam_id
   WHERE public.is_test_student(a.student_id)
     AND e.teacher_id IS NOT NULL
  UNION ALL
  SELECT 'live_session_messages', COUNT(*)::bigint
    FROM public.live_session_messages lsm
    JOIN public.live_sessions ls ON ls.id = lsm.session_id
   WHERE public.is_test_student(lsm.user_id)
     AND ls.teacher_id IS NOT NULL
  UNION ALL
  SELECT 'live_session_actions', COUNT(*)::bigint
    FROM public.live_session_actions lsa
    JOIN public.live_sessions ls ON ls.id = lsa.session_id
   WHERE public.is_test_student(lsa.student_id)
     AND ls.teacher_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.audit_test_student_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_test_student_visibility() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';