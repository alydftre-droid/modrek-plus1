CREATE OR REPLACE FUNCTION public.get_student_purchased_group_teacher_details(_student_id uuid, _group_ids uuid[])
RETURNS TABLE (
  group_id uuid,
  teacher_id uuid,
  teacher_name text,
  teacher_avatar text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cg.id AS group_id,
    COALESCE(cg.teacher_id, cg.created_by) AS teacher_id,
    NULLIF(BTRIM(p.full_name), '') AS teacher_name,
    COALESCE(tp.photo_url, p.avatar_url) AS teacher_avatar
  FROM public.student_group_purchases sgp
  JOIN public.content_groups cg ON cg.id = sgp.group_id
  JOIN public.profiles p ON p.id = COALESCE(cg.teacher_id, cg.created_by)
  LEFT JOIN public.teacher_profiles tp ON tp.teacher_id = COALESCE(cg.teacher_id, cg.created_by)
  WHERE sgp.student_id = _student_id
    AND sgp.group_id = ANY(_group_ids)
    AND auth.uid() = _student_id;
$$;

REVOKE ALL ON FUNCTION public.get_student_purchased_group_teacher_details(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_purchased_group_teacher_details(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_purchased_group_teacher_details(uuid, uuid[]) TO service_role;