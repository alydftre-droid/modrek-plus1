
-- Fix: sub_subject filter was too strict, hiding content with NULL sub_subject_id
-- or content whose sub_subject_id came from an older sibling group (name match).

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
  v_selected_name text := NULL;
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

  IF _sub_subject_id IS NOT NULL THEN
    SELECT trim(lower(ss.name)) INTO v_selected_name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id;
  END IF;

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
      COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) AS c_sub_subject,
      COALESCE(c.sub_subject_id, source_ss.id) AS c_sub_subject_id,
      source_ss.name   AS c_source_ss_name,
      public.content_effective_education_type(c.education_type, c.group_id) AS c_effective_education_type,
      public.content_effective_section(c.target_section, c.subject_id, c.group_id) AS c_effective_target_section
    FROM public.content c
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = c.sub_subject_id
     AND COALESCE(source_ss.is_active, true) = true
    WHERE c.group_id = _group_id
      AND COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
      AND (
        _sub_subject_id IS NULL
        OR c.sub_subject_id = _sub_subject_id
        OR c.sub_subject_id IS NULL
        OR (
          v_selected_name IS NOT NULL
          AND (
            trim(lower(COALESCE(c.sub_subject, ''))) = v_selected_name
            OR trim(lower(COALESCE(source_ss.name, ''))) = v_selected_name
          )
        )
      )
      AND (v_is_admin OR public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section))
  ), deduped AS (
    SELECT DISTINCT ON (cc.c_id) cc.*
    FROM candidate_content cc
    ORDER BY cc.c_id, cc.c_created_at DESC
  )
  SELECT
    d.c_id, d.c_title, d.c_type, d.c_file_url, d.c_thumbnail_url, d.c_description,
    d.c_created_at,
    COALESCE(d.c_is_paid, false),
    COALESCE(d.c_is_free_preview, false),
    _group_id,
    d.c_subject_id,
    d.c_sub_subject,
    d.c_sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(d.c_is_paid, false) = false OR COALESCE(d.c_is_free_preview, false) = true),
    d.c_effective_education_type,
    d.c_effective_target_section
  FROM deduped d
  ORDER BY d.c_created_at DESC, d.c_id DESC;
END;
$function$;

-- Exam catalog: same fix for sub_subject filter (strict group isolation preserved).
CREATE OR REPLACE FUNCTION public.get_student_group_exam_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, title text, description text, duration_minutes integer, total_marks numeric, pass_marks numeric, start_at timestamp with time zone, end_at timestamp with time zone, is_ai_generated boolean, group_id uuid, subject_id uuid, sub_subject_id uuid, term text, created_at timestamp with time zone, is_accessible boolean, target_section text, target_education_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
  v_group record;
  v_selected_name text := NULL;
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

  IF _sub_subject_id IS NOT NULL THEN
    SELECT trim(lower(ss.name)) INTO v_selected_name
    FROM public.sub_subjects ss
    WHERE ss.id = _sub_subject_id;
  END IF;

  RETURN QUERY
  WITH candidate_exams AS (
    SELECT
      e.*,
      source_ss.name AS c_source_ss_name
    FROM public.exams e
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = e.sub_subject_id
     AND COALESCE(source_ss.is_active, true) = true
    WHERE e.group_id = _group_id
      AND COALESCE(e.is_published, false) = true
      AND e.status = 'published'::public.exam_status
      AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
      AND (
        _sub_subject_id IS NULL
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
