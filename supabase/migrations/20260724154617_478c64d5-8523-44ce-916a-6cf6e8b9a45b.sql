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
  is_accessible boolean,
  education_type text,
  subject_section text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_direct_count integer := 0;
BEGIN
  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    cg.term,
    cg.education_type
  INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

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

  SELECT COUNT(*)::integer
  INTO v_direct_count
  FROM public.content c
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section);

  RETURN QUERY
  WITH candidate_content AS (
    SELECT c.*, 0 AS source_rank
    FROM public.content c
    WHERE c.group_id = _group_id
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
      AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)

    UNION ALL

    SELECT c.*, 1 AS source_rank
    FROM public.content c
    JOIN public.content_groups sibling
      ON sibling.id = c.group_id
     AND COALESCE(sibling.is_active, true) = true
    JOIN public.subjects target_subject
      ON target_subject.id = v_group.subject_id
    JOIN public.subjects content_subject
      ON content_subject.id = c.subject_id
    WHERE v_direct_count = 0
      AND c.group_id IS DISTINCT FROM _group_id
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND c.uploaded_by = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(sibling.teacher_id, sibling.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND sibling.term = v_group.term
      AND c.term = v_group.term
      AND target_subject.stage = content_subject.stage
      AND target_subject.grade = content_subject.grade
      AND target_subject.category = content_subject.category
      AND public.normalize_content_section(target_subject.section) = public.normalize_content_section(content_subject.section)
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        _sub_subject_id IS NULL
        OR c.sub_subject_id IN (
          SELECT source_ss.id
          FROM public.sub_subjects target_ss
          JOIN public.sub_subjects source_ss
            ON source_ss.group_id = c.group_id
           AND COALESCE(source_ss.is_active, true) = true
           AND trim(source_ss.name) = trim(target_ss.name)
          WHERE target_ss.id = _sub_subject_id
            AND target_ss.group_id = _group_id
        )
      )
      AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(file_url, id::text),
      COALESCE(type, ''),
      COALESCE(title, ''),
      COALESCE(sub_subject, ''),
      COALESCE(sub_subject_id::text, ''),
      COALESCE(education_type, ''),
      COALESCE(target_section, '')
    )
      *
    FROM candidate_content
    ORDER BY
      COALESCE(file_url, id::text),
      COALESCE(type, ''),
      COALESCE(title, ''),
      COALESCE(sub_subject, ''),
      COALESCE(sub_subject_id::text, ''),
      COALESCE(education_type, ''),
      COALESCE(target_section, ''),
      source_rank ASC,
      created_at DESC,
      id DESC
  )
  SELECT
    d.id,
    d.title,
    d.type,
    d.file_url,
    d.thumbnail_url,
    d.description,
    d.created_at,
    COALESCE(d.is_paid, false) AS is_paid,
    COALESCE(d.is_free_preview, false) AS is_free_preview,
    _group_id AS group_id,
    d.subject_id,
    d.sub_subject,
    d.sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(d.is_paid, false) = false OR COALESCE(d.is_free_preview, false) = true) AS is_accessible,
    public.content_effective_education_type(d.education_type, d.group_id) AS education_type,
    public.content_effective_section(d.target_section, d.subject_id, d.group_id) AS subject_section
  FROM deduped d
  ORDER BY d.created_at DESC, d.id DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;

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
  is_accessible boolean,
  target_section text,
  target_education_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_direct_count integer := 0;
BEGIN
  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    cg.term,
    cg.education_type
  INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

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

  SELECT COUNT(*)::integer
  INTO v_direct_count
  FROM public.exams e
  WHERE e.group_id = _group_id
    AND COALESCE(e.is_published, false) = true
    AND e.status = 'published'::public.exam_status
    AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
    AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
    AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id));

  RETURN QUERY
  WITH candidate_exams AS (
    SELECT e.*, 0 AS source_rank
    FROM public.exams e
    WHERE e.group_id = _group_id
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
      AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id))

    UNION ALL

    SELECT e.*, 1 AS source_rank
    FROM public.exams e
    JOIN public.content_groups sibling
      ON sibling.id = e.group_id
     AND COALESCE(sibling.is_active, true) = true
    JOIN public.subjects target_subject
      ON target_subject.id = v_group.subject_id
    JOIN public.subjects exam_subject
      ON exam_subject.id = e.subject_id
    WHERE v_direct_count = 0
      AND e.group_id IS DISTINCT FROM _group_id
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND e.teacher_id = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(sibling.teacher_id, sibling.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND sibling.term = v_group.term
      AND e.term = v_group.term
      AND target_subject.stage = exam_subject.stage
      AND target_subject.grade = exam_subject.grade
      AND target_subject.category = exam_subject.category
      AND public.normalize_content_section(target_subject.section) = public.normalize_content_section(exam_subject.section)
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        _sub_subject_id IS NULL
        OR e.sub_subject_id IN (
          SELECT source_ss.id
          FROM public.sub_subjects target_ss
          JOIN public.sub_subjects source_ss
            ON source_ss.group_id = e.group_id
           AND COALESCE(source_ss.is_active, true) = true
           AND trim(source_ss.name) = trim(target_ss.name)
          WHERE target_ss.id = _sub_subject_id
            AND target_ss.group_id = _group_id
        )
      )
      AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id))
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(title, ''),
      COALESCE(description, ''),
      COALESCE(sub_subject_id::text, ''),
      COALESCE(target_section, ''),
      COALESCE(target_education_type, '')
    )
      *
    FROM candidate_exams
    ORDER BY
      COALESCE(title, ''),
      COALESCE(description, ''),
      COALESCE(sub_subject_id::text, ''),
      COALESCE(target_section, ''),
      COALESCE(target_education_type, ''),
      source_rank ASC,
      created_at DESC,
      id DESC
  )
  SELECT
    d.id,
    d.title,
    d.description,
    d.duration_minutes,
    d.total_marks,
    d.pass_marks,
    d.start_at,
    d.end_at,
    COALESCE(d.is_ai_generated, false) AS is_ai_generated,
    _group_id AS group_id,
    d.subject_id,
    d.sub_subject_id,
    d.term,
    d.created_at,
    (v_is_admin OR v_is_purchased) AS is_accessible,
    public.exam_effective_section(d.target_section, d.subject_id, d.group_id) AS target_section,
    public.exam_effective_education_type(d.target_education_type, d.group_id) AS target_education_type
  FROM deduped d
  ORDER BY d.created_at DESC, d.id DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated, service_role;