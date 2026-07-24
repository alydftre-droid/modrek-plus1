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
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  -- Only validate that the group itself is a real active published group.
  -- Do NOT filter catalog rows by subscription, section, education type, or term here.
  -- The frontend uses this function for preview/catalog display; access remains locked below.
  IF NOT EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = _group_id
      AND cg.is_active = true
      AND COALESCE(cg.price_approved, true) = true
  ) THEN
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
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
  ORDER BY COALESCE(c.order_index, 0) ASC, c.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_student_group_exam_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  duration_minutes integer,
  total_marks numeric,
  pass_marks numeric,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  is_ai_generated boolean,
  group_id uuid,
  subject_id uuid,
  sub_subject_id uuid,
  term text,
  created_at timestamp with time zone,
  is_accessible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_is_purchased boolean := false;
BEGIN
  IF v_student_id IS NULL THEN
    RETURN;
  END IF;

  -- Only validate that the group itself is a real active published group.
  -- Do NOT filter the exam list by subscription; lock starting from the UI/access RPCs.
  IF NOT EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = _group_id
      AND cg.is_active = true
      AND COALESCE(cg.price_approved, true) = true
  ) THEN
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
    e.id,
    e.title,
    e.description,
    e.duration_minutes,
    e.total_marks,
    e.pass_marks,
    e.start_at,
    e.end_at,
    COALESCE(e.is_ai_generated, false) AS is_ai_generated,
    e.group_id,
    e.subject_id,
    e.sub_subject_id,
    e.term,
    e.created_at,
    v_is_purchased AS is_accessible
  FROM public.exams e
  WHERE e.group_id = _group_id
    AND e.is_published = true
    AND e.status = 'published'::public.exam_status
    AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO service_role;