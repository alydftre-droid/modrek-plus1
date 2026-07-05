CREATE OR REPLACE FUNCTION public.report_test_student_query_result(
  _source_table text,
  _student_ids uuid[],
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_student uuid;
  v_allowed_sources text[] := ARRAY[
    'student_teacher_choices',
    'student_group_purchases',
    'teacher_messages',
    'teacher_earning_records',
    'teacher_wallet_transactions',
    'profiles',
    'video_progress',
    'exam_attempts',
    'student_activity_logs'
  ];
BEGIN
  IF v_caller IS NULL OR _student_ids IS NULL OR array_length(_student_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF _source_table IS NULL OR NOT (_source_table = ANY(v_allowed_sources)) THEN
    _source_table := 'unknown_teacher_query';
  END IF;

  FOR v_student IN
    SELECT DISTINCT unnest(_student_ids)
  LOOP
    IF v_student IS NOT NULL AND public.is_test_student(v_student) THEN
      PERFORM public.log_test_student_teacher_leak(
        'detected_teacher_query_result_test_student',
        _source_table,
        v_caller,
        v_student,
        NULL,
        COALESCE(_context, '{}'::jsonb)
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_test_student_query_result(text, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_test_student_query_result(text, uuid[], jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';