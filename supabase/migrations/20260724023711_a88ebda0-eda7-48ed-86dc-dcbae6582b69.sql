
-- 1) Helper to compare content's education_type with student's education_type
CREATE OR REPLACE FUNCTION public.content_target_matches_student(_content_edu text, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN _content_edu IS NULL OR btrim(_content_edu) = '' OR lower(btrim(_content_edu)) = 'both' THEN true
      WHEN _student_id IS NULL THEN false
      ELSE btrim(_content_edu) = btrim(COALESCE(
        (SELECT education_type FROM public.profiles WHERE id = _student_id),
        ''
      ))
    END
$$;

GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid) TO anon, authenticated, service_role;

-- 2) Replace the public SELECT policy with an education-type-aware version
DROP POLICY IF EXISTS "Public can view accessible current-term content" ON public.content;

CREATE POLICY "Public can view accessible current-term content"
ON public.content
FOR SELECT
USING (
  COALESCE(type, '') <> 'student_library'
  AND COALESCE(is_active, true) = true
  AND term_item_matches_current_system_term(subject_id, group_id, term)
  AND public.content_target_matches_student(education_type, auth.uid())
  AND (
    COALESCE(is_paid, false) = false
    OR COALESCE(is_free_preview, false) = true
    OR (
      group_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.student_group_purchases sgp
        WHERE sgp.student_id = auth.uid() AND sgp.group_id = content.group_id
      )
    )
    OR (
      subject_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.student_id = auth.uid()
          AND s.subject_id = content.subject_id
          AND s.is_active = true
          AND s.end_date > now()
      )
    )
  )
);

-- 3) Update group catalog RPC to enforce education_type filter
CREATE OR REPLACE FUNCTION public.get_student_group_content_catalog(_group_id uuid, _sub_subject_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid, title text, type text, file_url text, thumbnail_url text, description text,
  created_at timestamp with time zone, is_paid boolean, is_free_preview boolean,
  group_id uuid, subject_id uuid, sub_subject text, sub_subject_id uuid, is_accessible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student_id uuid := auth.uid();
  v_student_edu text := NULL;
  v_is_purchased boolean := false;
  v_is_admin boolean := false;
BEGIN
  IF v_student_id IS NOT NULL THEN
    SELECT education_type INTO v_student_edu FROM public.profiles WHERE id = v_student_id;
    v_is_admin := has_role(v_student_id, 'admin'::app_role);

    SELECT EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.content_groups cg
    WHERE cg.id = _group_id AND COALESCE(cg.is_active, true) = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.type,
    CASE
      WHEN v_is_purchased OR NOT COALESCE(c.is_paid, true) OR COALESCE(c.is_free_preview, false)
        THEN COALESCE(c.file_url, '')
      ELSE ''::text
    END AS file_url,
    COALESCE(
      NULLIF(c.thumbnail_url, ''),
      CASE
        WHEN c.type = 'video' AND c.file_url LIKE 'bunny://%'
          THEN 'https://vz-9fc4b938-1b7.b-cdn.net/' || replace(c.file_url, 'bunny://', '') || '/thumbnail.jpg'
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
    AND (
      v_is_admin
      OR c.education_type IS NULL
      OR btrim(c.education_type) = ''
      OR lower(btrim(c.education_type)) = 'both'
      OR btrim(c.education_type) = btrim(COALESCE(v_student_edu, ''))
    )
  ORDER BY COALESCE(c.order_index, 0) ASC, c.created_at ASC, c.id ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO anon, authenticated, service_role;
