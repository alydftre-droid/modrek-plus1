CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, title text, type text, file_url text, thumbnail_url text, description text, created_at timestamp with time zone, is_paid boolean, is_free_preview boolean, group_id uuid, subject_id uuid, sub_subject text, sub_subject_id uuid, is_accessible boolean, education_type text, subject_section text)
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

  SELECT COUNT(*)::integer
  INTO v_direct_count
  FROM public.content c
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id OR c.sub_subject_id IS NULL)
    AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section);

  RETURN QUERY
  WITH candidate_content AS (
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
      c.sub_subject    AS c_sub_subject,
      c.sub_subject_id AS c_sub_subject_id,
      c.education_type AS c_education_type,
      c.target_section AS c_target_section,
      0 AS source_rank
    FROM public.content c
    WHERE c.group_id = _group_id
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id OR c.sub_subject_id IS NULL)
      AND public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)

    UNION ALL

    SELECT
      c.id, c.title, c.type, c.file_url, c.thumbnail_url, c.description, c.created_at,
      c.is_paid, c.is_free_preview, c.group_id, c.subject_id, c.sub_subject, c.sub_subject_id,
      c.education_type, c.target_section,
      1 AS source_rank
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
        OR c.sub_subject_id IS NULL
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
      COALESCE(cc.c_file_url, cc.c_id::text),
      COALESCE(cc.c_type, ''),
      COALESCE(cc.c_title, ''),
      COALESCE(cc.c_sub_subject, ''),
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
      COALESCE(cc.c_sub_subject, ''),
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