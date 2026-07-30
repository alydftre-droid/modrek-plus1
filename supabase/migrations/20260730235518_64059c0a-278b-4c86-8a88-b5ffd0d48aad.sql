DO $test$
DECLARE
  v_teacher_id uuid;
  v_assignment_id uuid;
  v_result jsonb;
BEGIN
  SELECT ta.teacher_id, ta.id
    INTO v_teacher_id, v_assignment_id
  FROM public.teacher_assignments ta
  ORDER BY ta.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_teacher_id IS NULL OR v_assignment_id IS NULL THEN
    RAISE EXCEPTION 'grade_delete_test_requires_assignment';
  END IF;

  BEGIN
    v_result := public.admin_remove_teacher_grade_workspace(
      v_teacher_id,
      ARRAY[v_assignment_id]::uuid[]
    );

    IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'grade_delete_test_unsuccessful: %', v_result;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.teacher_assignments
      WHERE teacher_id = v_teacher_id AND id = v_assignment_id
    ) THEN
      RAISE EXCEPTION 'grade_delete_test_assignment_still_exists';
    END IF;

    RAISE EXCEPTION USING ERRCODE = 'PT001', MESSAGE = 'rollback_successful_grade_delete_test';
  EXCEPTION
    WHEN SQLSTATE 'PT001' THEN
      NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_assignments
    WHERE teacher_id = v_teacher_id AND id = v_assignment_id
  ) THEN
    RAISE EXCEPTION 'grade_delete_test_rollback_failed';
  END IF;
END;
$test$;