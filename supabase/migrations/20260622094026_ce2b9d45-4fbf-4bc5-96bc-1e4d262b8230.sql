
-- 1) Tighten profiles: drop broad teacher visibility, expose only safe columns via view
DROP POLICY IF EXISTS "Authenticated can view teacher base profiles" ON public.profiles;

CREATE OR REPLACE VIEW public.public_teacher_profiles
WITH (security_invoker = false) AS
SELECT id, full_name, avatar_url, teacher_code, role, education_type, stage, grade, section
FROM public.profiles
WHERE role = 'teacher';

GRANT SELECT ON public.public_teacher_profiles TO authenticated;

-- 2) Tighten teacher_requests: drop broad approved visibility, expose safe assignment fields via view
DROP POLICY IF EXISTS "Authenticated can view approved teacher requests" ON public.teacher_requests;

CREATE OR REPLACE VIEW public.approved_teacher_assignments
WITH (security_invoker = false) AS
SELECT user_id, assigned_grades, assigned_stages, assigned_category, education_type
FROM public.teacher_requests
WHERE status = 'approved';

GRANT SELECT ON public.approved_teacher_assignments TO authenticated;

-- 3) Storage subscription gating for books/videos/exams buckets
CREATE OR REPLACE FUNCTION public.has_content_storage_access(_bucket text, _name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _first text;
  _group uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_uid, 'admin'::app_role) THEN
    RETURN true;
  END IF;
  -- Teachers reading their own uploaded files
  IF EXISTS (
    SELECT 1 FROM public.content c
    WHERE c.uploaded_by = _uid
      AND (
        c.file_url LIKE '%' || _name || '%'
        OR COALESCE(c.thumbnail_url, '') LIKE '%' || _name || '%'
      )
  ) THEN
    RETURN true;
  END IF;
  _first := split_part(_name, '/', 1);
  -- Per-user AI lesson assets folder
  IF _first = 'ai-lessons' THEN
    RETURN true;
  END IF;
  BEGIN
    _group := _first::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1
    FROM public.content c
    WHERE c.group_id = _group
      AND (
        COALESCE(c.is_paid, false) = false
        OR EXISTS (
          SELECT 1 FROM public.student_group_purchases sgp
          WHERE sgp.student_id = _uid AND sgp.group_id = _group
        )
        OR (
          c.subject_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.student_id = _uid
              AND s.subject_id = c.subject_id
              AND s.is_active = true
              AND s.end_date > now()
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.bundled_package_subscription_groups bpsg
          JOIN public.bundled_package_subscriptions bps ON bps.id = bpsg.subscription_id
          WHERE bps.student_id = _uid AND bpsg.group_id = _group
        )
      )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_content_storage_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_content_storage_access(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated read books bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read videos bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read exams bucket" ON storage.objects;

CREATE POLICY "Subscribers read books bucket"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'books' AND public.has_content_storage_access('books', name));

CREATE POLICY "Subscribers read videos bucket"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'videos' AND public.has_content_storage_access('videos', name));

CREATE POLICY "Subscribers read exams bucket"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'exams' AND public.has_content_storage_access('exams', name));

-- 4) Revoke anon/public EXECUTE on SECURITY DEFINER functions in public schema
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
