CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(
  _group_id uuid,
  _sub_subject_id uuid DEFAULT NULL::uuid
)
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
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term, cg.education_type
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

  RETURN QUERY
  WITH target_subject AS (
    SELECT s.*
    FROM public.subjects s
    WHERE s.id = v_group.subject_id
  ), selected_sub_subject AS (
    SELECT ss.id, ss.name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id
      AND ss.group_id = _group_id
      AND COALESCE(ss.is_active, true) = true
  ), candidate_content AS (
    SELECT
      c.id             AS c_id,
      c.title          AS c_title,
      c.type           AS c_type,
      c.file_url       AS c_file_url,
      c.thumbnail_url  AS c_thumbnail_url,
      c.description    AS c_description,
      c.created_at     AS c_created_at,
      c.is_paid        AS c_is_paid,
      c.is_free_preview AS c_is_free_preview,
      c.group_id       AS c_group_id,
      c.subject_id     AS c_subject_id,
      COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) AS c_sub_subject,
      CASE
        WHEN _sub_subject_id IS NOT NULL
          AND selected_ss.id IS NOT NULL
          AND COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NOT NULL
          AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = trim(ts.name)
        THEN selected_ss.id
        ELSE COALESCE(target_match.id, c.sub_subject_id)
      END AS c_sub_subject_id,
      c.education_type AS c_education_type,
      c.target_section AS c_target_section,
      CASE WHEN c.group_id = _group_id THEN 0 ELSE 1 END AS source_rank
    FROM public.content c
    JOIN public.content_groups source_group
      ON source_group.id = c.group_id
     AND COALESCE(source_group.is_active, true) = true
    JOIN public.subjects content_subject
      ON content_subject.id = c.subject_id
    JOIN target_subject ts ON true
    LEFT JOIN selected_sub_subject selected_ss ON true
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = c.sub_subject_id
     AND source_ss.group_id = c.group_id
     AND COALESCE(source_ss.is_active, true) = true
    LEFT JOIN public.sub_subjects target_match
      ON target_match.group_id = _group_id
     AND COALESCE(target_match.is_active, true) = true
     AND COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NOT NULL
     AND trim(target_match.name) = trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name))
    WHERE COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND c.uploaded_by = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(source_group.teacher_id, source_group.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND (
        c.group_id = _group_id
        OR (
          c.group_id IS DISTINCT FROM _group_id
          AND (v_group.term IS NULL OR source_group.term = v_group.term)
          AND (v_group.term IS NULL OR c.term = v_group.term)
          AND ts.stage = content_subject.stage
          AND ts.grade = content_subject.grade
          AND public.catalog_subjects_match(ts.category, ts.name, content_subject.category, content_subject.name)
          AND (
            public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NULL
            OR public.content_effective_section(c.target_section, c.subject_id, c.group_id) IS NOT DISTINCT FROM public.normalize_content_section(ts.section)
            OR public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
          )
        )
      )
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        _sub_subject_id IS NULL
        OR c.sub_subject_id = _sub_subject_id
        OR target_match.id = _sub_subject_id
        OR (
          selected_ss.id IS NOT NULL
          AND COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NOT NULL
          AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = trim(ts.name)
        )
      )
      AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject_id::text, cc.c_sub_subject, ''),
      COALESCE(cc.c_education_type, ''),
      COALESCE(cc.c_target_section, '')
    )
      cc.c_id, cc.c_title, cc.c_type, cc.c_file_url, cc.c_thumbnail_url, cc.c_description,
      cc.c_created_at, cc.c_is_paid, cc.c_is_free_preview, cc.c_group_id, cc.c_subject_id,
      cc.c_sub_subject, cc.c_sub_subject_id, cc.c_education_type, cc.c_target_section,
      cc.source_rank
    FROM candidate_content cc
    ORDER BY
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject_id::text, cc.c_sub_subject, ''),
      COALESCE(cc.c_education_type, ''),
      COALESCE(cc.c_target_section, ''),
      cc.source_rank ASC,
      cc.c_created_at DESC,
      cc.c_id DESC
  )
  SELECT
    d.c_id            AS id,
    d.c_title         AS title,
    d.c_type          AS type,
    d.c_file_url      AS file_url,
    d.c_thumbnail_url AS thumbnail_url,
    d.c_description   AS description,
    d.c_created_at    AS created_at,
    COALESCE(d.c_is_paid, false)         AS is_paid,
    COALESCE(d.c_is_free_preview, false) AS is_free_preview,
    _group_id                             AS group_id,
    d.c_subject_id    AS subject_id,
    d.c_sub_subject   AS sub_subject,
    d.c_sub_subject_id AS sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(d.c_is_paid, false) = false OR COALESCE(d.c_is_free_preview, false) = true) AS is_accessible,
    public.content_effective_education_type(d.c_education_type, d.c_group_id)          AS education_type,
    public.content_effective_section(d.c_target_section, d.c_subject_id, d.c_group_id) AS subject_section
  FROM deduped d
  ORDER BY d.c_created_at DESC, d.c_id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_group_exam_catalog(
  _group_id uuid,
  _sub_subject_id uuid DEFAULT NULL::uuid
)
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
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term, cg.education_type
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

  RETURN QUERY
  WITH target_subject AS (
    SELECT s.*
    FROM public.subjects s
    WHERE s.id = v_group.subject_id
  ), selected_sub_subject AS (
    SELECT ss.id, ss.name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id
      AND ss.group_id = _group_id
      AND COALESCE(ss.is_active, true) = true
  ), candidate_exams AS (
    SELECT
      e.*,
      CASE
        WHEN _sub_subject_id IS NOT NULL
          AND selected_ss.id IS NOT NULL
          AND source_ss.name IS NOT NULL
          AND trim(source_ss.name) = trim(ts.name)
        THEN selected_ss.id
        ELSE COALESCE(target_match.id, e.sub_subject_id)
      END AS matched_sub_subject_id,
      CASE WHEN e.group_id = _group_id THEN 0 ELSE 1 END AS source_rank
    FROM public.exams e
    JOIN public.content_groups source_group
      ON source_group.id = e.group_id
     AND COALESCE(source_group.is_active, true) = true
    JOIN public.subjects exam_subject
      ON exam_subject.id = e.subject_id
    JOIN target_subject ts ON true
    LEFT JOIN selected_sub_subject selected_ss ON true
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = e.sub_subject_id
     AND source_ss.group_id = e.group_id
     AND COALESCE(source_ss.is_active, true) = true
    LEFT JOIN public.sub_subjects target_match
      ON target_match.group_id = _group_id
     AND COALESCE(target_match.is_active, true) = true
     AND source_ss.name IS NOT NULL
     AND trim(target_match.name) = trim(source_ss.name)
    WHERE COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND e.teacher_id = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(source_group.teacher_id, source_group.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND (
        e.group_id = _group_id
        OR (
          e.group_id IS DISTINCT FROM _group_id
          AND (v_group.term IS NULL OR source_group.term = v_group.term)
          AND (v_group.term IS NULL OR e.term = v_group.term)
          AND ts.stage = exam_subject.stage
          AND ts.grade = exam_subject.grade
          AND public.catalog_subjects_match(ts.category, ts.name, exam_subject.category, exam_subject.name)
          AND (
            public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NULL
            OR public.exam_effective_section(e.target_section, e.subject_id, e.group_id) IS NOT DISTINCT FROM public.normalize_content_section(ts.section)
            OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id)
          )
        )
      )
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        _sub_subject_id IS NULL
        OR e.sub_subject_id = _sub_subject_id
        OR target_match.id = _sub_subject_id
        OR (
          selected_ss.id IS NOT NULL
          AND source_ss.name IS NOT NULL
          AND trim(source_ss.name) = trim(ts.name)
        )
      )
      AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id))
  ), deduped AS (
    SELECT DISTINCT ON (
      COALESCE(title, ''),
      COALESCE(description, ''),
      COALESCE(matched_sub_subject_id::text, ''),
      COALESCE(target_section, ''),
      COALESCE(target_education_type, '')
    ) *
    FROM candidate_exams
    ORDER BY
      COALESCE(title, ''),
      COALESCE(description, ''),
      COALESCE(matched_sub_subject_id::text, ''),
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
    d.matched_sub_subject_id AS sub_subject_id,
    d.term,
    d.created_at,
    (v_is_admin OR v_is_purchased) AS is_accessible,
    public.exam_effective_section(d.target_section, d.subject_id, d.group_id) AS target_section,
    public.exam_effective_education_type(d.target_education_type, d.group_id) AS target_education_type
  FROM deduped d
  ORDER BY d.created_at DESC, d.id DESC;
END;
$function$;