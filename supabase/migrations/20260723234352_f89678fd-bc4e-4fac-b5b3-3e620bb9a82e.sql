CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  title text,
  type text,
  file_url text,
  thumbnail_url text,
  description text,
  created_at timestamp with time zone,
  is_paid boolean,
  is_free_preview boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject text,
  sub_subject_id uuid,
  is_accessible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_group public.content_groups%ROWTYPE;
  v_subject public.subjects%ROWTYPE;
  v_is_purchased boolean := false;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_group
  FROM public.content_groups cg
  WHERE cg.id = _group_id
    AND cg.is_active = true
    AND COALESCE(cg.price_approved, true) = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_subject
  FROM public.subjects s
  WHERE s.id = v_group.subject_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT public.term_item_matches_current_system_term(v_group.subject_id, v_group.id, v_group.term) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.student_id = v_student_id
      AND sgp.group_id = _group_id
  ) INTO v_is_purchased;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.type,
    CASE
      WHEN v_is_purchased OR NOT COALESCE(c.is_paid, true) OR COALESCE(c.is_free_preview, false) THEN c.file_url
      ELSE ''::text
    END AS file_url,
    COALESCE(
      NULLIF(c.thumbnail_url, ''),
      CASE
        WHEN c.type = 'video' AND c.file_url LIKE 'bunny://%' THEN
          'https://vz-9fc4b938-1b7.b-cdn.net/' || replace(c.file_url, 'bunny://', '') || '/thumbnail.jpg'
        ELSE NULL::text
      END
    ) AS thumbnail_url,
    c.description,
    c.created_at,
    COALESCE(c.is_paid, true) AS is_paid,
    COALESCE(c.is_free_preview, false) AS is_free_preview,
    c.group_id,
    c.subject_id,
    c.sub_subject,
    c.sub_subject_id,
    (v_is_purchased OR NOT COALESCE(c.is_paid, true) OR COALESCE(c.is_free_preview, false)) AS is_accessible
  FROM public.content c
  WHERE c.group_id = _group_id
    AND c.is_active = true
    AND c.term = v_group.term
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
  ORDER BY c.order_index ASC, c.created_at ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO service_role;