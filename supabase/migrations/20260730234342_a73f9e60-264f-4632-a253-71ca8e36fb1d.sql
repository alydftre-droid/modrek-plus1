CREATE OR REPLACE FUNCTION public.admin_remove_teacher_grade_workspace(
  _teacher_id uuid,
  _assignment_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_count integer := 0;
  v_group_ids uuid[] := ARRAY[]::uuid[];
  v_subject_ids uuid[] := ARRAY[]::uuid[];
  v_content_ids uuid[] := ARRAY[]::uuid[];
  v_exam_ids uuid[] := ARRAY[]::uuid[];
  v_session_ids uuid[] := ARRAY[]::uuid[];
  v_deleted_assignments integer := 0;
  v_deleted_groups integer := 0;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF _teacher_id IS NULL OR _assignment_ids IS NULL OR cardinality(_assignment_ids) = 0 OR cardinality(_assignment_ids) > 50 THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE _grade_delete_assignments ON COMMIT DROP AS
  SELECT DISTINCT ta.id, ta.stage, ta.grade, ta.section, ta.category, ta.education_type
  FROM public.teacher_assignments ta
  WHERE ta.teacher_id = _teacher_id AND ta.id = ANY(_assignment_ids);

  SELECT count(*) INTO v_assignment_count FROM _grade_delete_assignments;
  IF v_assignment_count = 0 THEN
    RAISE EXCEPTION 'teacher_grade_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT s.id), ARRAY[]::uuid[]) INTO v_subject_ids
  FROM public.subjects s
  WHERE EXISTS (
    SELECT 1 FROM _grade_delete_assignments a
    WHERE s.stage = a.stage AND s.grade = a.grade AND s.category = a.category
      AND (a.section IS NULL OR s.section IS NULL OR s.section = a.section)
  );

  SELECT COALESCE(array_agg(DISTINCT cg.id), ARRAY[]::uuid[]) INTO v_group_ids
  FROM public.content_groups cg
  WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id AND cg.subject_id = ANY(v_subject_ids);

  SELECT COALESCE(array_agg(DISTINCT c.id), ARRAY[]::uuid[]) INTO v_content_ids
  FROM public.content c
  WHERE c.group_id = ANY(v_group_ids)
     OR (c.group_id IS NULL AND c.uploaded_by = _teacher_id AND c.subject_id = ANY(v_subject_ids));

  SELECT COALESCE(array_agg(DISTINCT e.id), ARRAY[]::uuid[]) INTO v_exam_ids
  FROM public.exams e
  WHERE e.teacher_id = _teacher_id
    AND (e.group_id = ANY(v_group_ids) OR (e.group_id IS NULL AND e.subject_id = ANY(v_subject_ids)));

  SELECT COALESCE(array_agg(DISTINCT ls.id), ARRAY[]::uuid[]) INTO v_session_ids
  FROM public.live_sessions ls
  WHERE ls.teacher_id = _teacher_id AND ls.group_id = ANY(v_group_ids);

  DELETE FROM public.student_activity_logs
  WHERE teacher_id = _teacher_id
    AND (group_id = ANY(v_group_ids) OR content_id = ANY(v_content_ids) OR exam_id = ANY(v_exam_ids));
  DELETE FROM public.bundled_package_subscription_groups
  WHERE teacher_id = _teacher_id AND group_id = ANY(v_group_ids);
  DELETE FROM public.teacher_earning_records
  WHERE teacher_id = _teacher_id AND (group_id = ANY(v_group_ids) OR subject_id = ANY(v_subject_ids));
  DELETE FROM public.live_session_recordings
  WHERE teacher_id = _teacher_id AND (group_id = ANY(v_group_ids) OR session_id = ANY(v_session_ids));
  DELETE FROM public.live_sessions WHERE id = ANY(v_session_ids);
  DELETE FROM public.exams WHERE id = ANY(v_exam_ids);
  DELETE FROM public.content WHERE id = ANY(v_content_ids);
  DELETE FROM public.ai_lessons
  WHERE group_id = ANY(v_group_ids)
     OR (group_id IS NULL AND created_by = _teacher_id AND subject_id = ANY(v_subject_ids));
  DELETE FROM public.subscription_requests
  WHERE teacher_id = _teacher_id AND subject_id = ANY(v_subject_ids);
  DELETE FROM public.subscriptions
  WHERE teacher_id = _teacher_id AND subject_id = ANY(v_subject_ids);
  DELETE FROM public.student_teacher_choices stc
  USING _grade_delete_assignments a
  WHERE stc.teacher_id = _teacher_id AND stc.stage = a.stage AND stc.grade = a.grade AND stc.category = a.category;
  DELETE FROM public.content_groups WHERE id = ANY(v_group_ids);
  GET DIAGNOSTICS v_deleted_groups = ROW_COUNT;
  DELETE FROM public.teacher_assignments
  WHERE teacher_id = _teacher_id AND id = ANY(_assignment_ids);
  GET DIAGNOSTICS v_deleted_assignments = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted_assignments', v_deleted_assignments,
    'deleted_groups', v_deleted_groups, 'deleted_content', cardinality(v_content_ids),
    'deleted_exams', cardinality(v_exam_ids), 'deleted_live_sessions', cardinality(v_session_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_remove_teacher_grade_workspace(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_teacher_grade_workspace(uuid, uuid[]) TO service_role;