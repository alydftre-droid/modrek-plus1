CREATE OR REPLACE FUNCTION public.get_developer_teacher_subscriptions(_teacher_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'group_id', cg.id,
      'group_title', cg.title,
      'grade', cg.grade,
      'stage', cg.stage,
      'subject_id', cg.subject_id,
      'subject_name', s.name,
      'price', cg.price,
      'students_count', COALESCE((SELECT count(*) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id),0),
      'revenue', COALESCE((SELECT SUM(sgp.amount_paid) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id),0),
      'new_today', COALESCE((SELECT count(*) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id AND sgp.purchased_at > now() - interval '1 day'),0),
      'new_month', COALESCE((SELECT count(*) FROM public.student_group_purchases sgp WHERE sgp.group_id = cg.id AND sgp.purchased_at > now() - interval '30 days'),0)
    ) ORDER BY cg.created_at DESC)
    FROM public.content_groups cg
    LEFT JOIN public.subjects s ON s.id = cg.subject_id
    WHERE COALESCE(cg.teacher_id, cg.created_by) = _teacher_id
  ), '[]'::jsonb);
END;
$function$;