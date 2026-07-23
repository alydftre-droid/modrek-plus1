DROP POLICY IF EXISTS "Anyone can view active groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers/Admins can manage groups" ON public.content_groups;
DROP POLICY IF EXISTS "Anyone can view active current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can view own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can create own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can update own current-term groups" ON public.content_groups;
DROP POLICY IF EXISTS "Teachers can delete own groups" ON public.content_groups;

CREATE POLICY "Anyone can view active current-term groups"
ON public.content_groups
FOR SELECT
TO public
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = CASE
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('1', 'first') THEN '1'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('2', 'second') THEN '2'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('3', 'third') THEN '3'
       WHEN s.grade LIKE '%الأول%' OR s.grade LIKE '%الاول%' THEN '1'
       WHEN s.grade LIKE '%الثاني%' THEN '2'
       WHEN s.grade LIKE '%الثالث%' THEN '3'
       ELSE lower(trim(coalesce(s.grade, '')))
     END
    WHERE s.id = content_groups.subject_id
      AND st.current_term = content_groups.term
  )
);

CREATE POLICY "Teachers can view own current-term groups"
ON public.content_groups
FOR SELECT
TO authenticated
USING (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = CASE
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('1', 'first') THEN '1'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('2', 'second') THEN '2'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('3', 'third') THEN '3'
       WHEN s.grade LIKE '%الأول%' OR s.grade LIKE '%الاول%' THEN '1'
       WHEN s.grade LIKE '%الثاني%' THEN '2'
       WHEN s.grade LIKE '%الثالث%' THEN '3'
       ELSE lower(trim(coalesce(s.grade, '')))
     END
    WHERE s.id = content_groups.subject_id
      AND st.current_term = content_groups.term
  )
);

CREATE POLICY "Teachers can create own current-term groups"
ON public.content_groups
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (teacher_id IS NULL OR auth.uid() = teacher_id)
  AND EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = CASE
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('1', 'first') THEN '1'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('2', 'second') THEN '2'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('3', 'third') THEN '3'
       WHEN s.grade LIKE '%الأول%' OR s.grade LIKE '%الاول%' THEN '1'
       WHEN s.grade LIKE '%الثاني%' THEN '2'
       WHEN s.grade LIKE '%الثالث%' THEN '3'
       ELSE lower(trim(coalesce(s.grade, '')))
     END
    WHERE s.id = content_groups.subject_id
      AND st.current_term = content_groups.term
  )
);

CREATE POLICY "Teachers can update own current-term groups"
ON public.content_groups
FOR UPDATE
TO authenticated
USING (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = CASE
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('1', 'first') THEN '1'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('2', 'second') THEN '2'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('3', 'third') THEN '3'
       WHEN s.grade LIKE '%الأول%' OR s.grade LIKE '%الاول%' THEN '1'
       WHEN s.grade LIKE '%الثاني%' THEN '2'
       WHEN s.grade LIKE '%الثالث%' THEN '3'
       ELSE lower(trim(coalesce(s.grade, '')))
     END
    WHERE s.id = content_groups.subject_id
      AND st.current_term = content_groups.term
  )
)
WITH CHECK (
  (auth.uid() = created_by OR auth.uid() = teacher_id)
  AND EXISTS (
    SELECT 1
    FROM public.subjects s
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = CASE
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('1', 'first') THEN '1'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('2', 'second') THEN '2'
       WHEN lower(trim(coalesce(s.grade, ''))) IN ('3', 'third') THEN '3'
       WHEN s.grade LIKE '%الأول%' OR s.grade LIKE '%الاول%' THEN '1'
       WHEN s.grade LIKE '%الثاني%' THEN '2'
       WHEN s.grade LIKE '%الثالث%' THEN '3'
       ELSE lower(trim(coalesce(s.grade, '')))
     END
    WHERE s.id = content_groups.subject_id
      AND st.current_term = content_groups.term
  )
);

CREATE POLICY "Teachers can delete own groups"
ON public.content_groups
FOR DELETE
TO authenticated
USING (auth.uid() = created_by OR auth.uid() = teacher_id);