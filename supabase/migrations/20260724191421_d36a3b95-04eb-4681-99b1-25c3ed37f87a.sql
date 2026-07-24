CREATE OR REPLACE FUNCTION public.get_literary_student_group_content_catalog(_group_id uuid)
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
  is_accessible boolean,
  education_type text,
  subject_section text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_student_edu text;
  v_student_section text;
  v_is_literary_student boolean := false;
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_primary_count integer := 0;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    public.normalize_content_education_type(p.education_type),
    public.normalize_content_section(p.section)
  INTO v_student_edu, v_student_section
  FROM public.profiles p
  WHERE p.id = v_student_id;

  v_is_literary_student := v_student_section = 'literary';

  BEGIN
    v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF NOT (v_is_literary_student OR v_is_admin) THEN
    RETURN;
  END IF;

  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    cg.term,
    public.normalize_content_education_type(cg.education_type) AS group_edu,
    s.name AS subject_name,
    s.stage AS subject_stage,
    s.grade AS subject_grade,
    s.section AS subject_section,
    public.normalize_content_section(s.section) AS normalized_subject_section,
    s.category AS subject_category
  INTO v_group
  FROM public.content_groups cg
  JOIN public.subjects s ON s.id = cg.subject_id
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT (
    v_is_admin
    OR v_group.normalized_subject_section = 'literary'
    OR v_group.subject_category = 'literary'
    OR v_group.subject_category = 'math'
  ) THEN
    RETURN;
  END IF;

  IF v_group.group_edu IS NOT NULL AND v_student_edu IS NOT NULL AND v_group.group_edu <> v_student_edu AND NOT v_is_admin THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = v_student_id
      AND sgp.group_id = _group_id
  ) INTO v_is_purchased;

  SELECT count(*)
  INTO v_primary_count
  FROM public.content c
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (
      v_is_admin
      OR public.content_effective_education_type(c.education_type, c.group_id) IS NULL
      OR v_student_edu IS NULL
      OR public.content_effective_education_type(c.education_type, c.group_id) = v_student_edu
    )
    AND (
      v_is_admin
      OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL
      OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) = 'literary'
    );

  RETURN QUERY
  WITH candidate_content AS (
    SELECT c.*, 0 AS source_rank
    FROM public.content c
    WHERE c.group_id = _group_id
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        v_is_admin
        OR public.content_effective_education_type(c.education_type, c.group_id) IS NULL
        OR v_student_edu IS NULL
        OR public.content_effective_education_type(c.education_type, c.group_id) = v_student_edu
      )
      AND (
        v_is_admin
        OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL
        OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) = 'literary'
      )

    UNION ALL

    SELECT c.*, 1 AS source_rank
    FROM public.content c
    JOIN public.content_groups source_group ON source_group.id = c.group_id
    JOIN public.subjects source_subject ON source_subject.id = c.subject_id
    WHERE v_primary_count = 0
      AND source_group.id <> _group_id
      AND (source_group.teacher_id = v_group.teacher_id OR source_group.created_by = v_group.created_by)
      AND COALESCE(source_group.is_active, true) = true
      AND source_subject.name = v_group.subject_name
      AND source_subject.stage = v_group.subject_stage
      AND source_subject.grade = v_group.subject_grade
      AND (
        source_subject.category = v_group.subject_category
        OR (v_group.subject_category = 'math' AND source_subject.category = 'math')
      )
      AND public.normalize_content_section(source_subject.section) = 'literary'
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        v_is_admin
        OR public.content_effective_education_type(c.education_type, c.group_id) IS NULL
        OR v_student_edu IS NULL
        OR public.content_effective_education_type(c.education_type, c.group_id) = v_student_edu
      )
      AND (
        v_is_admin
        OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL
        OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) = 'literary'
      )
  ), deduped AS (
    SELECT DISTINCT ON (COALESCE(NULLIF(cc.file_url, ''), cc.id::text), cc.type, COALESCE(cc.sub_subject_id::text, cc.sub_subject, ''))
      cc.*
    FROM candidate_content cc
    ORDER BY COALESCE(NULLIF(cc.file_url, ''), cc.id::text), cc.type, COALESCE(cc.sub_subject_id::text, cc.sub_subject, ''), cc.source_rank, cc.created_at DESC, cc.id
  )
  SELECT
    d.id AS id,
    d.title AS title,
    d.type AS type,
    CASE
      WHEN v_is_admin OR v_is_purchased OR COALESCE(d.is_paid, false) = false OR COALESCE(d.is_free_preview, false) = true
        THEN COALESCE(d.file_url, '')
      ELSE ''::text
    END AS file_url,
    COALESCE(
      NULLIF(d.thumbnail_url, ''),
      CASE
        WHEN d.type = 'video' AND d.file_url LIKE 'bunny://%' THEN
          'https://vz-9fc4b938-1b7.b-cdn.net/' || replace(d.file_url, 'bunny://', '') || '/thumbnail.jpg'
        ELSE NULL::text
      END
    ) AS thumbnail_url,
    d.description AS description,
    d.created_at AS created_at,
    COALESCE(d.is_paid, false) AS is_paid,
    COALESCE(d.is_free_preview, false) AS is_free_preview,
    _group_id AS group_id,
    d.subject_id AS subject_id,
    d.sub_subject AS sub_subject,
    d.sub_subject_id AS sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(d.is_paid, false) = false OR COALESCE(d.is_free_preview, false) = true) AS is_accessible,
    public.content_effective_education_type(d.education_type, d.group_id) AS education_type,
    public.content_effective_section(d.target_section, d.subject_id, d.group_id) AS subject_section
  FROM deduped d
  ORDER BY d.source_rank ASC, COALESCE(d.order_index, 0) ASC, d.created_at ASC, d.id ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_literary_student_group_content_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_literary_student_group_content_catalog(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_literary_student_group_exam_catalog(_group_id uuid)
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
  is_accessible boolean,
  target_section text,
  target_education_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_student_edu text;
  v_student_section text;
  v_is_literary_student boolean := false;
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_primary_count integer := 0;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    public.normalize_content_education_type(p.education_type),
    public.normalize_content_section(p.section)
  INTO v_student_edu, v_student_section
  FROM public.profiles p
  WHERE p.id = v_student_id;

  v_is_literary_student := v_student_section = 'literary';

  BEGIN
    v_is_admin := public.has_role(v_student_id, 'admin'::public.app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF NOT (v_is_literary_student OR v_is_admin) THEN
    RETURN;
  END IF;

  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    cg.term,
    public.normalize_content_education_type(cg.education_type) AS group_edu,
    s.name AS subject_name,
    s.stage AS subject_stage,
    s.grade AS subject_grade,
    s.section AS subject_section,
    public.normalize_content_section(s.section) AS normalized_subject_section,
    s.category AS subject_category
  INTO v_group
  FROM public.content_groups cg
  JOIN public.subjects s ON s.id = cg.subject_id
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT (
    v_is_admin
    OR v_group.normalized_subject_section = 'literary'
    OR v_group.subject_category = 'literary'
    OR v_group.subject_category = 'math'
  ) THEN
    RETURN;
  END IF;

  IF v_group.group_edu IS NOT NULL AND v_student_edu IS NOT NULL AND v_group.group_edu <> v_student_edu AND NOT v_is_admin THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = v_student_id
      AND sgp.group_id = _group_id
  ) INTO v_is_purchased;

  SELECT count(*)
  INTO v_primary_count
  FROM public.exams e
  WHERE e.group_id = _group_id
    AND COALESCE(e.is_published, false) = true
    AND e.status = 'published'::public.exam_status
    AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
    AND (
      v_is_admin
      OR public.exam_effective_education_type(e.target_education_type, e.group_id) IS NULL
      OR v_student_edu IS NULL
      OR public.exam_effective_education_type(e.target_education_type, e.group_id) = v_student_edu
    )
    AND (
      v_is_admin
      OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NULL
      OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) = 'literary'
    );

  RETURN QUERY
  WITH candidate_exams AS (
    SELECT e.*, 0 AS source_rank
    FROM public.exams e
    WHERE e.group_id = _group_id
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        v_is_admin
        OR public.exam_effective_education_type(e.target_education_type, e.group_id) IS NULL
        OR v_student_edu IS NULL
        OR public.exam_effective_education_type(e.target_education_type, e.group_id) = v_student_edu
      )
      AND (
        v_is_admin
        OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NULL
        OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) = 'literary'
      )

    UNION ALL

    SELECT e.*, 1 AS source_rank
    FROM public.exams e
    JOIN public.content_groups source_group ON source_group.id = e.group_id
    JOIN public.subjects source_subject ON source_subject.id = e.subject_id
    WHERE v_primary_count = 0
      AND source_group.id <> _group_id
      AND (source_group.teacher_id = v_group.teacher_id OR source_group.created_by = v_group.created_by)
      AND COALESCE(source_group.is_active, true) = true
      AND source_subject.name = v_group.subject_name
      AND source_subject.stage = v_group.subject_stage
      AND source_subject.grade = v_group.subject_grade
      AND (
        source_subject.category = v_group.subject_category
        OR (v_group.subject_category = 'math' AND source_subject.category = 'math')
      )
      AND public.normalize_content_section(source_subject.section) = 'literary'
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        v_is_admin
        OR public.exam_effective_education_type(e.target_education_type, e.group_id) IS NULL
        OR v_student_edu IS NULL
        OR public.exam_effective_education_type(e.target_education_type, e.group_id) = v_student_edu
      )
      AND (
        v_is_admin
        OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NULL
        OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) = 'literary'
      )
  ), deduped AS (
    SELECT DISTINCT ON (ce.title, COALESCE(ce.sub_subject_id::text, ''), ce.total_marks, ce.duration_minutes)
      ce.*
    FROM candidate_exams ce
    ORDER BY ce.title, COALESCE(ce.sub_subject_id::text, ''), ce.total_marks, ce.duration_minutes, ce.source_rank, ce.created_at DESC, ce.id
  )
  SELECT
    d.id AS id,
    d.title AS title,
    d.description AS description,
    d.duration_minutes AS duration_minutes,
    d.total_marks AS total_marks,
    d.pass_marks AS pass_marks,
    d.start_at AS start_at,
    d.end_at AS end_at,
    COALESCE(d.is_ai_generated, false) AS is_ai_generated,
    _group_id AS group_id,
    d.subject_id AS subject_id,
    d.sub_subject_id AS sub_subject_id,
    d.term AS term,
    d.created_at AS created_at,
    (v_is_admin OR v_is_purchased) AS is_accessible,
    public.exam_effective_section(d.target_section, d.subject_id, d.group_id) AS target_section,
    public.exam_effective_education_type(d.target_education_type, d.group_id) AS target_education_type
  FROM deduped d
  ORDER BY d.source_rank ASC, d.created_at DESC, d.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_literary_student_group_exam_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_literary_student_group_exam_catalog(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';