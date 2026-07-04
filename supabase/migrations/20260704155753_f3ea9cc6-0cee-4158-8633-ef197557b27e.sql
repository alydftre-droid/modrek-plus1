
-- 1) Harden is_test_student: also treat non-null test_account_code as a test account
CREATE OR REPLACE FUNCTION public.is_test_student(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (is_test_account = true) OR (test_account_code IS NOT NULL)
       FROM public.profiles WHERE id = _user_id),
    false
  );
$function$;

-- 2) Prevent student_activity_logs rows about test students from being visible-worthy: block insert of teacher_id-tagged logs for test students
CREATE OR REPLACE FUNCTION public.block_student_activity_log_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.is_test_student(NEW.student_id) THEN
    -- Silently drop teacher-linked logs; keep it invisible to teachers entirely.
    -- We still allow the row for admin/dev visibility by nulling teacher_id.
    NEW.teacher_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_student_activity_log_test_student_trg ON public.student_activity_logs;
CREATE TRIGGER block_student_activity_log_test_student_trg
BEFORE INSERT ON public.student_activity_logs
FOR EACH ROW EXECUTE FUNCTION public.block_student_activity_log_for_test_student();

-- 3) Belt-and-suspenders: on notifications insert, if metadata references a test student, and the notification recipient is a teacher, block it.
CREATE OR REPLACE FUNCTION public.block_teacher_notification_for_test_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student uuid;
BEGIN
  IF NEW.metadata IS NOT NULL THEN
    v_student := NULLIF(NEW.metadata->>'student_id', '')::uuid;
    IF v_student IS NOT NULL AND public.is_test_student(v_student) THEN
      -- If recipient is a teacher (has teacher role), drop the notification
      IF NEW.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'teacher'
      ) THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_teacher_notification_test_student_trg ON public.notifications;
CREATE TRIGGER block_teacher_notification_test_student_trg
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.block_teacher_notification_for_test_student();

-- 4) Admin-only audit function: returns any teacher-visible references to test students
CREATE OR REPLACE FUNCTION public.audit_test_student_visibility()
RETURNS TABLE(source text, row_count bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT 'student_group_purchases'::text, COUNT(*)::bigint
    FROM public.student_group_purchases sgp
   WHERE public.is_test_student(sgp.student_id)
  UNION ALL
  SELECT 'student_teacher_choices', COUNT(*)
    FROM public.student_teacher_choices stc
   WHERE public.is_test_student(stc.student_id)
     AND stc.teacher_id IS NOT NULL
  UNION ALL
  SELECT 'teacher_earning_records', COUNT(*)
    FROM public.teacher_earning_records
   WHERE public.is_test_student(student_id)
  UNION ALL
  SELECT 'teacher_messages', COUNT(*)
    FROM public.teacher_messages
   WHERE public.is_test_student(student_id)
  UNION ALL
  SELECT 'exam_attempts', COUNT(*)
    FROM public.exam_attempts
   WHERE public.is_test_student(student_id);
$$;

REVOKE ALL ON FUNCTION public.audit_test_student_visibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_test_student_visibility() TO authenticated, service_role;

-- 5) Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
