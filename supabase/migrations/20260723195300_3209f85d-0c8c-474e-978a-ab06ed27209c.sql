CREATE OR REPLACE FUNCTION public.term_grade_key(_grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(_grade, ''))) IN ('1', 'first') THEN '1'
    WHEN lower(trim(coalesce(_grade, ''))) IN ('2', 'second') THEN '2'
    WHEN lower(trim(coalesce(_grade, ''))) IN ('3', 'third') THEN '3'
    WHEN coalesce(_grade, '') LIKE '%الأول%' OR coalesce(_grade, '') LIKE '%الاول%' THEN '1'
    WHEN coalesce(_grade, '') LIKE '%الثاني%' THEN '2'
    WHEN coalesce(_grade, '') LIKE '%الثالث%' THEN '3'
    ELSE lower(trim(coalesce(_grade, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.group_matches_current_system_term(_subject_id uuid, _term text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = public.term_grade_key(s.grade)
    WHERE s.id = _subject_id
      AND st.current_term = _term
  );
$$;

REVOKE ALL ON FUNCTION public.group_matches_current_system_term(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.term_grade_key(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.group_matches_current_system_term(uuid, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can view active groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers/Admins can manage groups" ON public.content_groups;
DROP POLICY IF EXISTS "Anyone can view active current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can view own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can create own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can update own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can delete own groups" ON public.content_groups;
DROP POLICY IF EXISTS "Admins can manage all groups" ON public.content_groups;

CREATE POLICY "Admins can manage all groups"
ON public.content_groups
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Anyone can view active current-term groups"
ON public.content_groups
FOR SELECT
TO public
USING (
  is_active = true
  AND public.group_matches_current_system_term(subject_id, term)
);

CREATE POLICY "Teachers can view own current-term groups"
ON public.content_groups
FOR SELECT
TO authenticated
USING (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND public.group_matches_current_system_term(subject_id, term)
);

CREATE POLICY "Teachers can create own current-term groups"
ON public.content_groups
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (teacher_id IS NULL OR auth.uid() = teacher_id)
  AND public.group_matches_current_system_term(subject_id, term)
);

CREATE POLICY "Teachers can update own current-term groups"
ON public.content_groups
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND public.group_matches_current_system_term(subject_id, term)
)
WITH CHECK (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND public.group_matches_current_system_term(subject_id, term)
);

CREATE POLICY "Teachers can delete own groups"
ON public.content_groups
FOR DELETE
TO authenticated
USING (auth.uid() = created_by OR auth.uid() = teacher_id);