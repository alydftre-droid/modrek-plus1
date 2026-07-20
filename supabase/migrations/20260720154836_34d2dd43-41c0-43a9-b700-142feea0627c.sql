CREATE OR REPLACE FUNCTION public.get_teacher_exam_roster(_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exam public.exams%ROWTYPE;
  v_uid uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT * INTO v_exam
  FROM public.exams
  WHERE id = _exam_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'exam_not_found';
  END IF;

  IF v_exam.teacher_id <> v_uid AND NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  WITH purchased_students AS (
    SELECT DISTINCT sgp.student_id, sgp.purchased_at
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = v_exam.group_id
      AND NOT public.is_test_student(sgp.student_id)
  ),
  attempt_students AS (
    SELECT DISTINCT ea.student_id, NULL::timestamptz AS purchased_at
    FROM public.exam_attempts ea
    WHERE ea.exam_id = _exam_id
      AND NOT public.is_test_student(ea.student_id)
  ),
  all_students AS (
    SELECT student_id, max(purchased_at) AS purchased_at, true AS subscribed
    FROM purchased_students
    GROUP BY student_id
    UNION
    SELECT ats.student_id, NULL::timestamptz AS purchased_at, false AS subscribed
    FROM attempt_students ats
    WHERE NOT EXISTS (
      SELECT 1 FROM purchased_students ps WHERE ps.student_id = ats.student_id
    )
  ),
  ranked_attempts AS (
    SELECT
      ea.*,
      row_number() OVER (
        PARTITION BY ea.student_id
        ORDER BY
          CASE WHEN ea.status IN ('graded'::public.exam_attempt_status, 'submitted'::public.exam_attempt_status, 'expired'::public.exam_attempt_status) OR ea.submitted_at IS NOT NULL THEN 0 ELSE 1 END,
          COALESCE(ea.submitted_at, ea.completed_at, ea.started_at, ea.created_at) DESC
      ) AS rn,
      count(*) OVER (PARTITION BY ea.student_id) AS attempts_count
    FROM public.exam_attempts ea
    WHERE ea.exam_id = _exam_id
      AND NOT public.is_test_student(ea.student_id)
  ),
  selected_attempts AS (
    SELECT * FROM ranked_attempts WHERE rn = 1
  ),
  answer_summary AS (
    SELECT
      ea.attempt_id,
      count(*) FILTER (
        WHERE COALESCE(NULLIF(trim(ea.answer_text), ''), NULL) IS NOT NULL
           OR COALESCE(array_length(ea.selected_option_ids, 1), 0) > 0
      ) AS answered_count,
      COALESCE(sum(ea.marks_awarded), 0) AS marks_total
    FROM public.exam_answers ea
    JOIN selected_attempts sa ON sa.id = ea.attempt_id
    GROUP BY ea.attempt_id
  ),
  roster AS (
    SELECT
      s.student_id,
      s.subscribed,
      s.purchased_at,
      p.full_name,
      p.student_code,
      p.avatar_url,
      sa.id AS attempt_id,
      sa.attempt_number,
      sa.status,
      sa.started_at,
      sa.submitted_at,
      sa.completed_at,
      sa.time_spent_seconds,
      sa.total_score,
      sa.max_score,
      sa.percentage,
      sa.passed,
      sa.tab_switch_count,
      sa.fullscreen_exits,
      sa.is_graded,
      sa.graded_at,
      COALESCE(sa.attempts_count, 0) AS attempts_count,
      COALESCE(ans.answered_count, 0) AS answered_count,
      COALESCE(ans.marks_total, 0) AS marks_total,
      (sa.id IS NOT NULL AND (sa.status IN ('graded'::public.exam_attempt_status, 'submitted'::public.exam_attempt_status, 'expired'::public.exam_attempt_status) OR sa.submitted_at IS NOT NULL)) AS solved,
      (sa.id IS NOT NULL AND sa.status = 'in_progress'::public.exam_attempt_status) AS in_progress
    FROM all_students s
    LEFT JOIN public.profiles p ON p.id = s.student_id
    LEFT JOIN selected_attempts sa ON sa.student_id = s.student_id
    LEFT JOIN answer_summary ans ON ans.attempt_id = sa.id
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id', student_id,
      'profile', jsonb_build_object('id', student_id, 'full_name', full_name, 'student_code', student_code, 'avatar_url', avatar_url),
      'purchase', CASE WHEN subscribed THEN jsonb_build_object('student_id', student_id, 'group_id', v_exam.group_id, 'purchased_at', purchased_at) ELSE NULL END,
      'subscribed', subscribed,
      'attempt', CASE WHEN attempt_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', attempt_id,
        'exam_id', _exam_id,
        'student_id', student_id,
        'attempt_number', attempt_number,
        'status', status,
        'started_at', started_at,
        'submitted_at', submitted_at,
        'completed_at', completed_at,
        'time_spent_seconds', time_spent_seconds,
        'total_score', total_score,
        'max_score', max_score,
        'percentage', percentage,
        'passed', passed,
        'tab_switch_count', tab_switch_count,
        'fullscreen_exits', fullscreen_exits,
        'is_graded', is_graded,
        'graded_at', graded_at
      ) END,
      'attempts_count', attempts_count,
      'solved', solved,
      'in_progress', (NOT solved AND in_progress),
      'absent', (NOT solved),
      'answered_count', answered_count,
      'marks_total', marks_total
    )
    ORDER BY solved DESC, percentage DESC NULLS LAST, full_name NULLS LAST
  ), '[]'::jsonb)
  INTO v_rows
  FROM roster;

  WITH rowset AS (
    SELECT * FROM jsonb_to_recordset(v_rows) AS r(
      solved boolean,
      in_progress boolean,
      absent boolean,
      attempt jsonb
    )
  ), solved_rows AS (
    SELECT (attempt->>'percentage')::numeric AS percentage, COALESCE((attempt->>'passed')::boolean, false) AS passed
    FROM rowset
    WHERE solved IS TRUE AND attempt IS NOT NULL
  )
  SELECT jsonb_build_object(
    'enrolled', jsonb_array_length(v_rows),
    'solved', (SELECT count(*) FROM rowset WHERE solved IS TRUE),
    'absent', (SELECT count(*) FROM rowset WHERE absent IS TRUE),
    'inProgress', (SELECT count(*) FROM rowset WHERE in_progress IS TRUE),
    'average', COALESCE((SELECT round(avg(percentage))::int FROM solved_rows), 0),
    'highest', COALESCE((SELECT round(max(percentage))::int FROM solved_rows), 0),
    'passCount', (SELECT count(*) FROM solved_rows WHERE passed IS TRUE)
  ) INTO v_stats;

  RETURN jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'group_id', v_exam.group_id,
      'total_marks', v_exam.total_marks,
      'pass_marks', v_exam.pass_marks,
      'duration_minutes', v_exam.duration_minutes
    ),
    'rows', v_rows,
    'stats', v_stats
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_exam_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_exam_roster(uuid) TO authenticated, service_role;