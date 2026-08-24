-- =====================================================================
-- 1) ad_targets: column-level security instead of a SECURITY DEFINER view
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ad_target_includes_me(_target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ad_targets t
    WHERE t.id = _target_id
      AND auth.uid() IS NOT NULL
      AND auth.uid() = ANY (t.student_ids)
  )
$$;

REVOKE ALL ON FUNCTION public.ad_target_includes_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_target_includes_me(uuid) TO authenticated;

-- Admins read the sensitive student_ids through a role-checked function
CREATE OR REPLACE FUNCTION public.admin_get_ad_target(_ad_id uuid)
RETURNS TABLE (
  id uuid,
  ad_id uuid,
  target_type public.ad_target_type,
  stage text,
  education_type text,
  grade text,
  section text,
  student_ids uuid[],
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT t.id, t.ad_id, t.target_type, t.stage, t.education_type,
         t.grade, t.section, t.student_ids, t.created_at
  FROM public.ad_targets t
  WHERE t.ad_id = _ad_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_ad_target(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ad_target(uuid) TO authenticated;

-- Signed-in users may read non-sensitive targeting metadata only.
DROP POLICY IF EXISTS ad_targets_authenticated_read ON public.ad_targets;
CREATE POLICY ad_targets_authenticated_read
ON public.ad_targets FOR SELECT TO authenticated
USING (true);

REVOKE SELECT ON public.ad_targets FROM authenticated;
GRANT SELECT (id, ad_id, target_type, stage, education_type, grade, section, created_at)
  ON public.ad_targets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_targets TO authenticated;
GRANT ALL ON public.ad_targets TO service_role;

-- Rebuild the view as SECURITY INVOKER; masking now goes through the
-- role-safe helper function instead of the view owner's privileges.
DROP VIEW IF EXISTS public.ad_targets_safe;
CREATE VIEW public.ad_targets_safe
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.ad_id,
  t.target_type,
  t.stage,
  t.education_type,
  t.grade,
  t.section,
  t.created_at,
  CASE
    WHEN public.ad_target_includes_me(t.id) THEN ARRAY[auth.uid()]
    ELSE '{}'::uuid[]
  END AS student_ids
FROM public.ad_targets t;

GRANT SELECT ON public.ad_targets_safe TO authenticated;
GRANT ALL ON public.ad_targets_safe TO service_role;

-- =====================================================================
-- 2) Restrict the student exam policy to signed-in users so the
--    matching helpers no longer need to be callable by anon.
-- =====================================================================
DROP POLICY IF EXISTS "Students view subscribed current-term exams" ON public.exams;
CREATE POLICY "Students view subscribed current-term exams"
ON public.exams FOR SELECT TO authenticated
USING (
  is_published = true
  AND status = 'published'::exam_status
  AND group_id IS NOT NULL
  AND term_item_matches_current_system_term(subject_id, group_id, term)
  AND EXISTS (
    SELECT 1 FROM public.student_group_purchases sgp
    WHERE sgp.group_id = exams.group_id AND sgp.student_id = auth.uid()
  )
  AND exam_target_matches_student(auth.uid(), target_section, target_education_type, subject_id, group_id)
);

-- =====================================================================
-- 3) Revoke anon EXECUTE on helpers only signed-in policies evaluate.
--    (term_item_matches_current_system_term and
--     group_matches_current_system_term stay callable by anon because the
--     free-preview / public catalogue policies need them.)
-- =====================================================================
REVOKE ALL ON FUNCTION public.content_target_matches_student(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.content_target_matches_student(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.content_effective_education_type(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.content_group_sibling_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exam_target_matches_student(uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exam_effective_section(text, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_target_matches_student(text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_effective_education_type(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.content_group_sibling_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_target_matches_student(uuid, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_effective_section(text, uuid, uuid) TO authenticated;