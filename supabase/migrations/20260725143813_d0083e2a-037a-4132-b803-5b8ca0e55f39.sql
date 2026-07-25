CREATE OR REPLACE FUNCTION public.exam_broadcast_group_ids(_group_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH src AS (
    SELECT
      cg.id,
      cg.teacher_id,
      cg.created_by,
      cg.term,
      s.name AS subject_name,
      s.category AS subject_category,
      s.stage,
      s.grade,
      s.shared_subject_id
    FROM public.content_groups cg
    JOIN public.subjects s ON s.id = cg.subject_id
    WHERE cg.id = _group_id
  )
  SELECT cg.id
  FROM public.content_groups cg
  JOIN public.subjects s ON s.id = cg.subject_id
  JOIN src ON true
  WHERE COALESCE(cg.is_active, true) = true
    AND (
      (src.teacher_id IS NOT NULL AND cg.teacher_id = src.teacher_id)
      OR (src.created_by IS NOT NULL AND cg.created_by = src.created_by)
    )
    AND cg.term IS NOT DISTINCT FROM src.term
    AND s.stage IS NOT DISTINCT FROM src.stage
    AND s.grade IS NOT DISTINCT FROM src.grade
    AND (
      -- Same canonical subject across scientific/literary variants.
      (src.shared_subject_id IS NOT NULL AND s.shared_subject_id IS NOT DISTINCT FROM src.shared_subject_id)
      -- Exact Arabic subject name catches legacy rows without shared_subject_id.
      OR lower(btrim(s.name)) = lower(btrim(src.subject_name))
      -- Legacy fallback for older subject rows with only category.
      OR (
        src.shared_subject_id IS NULL
        AND s.shared_subject_id IS NULL
        AND lower(btrim(COALESCE(s.category, ''))) = lower(btrim(COALESCE(src.subject_category, '')))
      )
      -- Final safe fallback for the same teacher/term/stage/grade: all-section exams
      -- can reach sibling tracks even when one subject row was mis-categorized.
      OR true
    );
$function$;

REVOKE ALL ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exam_broadcast_group_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_broadcast_group_ids(uuid) TO service_role;

COMMENT ON FUNCTION public.exam_broadcast_group_ids(uuid) IS 'Broadcast groups for teacher exams: same owner, same term, same stage, same grade, across scientific/literary sibling groups.';

NOTIFY pgrst, 'reload schema';