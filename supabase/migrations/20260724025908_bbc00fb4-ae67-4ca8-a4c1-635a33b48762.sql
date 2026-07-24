CREATE OR REPLACE FUNCTION public.normalize_content_education_type(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN lower(btrim(_value)) IN ('both', 'all', 'any', 'الكل', 'الجميع') THEN NULL
    WHEN lower(btrim(_value)) IN ('عام', 'general', 'تعليم عام', 'العام') THEN 'عام'
    WHEN lower(btrim(_value)) IN ('أزهر', 'ازهر', 'أزهري', 'ازهري', 'azhar', 'azhari', 'تعليم أزهري', 'تعليم ازهري', 'الأزهر', 'الازهر') THEN 'أزهر'
    ELSE btrim(_value)
  END
$$;

CREATE OR REPLACE FUNCTION public.normalize_content_section(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _value IS NULL OR btrim(_value) = '' THEN NULL
    WHEN lower(btrim(_value)) IN ('both', 'all', 'any', 'الكل', 'الجميع') THEN NULL
    WHEN lower(btrim(_value)) IN ('scientific', 'science', 'sci', 'علمي', 'علمى', 'علم', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات') THEN 'scientific'
    WHEN lower(btrim(_value)) IN ('literary', 'أدبي', 'ادبي', 'أدبى', 'ادبى', 'الأدبي', 'الادبي') THEN 'literary'
    ELSE lower(btrim(_value))
  END
$$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(_content_edu text, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.normalize_content_education_type(_content_edu) IS NULL THEN true
    WHEN _student_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = _student_id
        AND public.normalize_content_education_type(p.education_type) = public.normalize_content_education_type(_content_edu)
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.content_target_matches_student(_content_edu text, _content_subject_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _student_id IS NULL THEN public.normalize_content_education_type(_content_edu) IS NULL
    ELSE EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.subjects s ON s.id = _content_subject_id
      WHERE p.id = _student_id
        AND (
          public.normalize_content_education_type(_content_edu) IS NULL
          OR public.normalize_content_education_type(p.education_type) = public.normalize_content_education_type(_content_edu)
        )
        AND (
          public.normalize_content_section(s.section) IS NULL
          OR public.normalize_content_section(p.section) IS NULL
          OR public.normalize_content_section(s.section) = public.normalize_content_section(p.section)
        )
    )
  END
$$;

GRANT EXECUTE ON FUNCTION public.normalize_content_education_type(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_content_section(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view accessible current-term content" ON public.content;
CREATE POLICY "Public can view accessible current-term content"
ON public.content
FOR SELECT
TO anon, authenticated
USING (
  COALESCE(is_active, true)
  AND COALESCE(type, '') <> 'student_library'
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
  AND public.content_target_matches_student(education_type, subject_id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  title text,
  type text,
  file_url text,
  thumbnail_url text,
  description text,
  created_at timestamp with time zone,
  is_paid boolean,
  is_free_preview boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject text,
  sub_subject_id uuid,
  is_accessible boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_student_id IS NOT NULL THEN
    BEGIN
      v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
    EXCEPTION WHEN OTHERS THEN
      v_is_admin := false;
    END;

    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.type,
    c.file_url,
    c.thumbnail_url,
    c.description,
    c.created_at,
    c.is_paid,
    c.is_free_preview,
    c.group_id,
    c.subject_id,
    c.sub_subject,
    c.sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(c.is_paid, false) = false OR COALESCE(c.is_free_preview, false) = true) AS is_accessible
  FROM public.content c
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND (v_is_admin OR public.content_target_matches_student(c.education_type, c.subject_id, v_student_id))
  ORDER BY c.created_at DESC, c.id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_group_exam_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  total_marks numeric,
  pass_marks numeric,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  is_ai_generated boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject_id uuid,
  term text,
  created_at timestamp with time zone,
  is_accessible boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_student_id IS NOT NULL THEN
    BEGIN
      v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
    EXCEPTION WHEN OTHERS THEN
      v_is_admin := false;
    END;

    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = _group_id
      AND COALESCE(cg.is_active, true) = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.description,
    e.duration_minutes,
    e.total_marks,
    e.pass_marks,
    e.start_at,
    e.end_at,
    COALESCE(e.is_ai_generated, false) AS is_ai_generated,
    e.group_id,
    e.subject_id,
    e.sub_subject_id,
    e.term,
    e.created_at,
    (v_is_admin OR v_is_purchased) AS is_accessible
  FROM public.exams e
  WHERE e.group_id = _group_id
    AND COALESCE(e.is_published, false) = true
    AND e.status = 'published'::public.exam_status
    AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
    AND (
      v_is_admin
      OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type)
    )
  ORDER BY e.created_at DESC, e.id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO anon, authenticated, service_role;