CREATE OR REPLACE FUNCTION public.get_developer_student_exam_filter_options(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_subjects jsonb := '[]'::jsonb;
  v_groups jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name)) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb)
  INTO v_subjects
  FROM public.subscriptions sub
  JOIN public.subjects s ON s.id = sub.subject_id
  WHERE sub.student_id = _student_id
    AND sub.is_active = true
    AND (sub.end_date IS NULL OR sub.end_date > now());

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'id', cg.id,
    'title', cg.title,
    'subject_id', s.id,
    'subject_name', s.name
  )) FILTER (WHERE cg.id IS NOT NULL), '[]'::jsonb)
  INTO v_groups
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  LEFT JOIN public.subjects s ON s.id = cg.subject_id
  WHERE sgp.student_id = _student_id;

  RETURN jsonb_build_object(
    'subjects', COALESCE(v_subjects, '[]'::jsonb),
    'groups', COALESCE(v_groups, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_exam_filter_options(uuid) TO authenticated;