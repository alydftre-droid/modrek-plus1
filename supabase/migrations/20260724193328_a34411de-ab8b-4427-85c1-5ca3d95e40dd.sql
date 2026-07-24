-- Force PostgREST / Data API schema cache to see the literary catalog RPCs.
-- The functions already exist in the database, but published app requests can fail with PGRST202
-- when the API schema cache has not picked up the new signatures.

DROP FUNCTION IF EXISTS public.get_literary_student_group_content_catalog(uuid);

CREATE OR REPLACE FUNCTION public.get_literary_student_group_content_catalog(_group_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  type text,
  file_url text,
  thumbnail_url text,
  description text,
  created_at timestamptz,
  is_paid boolean,
  is_free_preview boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject text,
  sub_subject_id uuid,
  is_accessible boolean,
  education_type text,
  subject_section text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  student_profile record;
  requested_group record;
  has_direct_rows boolean := false;
  has_group_access boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.role, p.stage, p.education_type, p.section, p.grade
    INTO student_profile
  FROM public.profiles p
  WHERE p.id = current_user_id;

  IF student_profile.id IS NULL OR student_profile.role <> 'student' THEN
    RAISE EXCEPTION 'Student profile required' USING ERRCODE = '42501';
  END IF;

  SELECT tg.id, tg.teacher_id, tg.subject_id, tg.academic_term, s.grade_level, s.education_type, s.section
    INTO requested_group
  FROM public.teacher_groups tg
  LEFT JOIN public.subjects s ON s.id = tg.subject_id
  WHERE tg.id = _group_id;

  IF requested_group.id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_subscriptions gs
    WHERE gs.group_id = _group_id
      AND gs.student_id = current_user_id
      AND gs.status = 'active'
      AND (gs.expires_at IS NULL OR gs.expires_at > now())
  ) INTO has_group_access;

  SELECT EXISTS (
    SELECT 1
    FROM public.content c
    WHERE c.group_id = _group_id
      AND COALESCE(c.is_hidden, false) = false
      AND (
        c.target_section IS NULL
        OR c.target_section = 'literary'
        OR c.target_section = student_profile.section
      )
  ) INTO has_direct_rows;

  RETURN QUERY
  WITH eligible_groups AS (
    SELECT tg.id
    FROM public.teacher_groups tg
    LEFT JOIN public.subjects s ON s.id = tg.subject_id
    WHERE (
      (has_direct_rows AND tg.id = _group_id)
      OR (
        NOT has_direct_rows
        AND tg.teacher_id = requested_group.teacher_id
        AND COALESCE(tg.academic_term, '') = COALESCE(requested_group.academic_term, '')
        AND (
          tg.subject_id = requested_group.subject_id
          OR EXISTS (
            SELECT 1
            FROM public.subjects rs
            JOIN public.subjects gs ON gs.id = tg.subject_id
            WHERE rs.id = requested_group.subject_id
              AND lower(trim(COALESCE(rs.name, ''))) = lower(trim(COALESCE(gs.name, '')))
              AND COALESCE(rs.grade_level, '') = COALESCE(gs.grade_level, '')
          )
        )
      )
    )
      AND (
        student_profile.stage IS NULL
        OR s.grade_level IS NULL
        OR s.grade_level = student_profile.stage
        OR s.grade_level = student_profile.grade
      )
      AND (
        s.education_type IS NULL
        OR student_profile.education_type IS NULL
        OR s.education_type = student_profile.education_type
        OR s.education_type = 'عام'
      )
      AND (
        s.section IS NULL
        OR student_profile.section IS NULL
        OR s.section = student_profile.section
        OR s.section = 'literary'
      )
  )
  SELECT
    c.id,
    c.title,
    c.type,
    c.file_url,
    c.thumbnail_url,
    c.description,
    c.created_at,
    COALESCE(c.is_paid, true) AS is_paid,
    COALESCE(c.is_free_preview, false) AS is_free_preview,
    c.group_id,
    c.subject_id,
    c.sub_subject,
    c.sub_subject_id,
    (
      has_group_access
      OR COALESCE(c.is_free_preview, false)
      OR COALESCE(c.is_paid, true) = false
      OR EXISTS (
        SELECT 1
        FROM public.group_subscriptions gs
        WHERE gs.group_id = c.group_id
          AND gs.student_id = current_user_id
          AND gs.status = 'active'
          AND (gs.expires_at IS NULL OR gs.expires_at > now())
      )
    ) AS is_accessible,
    s.education_type,
    s.section AS subject_section
  FROM public.content c
  JOIN eligible_groups eg ON eg.id = c.group_id
  LEFT JOIN public.subjects s ON s.id = c.subject_id
  WHERE COALESCE(c.is_hidden, false) = false
    AND (
      c.target_section IS NULL
      OR c.target_section = 'literary'
      OR c.target_section = student_profile.section
    )
    AND (
      c.target_education_type IS NULL
      OR c.target_education_type = student_profile.education_type
      OR c.target_education_type = 'عام'
    )
  ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_literary_student_group_content_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_literary_student_group_content_catalog(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_literary_student_group_exam_catalog(uuid);

CREATE OR REPLACE FUNCTION public.get_literary_student_group_exam_catalog(_group_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  total_marks numeric,
  pass_marks numeric,
  start_at timestamptz,
  end_at timestamptz,
  is_ai_generated boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject_id uuid,
  term text,
  created_at timestamptz,
  is_accessible boolean,
  target_section text,
  target_education_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  student_profile record;
  requested_group record;
  has_direct_rows boolean := false;
  has_group_access boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.role, p.stage, p.education_type, p.section, p.grade
    INTO student_profile
  FROM public.profiles p
  WHERE p.id = current_user_id;

  IF student_profile.id IS NULL OR student_profile.role <> 'student' THEN
    RAISE EXCEPTION 'Student profile required' USING ERRCODE = '42501';
  END IF;

  SELECT tg.id, tg.teacher_id, tg.subject_id, tg.academic_term, s.grade_level, s.education_type, s.section
    INTO requested_group
  FROM public.teacher_groups tg
  LEFT JOIN public.subjects s ON s.id = tg.subject_id
  WHERE tg.id = _group_id;

  IF requested_group.id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.group_subscriptions gs
    WHERE gs.group_id = _group_id
      AND gs.student_id = current_user_id
      AND gs.status = 'active'
      AND (gs.expires_at IS NULL OR gs.expires_at > now())
  ) INTO has_group_access;

  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    WHERE e.group_id = _group_id
      AND COALESCE(e.is_active, true) = true
      AND (
        e.target_section IS NULL
        OR e.target_section = 'literary'
        OR e.target_section = student_profile.section
      )
  ) INTO has_direct_rows;

  RETURN QUERY
  WITH eligible_groups AS (
    SELECT tg.id
    FROM public.teacher_groups tg
    LEFT JOIN public.subjects s ON s.id = tg.subject_id
    WHERE (
      (has_direct_rows AND tg.id = _group_id)
      OR (
        NOT has_direct_rows
        AND tg.teacher_id = requested_group.teacher_id
        AND COALESCE(tg.academic_term, '') = COALESCE(requested_group.academic_term, '')
        AND (
          tg.subject_id = requested_group.subject_id
          OR EXISTS (
            SELECT 1
            FROM public.subjects rs
            JOIN public.subjects gs ON gs.id = tg.subject_id
            WHERE rs.id = requested_group.subject_id
              AND lower(trim(COALESCE(rs.name, ''))) = lower(trim(COALESCE(gs.name, '')))
              AND COALESCE(rs.grade_level, '') = COALESCE(gs.grade_level, '')
          )
        )
      )
    )
      AND (
        student_profile.stage IS NULL
        OR s.grade_level IS NULL
        OR s.grade_level = student_profile.stage
        OR s.grade_level = student_profile.grade
      )
      AND (
        s.education_type IS NULL
        OR student_profile.education_type IS NULL
        OR s.education_type = student_profile.education_type
        OR s.education_type = 'عام'
      )
      AND (
        s.section IS NULL
        OR student_profile.section IS NULL
        OR s.section = student_profile.section
        OR s.section = 'literary'
      )
  )
  SELECT
    e.id,
    e.title,
    e.description,
    e.duration_minutes,
    e.total_marks,
    e.pass_marks,
    e.start_at,
    e.end_at,
    e.is_ai_generated,
    e.group_id,
    e.subject_id,
    e.sub_subject_id,
    e.term,
    e.created_at,
    (
      has_group_access
      OR COALESCE(e.is_free_preview, false)
      OR EXISTS (
        SELECT 1
        FROM public.group_subscriptions gs
        WHERE gs.group_id = e.group_id
          AND gs.student_id = current_user_id
          AND gs.status = 'active'
          AND (gs.expires_at IS NULL OR gs.expires_at > now())
      )
    ) AS is_accessible,
    e.target_section,
    e.target_education_type
  FROM public.exams e
  JOIN eligible_groups eg ON eg.id = e.group_id
  WHERE COALESCE(e.is_active, true) = true
    AND (
      e.target_section IS NULL
      OR e.target_section = 'literary'
      OR e.target_section = student_profile.section
    )
    AND (
      e.target_education_type IS NULL
      OR e.target_education_type = student_profile.education_type
      OR e.target_education_type = 'عام'
    )
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_literary_student_group_exam_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_literary_student_group_exam_catalog(uuid) TO authenticated, service_role;

-- Explicitly refresh the API schema cache used by rpc() calls.
NOTIFY pgrst, 'reload schema';