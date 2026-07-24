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
      COALESCE(ce.title, ''),
      COALESCE(ce.description, ''),
      COALESCE(ce.matched_sub_subject_id::text, ''),
      COALESCE(ce.target_section, ''),
      COALESCE(ce.target_education_type, '')
    ) ce.*
    FROM candidate_exams ce
    ORDER BY
      COALESCE(ce.title, ''),
      COALESCE(ce.description, ''),
      COALESCE(ce.matched_sub_subject_id::text, ''),
      COALESCE(ce.target_section, ''),
      COALESCE(ce.target_education_type, ''),
      ce.source_rank ASC,
      ce.created_at DESC,
      ce.id DESC
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