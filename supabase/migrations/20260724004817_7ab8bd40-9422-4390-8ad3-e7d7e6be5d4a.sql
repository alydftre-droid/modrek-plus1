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
  -- The function is granted only to authenticated users, but do not let a
  -- missing uid parsing issue turn the visible catalog into an empty list.
  -- In that case rows are still returned as locked preview metadata.
  IF v_student_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  -- Validate only that the group exists and is active. Do not require price
  -- approval, current term matching, section matching, or a subscription for
  -- catalog display. Access is controlled per-row below by stripping file_url.
  IF NOT EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = _group_id
      AND COALESCE(cg.is_active, true) = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.type,
    CASE
      WHEN v_is_purchased OR NOT COALESCE(c.is_paid, true) OR COALESCE(c.is_free_preview, false) THEN COALESCE(c.file_url, '')
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
    AND COALESCE(c.is_active, true) = true
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
  ORDER BY COALESCE(c.order_index, 0) ASC, c.created_at ASC, c.id ASC;
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
  IF v_student_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id
        AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.content_groups cg
    WHERE cg.id = _group_id
      AND COALESCE(cg.is_active, true) = true
  ) THEN
    RETURN;
  END IF;

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
    AND COALESCE(e.is_published, false) = true
    AND e.status = 'published'::public.exam_status
    AND (_sub_subject_id IS NULL OR e.sub_subject_id = _sub_subject_id)
  ORDER BY e.created_at DESC, e.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_exam_catalog(uuid, uuid) TO service_role;