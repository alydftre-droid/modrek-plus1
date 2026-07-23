CREATE OR REPLACE FUNCTION public.term_item_matches_current_system_term(_subject_id uuid, _group_id uuid, _term text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH resolved_subject AS (
    SELECT COALESCE(_subject_id, cg.subject_id) AS subject_id
    FROM (SELECT 1) seed
    LEFT JOIN public.content_groups cg ON cg.id = _group_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM resolved_subject rs
    JOIN public.subjects s ON s.id = rs.subject_id
    JOIN public.system_terms st
      ON st.stage = s.stage
     AND st.grade = public.term_grade_key(s.grade)
    WHERE _term IS NOT NULL
      AND st.current_term = _term
  );
$$;

REVOKE ALL ON FUNCTION public.term_item_matches_current_system_term(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.term_item_matches_current_system_term(uuid, uuid, text) TO anon, authenticated, service_role;

ALTER TABLE IF EXISTS public.content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Content is publicly readable" ON public.content;
DROP POLICY IF EXISTS "Content is viewable by authenticated" ON public.content;
DROP POLICY IF EXISTS "Students can view accessible content" ON public.content;
DROP POLICY IF EXISTS "Uploaders can view their own content" ON public.content;
DROP POLICY IF EXISTS "Teachers can insert content" ON public.content;
DROP POLICY IF EXISTS "Teachers can update own content" ON public.content;
DROP POLICY IF EXISTS "Teachers can view own current-term content" ON public.content;
DROP POLICY IF EXISTS "Teachers can insert current-term content" ON public.content;
DROP POLICY IF EXISTS "Teachers can update own current-term content" ON public.content;
DROP POLICY IF EXISTS "Public can view accessible current-term content" ON public.content;

CREATE POLICY "Teachers can view own current-term content"
ON public.content
FOR SELECT
TO authenticated
USING (
  auth.uid() = uploaded_by
  AND COALESCE(type, '') <> 'student_library'
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Teachers can insert current-term content"
ON public.content
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by
  AND COALESCE(type, '') <> 'student_library'
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Teachers can update own current-term content"
ON public.content
FOR UPDATE
TO authenticated
USING (
  auth.uid() = uploaded_by
  AND COALESCE(type, '') <> 'student_library'
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
)
WITH CHECK (
  auth.uid() = uploaded_by
  AND COALESCE(type, '') <> 'student_library'
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Public can view accessible current-term content"
ON public.content
FOR SELECT
TO public
USING (
  COALESCE(type, '') <> 'student_library'
  AND COALESCE(is_active, true) = true
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
  AND (
    COALESCE(is_paid, false) = false
    OR COALESCE(is_free_preview, false) = true
    OR (
      group_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.student_group_purchases sgp
        WHERE sgp.student_id = auth.uid()
          AND sgp.group_id = content.group_id
      )
    )
    OR (
      subject_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.student_id = auth.uid()
          AND s.subject_id = content.subject_id
          AND s.is_active = true
          AND s.end_date > now()
      )
    )
  )
);

ALTER TABLE IF EXISTS public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Teachers manage own exams" ON public.exams;
DROP POLICY IF EXISTS "Students view subscribed exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can view own current-term exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can create own current-term exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can update own current-term exams" ON public.exams;
DROP POLICY IF EXISTS "Teachers can delete own current-term exams" ON public.exams;
DROP POLICY IF EXISTS "Students view subscribed current-term exams" ON public.exams;

CREATE POLICY "Teachers can view own current-term exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  auth.uid() = teacher_id
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Teachers can create own current-term exams"
ON public.exams
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Teachers can update own current-term exams"
ON public.exams
FOR UPDATE
TO authenticated
USING (
  auth.uid() = teacher_id
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
)
WITH CHECK (
  auth.uid() = teacher_id
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Teachers can delete own current-term exams"
ON public.exams
FOR DELETE
TO authenticated
USING (
  auth.uid() = teacher_id
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
);

CREATE POLICY "Students view subscribed current-term exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  is_published = true
  AND status = 'published'::public.exam_status
  AND group_id IS NOT NULL
  AND public.term_item_matches_current_system_term(subject_id, group_id, term)
  AND EXISTS (
    SELECT 1
    FROM public.student_group_purchases sgp
    WHERE sgp.group_id = exams.group_id
      AND sgp.student_id = auth.uid()
  )
  AND public.exam_target_matches_student(auth.uid(), target_section, target_education_type)
);