CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(
  _group_id uuid,
  _sub_subject_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  type text,
  file_url text,
  thumbnail_url text,
  description text,
  created_at timestamptz,
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
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_student_education_type text;
  v_student_section text;
  v_group public.content_groups%ROWTYPE;
  v_subject public.subjects%ROWTYPE;
  v_is_purchased boolean := false;
  v_student_section_norm text;
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

  SELECT p.education_type, p.section
    INTO v_student_education_type, v_student_section
  FROM public.profiles p
  WHERE p.id = v_student_id;

  v_student_section_norm := CASE
    WHEN lower(trim(COALESCE(v_student_section, ''))) IN ('scientific', 'science', 'sci', 'علمي', 'علمى', 'علم', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات') THEN 'scientific'
    WHEN lower(trim(COALESCE(v_student_section, ''))) IN ('literary', 'أدبي', 'ادبي', 'أدبى', 'ادبى', 'الأدبي', 'الادبي') THEN 'literary'
    ELSE ''
  END;

  IF v_subject.stage = 'secondary'
     AND v_group.education_type IS NOT NULL
     AND v_group.education_type <> 'both'
     AND v_student_education_type IS NOT NULL
     AND v_group.education_type <> v_student_education_type THEN
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
      WHEN v_is_purchased OR COALESCE(c.is_free_preview, false) THEN c.file_url
      ELSE ''::text
    END AS file_url,
    CASE
      WHEN v_is_purchased OR COALESCE(c.is_free_preview, false) THEN c.thumbnail_url
      ELSE NULL::text
    END AS thumbnail_url,
    c.description,
    c.created_at,
    c.is_paid,
    COALESCE(c.is_free_preview, false) AS is_free_preview,
    c.group_id,
    c.subject_id,
    c.sub_subject,
    c.sub_subject_id,
    (v_is_purchased OR COALESCE(c.is_free_preview, false)) AS is_accessible
  FROM public.content c
  JOIN public.subjects cs ON cs.id = c.subject_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN lower(trim(COALESCE(cs.section, ''))) IN ('scientific', 'science', 'sci', 'علمي', 'علمى', 'علم', 'علمي علوم', 'علمى علوم', 'علوم', 'علمي رياضة', 'علمى رياضة', 'رياضة', 'رياضيات') THEN 'scientific'
      WHEN lower(trim(COALESCE(cs.section, ''))) IN ('literary', 'أدبي', 'ادبي', 'أدبى', 'ادبى', 'الأدبي', 'الادبي') THEN 'literary'
      ELSE ''
    END AS content_section_norm
  ) ns
  WHERE c.group_id = _group_id
    AND c.is_active = true
    AND c.term = v_group.term
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND (
      v_student_education_type IS NULL
      OR c.education_type IS NULL
      OR c.education_type = 'both'
      OR c.education_type = v_student_education_type
    )
    AND (
      v_student_section_norm = ''
      OR ns.content_section_norm = ''
      OR ns.content_section_norm = v_student_section_norm
    )
  ORDER BY c.order_index ASC, c.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO service_role;