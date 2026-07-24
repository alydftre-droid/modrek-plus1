
-- 1) Helper (idempotent) + grants
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

-- 2) Ensure the public SELECT policy on content enforces education_type
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

-- 3) Rewrite catalog RPC to strictly enforce education_type
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
    BEGIN
      v_is_admin := has_role(v_student_id, 'admin'::app_role);
    EXCEPTION WHEN OTHERS THEN
      v_is_admin := false;
    END;

    SELECT EXISTS (
      SELECT 1 FROM public.student_group_purchases sgp
      WHERE sgp.student_id = v_student_id AND sgp.group_id = _group_id
    ) INTO v_is_purchased;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.title, c.type, c.file_url, c.thumbnail_url, c.description,
    c.created_at, c.is_paid, c.is_free_preview,
    c.group_id, c.subject_id, c.sub_subject, c.sub_subject_id,
    (v_is_admin OR v_is_purchased OR COALESCE(c.is_paid,false) = false OR COALESCE(c.is_free_preview,false) = true) AS is_accessible
  FROM public.content c
  WHERE c.group_id = _group_id
    AND COALESCE(c.is_active, true) = true
    AND COALESCE(c.type, '') <> 'student_library'
    AND term_item_matches_current_system_term(c.subject_id, c.group_id, c.term)
    AND (_sub_subject_id IS NULL OR c.sub_subject_id = _sub_subject_id)
    AND (
      v_is_admin
      OR c.education_type IS NULL
      OR btrim(c.education_type) = ''
      OR lower(btrim(c.education_type)) = 'both'
      OR (v_student_edu IS NOT NULL AND btrim(c.education_type) = btrim(v_student_edu))
    )
  ORDER BY c.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_student_group_content_catalog(uuid, uuid) TO anon, authenticated, service_role;
