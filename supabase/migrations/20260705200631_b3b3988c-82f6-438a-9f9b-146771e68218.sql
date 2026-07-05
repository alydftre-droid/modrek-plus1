CREATE OR REPLACE FUNCTION public.get_exam_leaderboard(_exam_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE(rank bigint, student_id uuid, student_name text, percentage numeric, total_score numeric, time_spent_seconds integer, submitted_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ROW_NUMBER() OVER (ORDER BY a.percentage DESC, a.time_spent_seconds ASC) AS rank,
    a.student_id,
    COALESCE(p.full_name, 'طالب') AS student_name,
    a.percentage,
    a.total_score,
    a.time_spent_seconds,
    a.submitted_at
  FROM public.exam_attempts a
  LEFT JOIN public.profiles p ON p.id = a.student_id
  WHERE a.exam_id = _exam_id
    AND a.status IN ('submitted','graded')
    AND NOT public.is_test_student(a.student_id)
  ORDER BY rank
  LIMIT _limit;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_leaderboard(uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';