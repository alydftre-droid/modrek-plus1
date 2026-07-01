CREATE OR REPLACE FUNCTION public.get_developer_student_exams(_student_id uuid)
RETURNS TABLE (
  exam_id uuid,
  attempt_id uuid,
  exam_title text,
  subject_name text,
  teacher_id uuid,
  teacher_name text,
  group_id uuid,
  group_title text,
  grade text,
  start_at timestamptz,
  end_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  total numeric,
  percentage numeric,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT auth.uid() AS id
  ), allowed AS (
    SELECT 1
    FROM caller
    WHERE id IS NOT NULL AND public.has_role(id, 'admin'::public.app_role)
  ), student_groups AS (
    SELECT DISTINCT sgp.group_id
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = _student_id
      AND sgp.group_id IS NOT NULL
  ), latest_attempts AS (
    SELECT DISTINCT ON (a.exam_id)
      a.id,
      a.exam_id,
      a.submitted_at,
      a.started_at,
      a.total_score,
      a.max_score,
      a.percentage,
      a.status AS attempt_status,
      a.updated_at,
      a.created_at
    FROM public.exam_attempts a
    WHERE a.student_id = _student_id
    ORDER BY a.exam_id, COALESCE(a.submitted_at, a.updated_at, a.started_at, a.created_at) DESC
  ), eligible AS (
    SELECT e.*
    FROM public.exams e
    WHERE EXISTS (SELECT 1 FROM allowed)
      AND (
        e.id IN (SELECT exam_id FROM latest_attempts)
        OR ((e.is_published = true OR e.status = 'published'::public.exam_status)
          AND (e.group_id IN (SELECT group_id FROM student_groups) OR e.group_id IS NULL))
      )
  )
  SELECT
    e.id AS exam_id,
    la.id AS attempt_id,
    e.title AS exam_title,
    COALESCE(es.name, gs.name) AS subject_name,
    COALESCE(e.teacher_id, cg.teacher_id, cg.created_by) AS teacher_id,
    tp.full_name AS teacher_name,
    e.group_id AS group_id,
    cg.title AS group_title,
    COALESCE(es.grade, gs.grade) AS grade,
    e.start_at,
    e.end_at,
    la.submitted_at,
    COALESCE(la.total_score, 0) AS score,
    COALESCE(la.max_score, e.total_marks, 0) AS total,
    COALESCE(
      la.percentage,
      CASE WHEN COALESCE(la.max_score, e.total_marks, 0) > 0 THEN ROUND((COALESCE(la.total_score, 0) / COALESCE(la.max_score, e.total_marks)) * 100, 2) ELSE 0 END
    ) AS percentage,
    CASE
      WHEN la.submitted_at IS NOT NULL OR la.attempt_status IN ('submitted'::public.exam_attempt_status, 'graded'::public.exam_attempt_status) THEN 'solved'
      ELSE 'missed'
    END AS status,
    e.created_at
  FROM eligible e
  LEFT JOIN public.content_groups cg ON cg.id = e.group_id
  LEFT JOIN latest_attempts la ON la.exam_id = e.id
  LEFT JOIN public.subjects es ON es.id = e.subject_id
  LEFT JOIN public.subjects gs ON gs.id = cg.subject_id
  LEFT JOIN public.profiles tp ON tp.id = COALESCE(e.teacher_id, cg.teacher_id, cg.created_by)
  ORDER BY COALESCE(cg.title, 'امتحان عام'), e.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_developer_student_exams(uuid) TO authenticated;
