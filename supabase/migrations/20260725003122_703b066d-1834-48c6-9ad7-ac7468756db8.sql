CREATE OR REPLACE FUNCTION public.get_student_group_content_diagnostics(
  _group_id uuid,
  _sub_subject_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  reason text,
  total_teacher_content bigint,
  matching_term_content bigint,
  matching_sub_subject_content bigint,
  visible_to_student_content bigint,
  student_section text,
  student_education_type text,
  group_subject_id uuid,
  group_term text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_group record;
  v_student record;
BEGIN
  SELECT cg.id, cg.subject_id, cg.teacher_id, cg.created_by, cg.term
  INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND COALESCE(cg.is_active, true) = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'group_not_found'::text, 0::bigint, 0::bigint, 0::bigint, 0::bigint, NULL::text, NULL::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT public.normalize_content_section(p.section) AS section,
         public.normalize_content_education_type(p.education_type) AS education_type
  INTO v_student
  FROM public.profiles p
  WHERE p.id = v_student_id;

  RETURN QUERY
  WITH target_subject AS (
    SELECT s.* FROM public.subjects s WHERE s.id = v_group.subject_id
  ), all_teacher_content AS (
    SELECT c.*, source_group.term AS source_term, content_subject.stage, content_subject.grade, content_subject.category, content_subject.name
    FROM public.content c
    JOIN public.content_groups source_group
      ON source_group.id = c.group_id
     AND COALESCE(source_group.is_active, true) = true
    JOIN public.subjects content_subject ON content_subject.id = c.subject_id
    JOIN target_subject ts ON true
    WHERE COALESCE(c.is_active, true) = true
      AND COALESCE(c.type, '') <> 'student_library'
      AND c.uploaded_by = COALESCE(v_group.teacher_id, v_group.created_by)
      AND COALESCE(source_group.teacher_id, source_group.created_by) = COALESCE(v_group.teacher_id, v_group.created_by)
      AND ts.stage = content_subject.stage
      AND ts.grade = content_subject.grade
      AND public.catalog_subjects_match(ts.category, ts.name, content_subject.category, content_subject.name)
  ), term_matches AS (
    SELECT c.* FROM all_teacher_content c
    WHERE (v_group.term IS NULL OR c.source_term = v_group.term)
      AND (v_group.term IS NULL OR c.term = v_group.term)
      AND public.term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
  ), sub_matches AS (
    SELECT c.*
    FROM term_matches c
    LEFT JOIN public.sub_subjects source_ss
      ON source_ss.id = c.sub_subject_id
     AND COALESCE(source_ss.is_active, true) = true
    LEFT JOIN public.sub_subjects selected_ss
      ON selected_ss.id = _sub_subject_id
     AND selected_ss.group_id = _group_id
     AND COALESCE(selected_ss.is_active, true) = true
    WHERE _sub_subject_id IS NULL
      OR c.sub_subject_id = _sub_subject_id
      OR COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name) IS NULL
      OR (
        selected_ss.id IS NOT NULL
        AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = trim(selected_ss.name)
      )
      OR (
        selected_ss.id IS NOT NULL
        AND trim(COALESCE(NULLIF(trim(c.sub_subject), ''), source_ss.name)) = (SELECT trim(name) FROM target_subject)
      )
  ), visible_matches AS (
    SELECT c.* FROM sub_matches c
    WHERE public.content_target_matches_student(c.education_type, c.subject_id, c.group_id, v_student_id, c.target_section)
  ), counts AS (
    SELECT
      (SELECT count(*) FROM all_teacher_content) AS total_count,
      (SELECT count(*) FROM term_matches) AS term_count,
      (SELECT count(*) FROM sub_matches) AS sub_count,
      (SELECT count(*) FROM visible_matches) AS visible_count
  )
  SELECT
    CASE
      WHEN v_student_id IS NULL THEN 'student_not_authenticated'
      WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_student_id) THEN 'student_profile_not_found'
      WHEN total_count = 0 THEN 'no_teacher_content_for_subject_scope'
      WHEN term_count = 0 THEN 'blocked_by_term_filter'
      WHEN sub_count = 0 THEN 'blocked_by_sub_subject_filter'
      WHEN visible_count = 0 THEN 'blocked_by_student_target_filter'
      ELSE 'catalog_should_show_content'
    END AS reason,
    total_count,
    term_count,
    sub_count,
    visible_count,
    v_student.section,
    v_student.education_type,
    v_group.subject_id,
    v_group.term
  FROM counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_group_content_diagnostics(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_diagnostics(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';