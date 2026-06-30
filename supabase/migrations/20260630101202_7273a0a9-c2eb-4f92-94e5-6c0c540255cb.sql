
-- 1) Profiles: block self role escalation via trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_change_trg ON public.profiles;
CREATE TRIGGER prevent_profile_role_change_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_change();

-- Defensive: reset any non-admin profile rows whose role does not match user_roles
-- (no-op if data already consistent; safe to skip if uncertain)

-- 2) teacher_requests: replace admin policy with has_role check
DROP POLICY IF EXISTS "admin manage teacher_requests" ON public.teacher_requests;
CREATE POLICY "Admins manage teacher_requests"
ON public.teacher_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) exam_questions: restrict student SELECT to exams that allow showing answers
DROP POLICY IF EXISTS "Students view questions after submitting attempt" ON public.exam_questions;
CREATE POLICY "Students view questions after submitting attempt"
ON public.exam_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_attempts a
    JOIN public.exams e ON e.id = a.exam_id
    WHERE a.exam_id = exam_questions.exam_id
      AND a.student_id = auth.uid()
      AND a.submitted_at IS NOT NULL
      AND COALESCE(e.show_correct_answers, false) = true
  )
);

-- 4) ai-lesson-pages bucket: subscription-scoped read access
CREATE OR REPLACE FUNCTION public.has_ai_lesson_page_access(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _lesson uuid;
  _subject uuid;
  _group uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;

  BEGIN
    _lesson := split_part(_name, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  SELECT subject_id, group_id INTO _subject, _group
  FROM public.ai_lessons WHERE id = _lesson;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ai_lessons WHERE id = _lesson AND created_by = _uid) THEN
    RETURN true;
  END IF;

  IF _subject IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.student_id = _uid
      AND s.subject_id = _subject
      AND s.is_active = true
      AND s.end_date > now()
  ) THEN
    RETURN true;
  END IF;

  IF _group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_group_purchases sgp
    WHERE sgp.student_id = _uid AND sgp.group_id = _group
  ) THEN
    RETURN true;
  END IF;

  IF _group IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bundled_package_subscription_groups bpsg
    JOIN public.bundled_package_subscriptions bps ON bps.id = bpsg.subscription_id
    WHERE bps.student_id = _uid AND bpsg.group_id = _group
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Authenticated can view ai lesson pages images" ON storage.objects;
CREATE POLICY "Subscribers can view ai lesson pages images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ai-lesson-pages'
  AND public.has_ai_lesson_page_access(name)
);
