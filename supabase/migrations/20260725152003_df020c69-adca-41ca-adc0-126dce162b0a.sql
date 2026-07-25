CREATE OR REPLACE FUNCTION public.exam_target_matches_student(
  _student_id uuid,
  _target_section text,
  _target_education_type text,
  _subject_id uuid DEFAULT NULL::uuid,
  _group_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH normalized_target AS (
    SELECT
      public.normalize_content_education_type(_target_education_type) AS raw_edu,
      public.normalize_content_section(_target_section) AS raw_section
  ), subject_context AS (
    SELECT public.normalize_content_section(s.section) AS subject_section
    FROM public.subjects s
    WHERE s.id = _subject_id
  ), group_context AS (
    SELECT public.normalize_content_education_type(cg.education_type) AS group_edu
    FROM public.content_groups cg
    WHERE cg.id = _group_id
  ), effective_target AS (
    SELECT
      CASE
        WHEN nt.raw_section IS NULL
          AND nt.raw_edu IS NOT NULL
          AND (SELECT group_edu FROM group_context) IS NOT NULL
          AND nt.raw_edu = (SELECT group_edu FROM group_context)
        THEN NULL::text
        ELSE nt.raw_edu
      END AS edu,
      CASE
        WHEN nt.raw_section IS NULL THEN NULL::text
        WHEN (SELECT subject_section FROM subject_context) IS NOT NULL
          AND nt.raw_section = (SELECT subject_section FROM subject_context)
        THEN NULL::text
        ELSE nt.raw_section
      END AS section
    FROM normalized_target nt
  ), student AS (
    SELECT
      public.normalize_content_education_type(p.education_type) AS edu,
      public.normalize_content_section(p.section) AS section
    FROM public.profiles p
    WHERE p.id = _student_id
  )
  SELECT CASE
    WHEN _student_id IS NULL THEN (SELECT edu IS NULL AND section IS NULL FROM effective_target)
    WHEN NOT EXISTS (SELECT 1 FROM student) THEN (SELECT edu IS NULL AND section IS NULL FROM effective_target)
    ELSE
      (
        (SELECT edu FROM effective_target) IS NULL
        OR ((SELECT edu FROM student) IS NOT NULL AND (SELECT edu FROM student) = (SELECT edu FROM effective_target))
      )
      AND
      (
        (SELECT section FROM effective_target) IS NULL
        OR ((SELECT section FROM student) IS NOT NULL AND (SELECT section FROM student) = (SELECT section FROM effective_target))
      )
  END
$$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(
  _student_id uuid,
  _target_section text,
  _target_education_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.exam_target_matches_student(_student_id, _target_section, _target_education_type, NULL::uuid, NULL::uuid)
$$;

CREATE OR REPLACE FUNCTION public.exam_target_matches_student(
  _target_section text,
  _target_education_type text,
  _student_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.exam_target_matches_student(_student_id, _target_section, _target_education_type, NULL::uuid, NULL::uuid)
$$;

CREATE OR REPLACE FUNCTION public.exam_broadcast_group_ids(_group_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH src AS (
    SELECT
      cg.id,
      cg.teacher_id,
      cg.created_by,
      COALESCE(cg.teacher_id, cg.created_by) AS owner_id,
      cg.term,
      s.name AS subject_name,
      s.category AS subject_category,
      s.stage,
      s.grade,
      s.shared_subject_id
    FROM public.content_groups cg
    JOIN public.subjects s ON s.id = cg.subject_id
    WHERE cg.id = _group_id
  )
  SELECT cg.id
  FROM public.content_groups cg
  JOIN public.subjects s ON s.id = cg.subject_id
  JOIN src ON true
  WHERE COALESCE(cg.is_active, true) = true
    AND (
      COALESCE(cg.teacher_id, cg.created_by) = src.owner_id
      OR (src.teacher_id IS NOT NULL AND (cg.teacher_id = src.teacher_id OR cg.created_by = src.teacher_id))
      OR (src.created_by IS NOT NULL AND (cg.teacher_id = src.created_by OR cg.created_by = src.created_by))
    )
    AND cg.term IS NOT DISTINCT FROM src.term
    AND s.stage IS NOT DISTINCT FROM src.stage
    AND s.grade IS NOT DISTINCT FROM src.grade
    AND (
      (src.shared_subject_id IS NOT NULL AND s.shared_subject_id IS NOT DISTINCT FROM src.shared_subject_id)
      OR lower(btrim(s.name)) = lower(btrim(src.subject_name))
      OR public.catalog_subjects_match(src.subject_category, src.subject_name, s.category, s.name)
      OR (
        src.shared_subject_id IS NULL
        AND s.shared_subject_id IS NULL
        AND lower(btrim(COALESCE(s.category, ''))) = lower(btrim(COALESCE(src.subject_category, '')))
      )
    )
$$;

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
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_selected_name text := NULL;
  v_parent_subject_name text := NULL;
  v_selected_is_parent_subject boolean := false;
  v_broadcast_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT
    cg.id,
    cg.subject_id,
    cg.teacher_id,
    cg.created_by,
    cg.term,
    cg.education_type,
    trim(lower(s.name)) AS subject_name,
    s.section AS subject_section
  INTO v_group
  FROM public.content_groups cg
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_parent_subject_name := v_group.subject_name;

  SELECT COALESCE(array_agg(sid), ARRAY[]::uuid[])
  INTO v_broadcast_ids
  FROM public.exam_broadcast_group_ids(_group_id) AS sid;

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

  IF _sub_subject_id IS NOT NULL THEN
    SELECT trim(lower(ss.name)) INTO v_selected_name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id;

    v_selected_is_parent_subject := v_selected_name IS NOT NULL AND v_selected_name = v_parent_subject_name;
  END IF;

  RETURN QUERY
  WITH candidate_exams AS (
    SELECT
      e.*,
      source_ss.name AS c_source_ss_name,
      public.normalize_content_section(e.target_section) AS c_target_section
    FROM public.exams e
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = e.sub_subject_id
     AND COALESCE(source_ss.is_active, true) = true
    WHERE (
        e.group_id = _group_id
        OR (
          public.normalize_content_section(e.target_section) IS NULL
          AND e.group_id = ANY(v_broadcast_ids)
        )
        OR (
          public.normalize_content_section(e.target_section) IS NOT NULL
          AND public.normalize_content_section(e.target_section) = public.normalize_content_section(v_group.subject_section)
          AND e.group_id = ANY(v_broadcast_ids)
        )
      )
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        _sub_subject_id IS NULL
        OR v_selected_is_parent_subject
        OR e.sub_subject_id = _sub_subject_id
        OR e.sub_subject_id IS NULL
        OR (
          v_selected_name IS NOT NULL
          AND trim(lower(COALESCE(source_ss.name, ''))) = v_selected_name
        )
      )
      AND (v_is_admin OR public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type, e.subject_id, e.group_id))
  ), deduped AS (
    SELECT DISTINCT ON (id) *
    FROM candidate_exams
    ORDER BY id, created_at DESC
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
$$;

REVOKE EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exam_target_matches_student(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';