-- get_student_group_exam_catalog_return_type_hardening
DROP FUNCTION IF EXISTS public.get_student_group_exam_catalog(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_student_group_exam_catalog(uuid) CASCADE;

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
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_group public.content_groups%ROWTYPE;
  v_is_purchased boolean := false;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND cg.is_active = true
    AND COALESCE(cg.price_approved, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.term_item_matches_current_system_term(v_group.subject_id, v_group.id, v_group.term) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = v_student_id
      AND sgp.group_id = _group_id
  ) INTO v_is_purchased;

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
    v_is_purchased AS is_accessible
  FROM public.exams e
  WHERE e.group_id = _group_id
    AND e.is_published = true
    AND e.status = 'published'::public.exam_status
    AND e.term = v_group.term
    AND public.term_item_matches_current_system_term(e.subject_id, e.group_id, e.term)
    AND public.exam_target_matches_student(v_student_id, e.target_section, e.target_education_type)
    AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO service_role;