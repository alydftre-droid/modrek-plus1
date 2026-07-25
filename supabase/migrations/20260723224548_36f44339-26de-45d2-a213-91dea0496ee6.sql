-- get_student_group_content_catalog_return_type_hardening
DROP FUNCTION IF EXISTS public.get_student_group_content_catalog(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_student_group_content_catalog(uuid) CASCADE;

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

  -- Strict workspace isolation: the group itself must belong to the currently active term
  -- for its stage/grade, matching the student-facing group list.
  IF NOT public.term_item_matches_current_system_term(v_group.subject_id, v_group.id, v_group.term) THEN
    RETURN;
  END IF;

  SELECT p.education_type, p.section
    INTO v_student_education_type, v_student_section
  FROM public.profiles p
  WHERE p.id = v_student_id;

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
  WHERE c.group_id = _group_id
    AND c.is_active = true
    -- Content inside a group inherits the group's workspace. This prevents term2 groups
    -- appearing empty because rows were stamped with a stale global term.
    AND c.term = v_group.term
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND (
      v_student_education_type IS NULL
      OR c.education_type IS NULL
      OR c.education_type = 'both'
      OR c.education_type = v_student_education_type
    )
    AND (
      COALESCE(public.normalize_section(v_student_section), '') = ''
      OR COALESCE(public.normalize_section(cs.section), '') = ''
      OR public.normalize_section(cs.section) = public.normalize_section(v_student_section)
    )
  ORDER BY c.order_index ASC, c.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO service_role;

-- Repair existing rows whose group is in a valid active workspace but content was stamped
-- with a different term during upload.
UPDATE public.content c
SET term = cg.term
FROM public.content_groups cg
WHERE c.group_id = cg.id
  AND c.term IS DISTINCT FROM cg.term
  AND cg.term IN ('term1', 'term2')
  AND c.is_active = true;

UPDATE public.exams e
SET term = cg.term
FROM public.content_groups cg
WHERE e.group_id = cg.id
  AND e.term IS DISTINCT FROM cg.term
  AND cg.term IN ('term1', 'term2');