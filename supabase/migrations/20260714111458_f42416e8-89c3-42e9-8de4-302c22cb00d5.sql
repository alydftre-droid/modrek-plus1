INSERT INTO public.library_tracks (code, name_ar, sort_order, is_active)
VALUES ('scientific', 'علمي', 1, true)
ON CONFLICT (code) DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

UPDATE public.library_tracks
SET sort_order = CASE code
  WHEN 'none' THEN 0
  WHEN 'scientific' THEN 1
  WHEN 'sci_science' THEN 2
  WHEN 'sci_math' THEN 3
  WHEN 'literary' THEN 4
  ELSE sort_order
END,
updated_at = now()
WHERE code IN ('none', 'scientific', 'sci_science', 'sci_math', 'literary');

CREATE OR REPLACE FUNCTION public.library_profile_grade_code(_stage text, _grade text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' AND btrim(coalesce(_grade, '')) IN ('first', 'الأول', 'اول', 'أول', 'الصف الأول', 'الاول', '1') THEN 'pr1'
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' AND btrim(coalesce(_grade, '')) IN ('second', 'الثاني', 'ثاني', 'الصف الثاني', 'الثانى', '2') THEN 'pr2'
    WHEN public.library_stage_code_from_subject(_stage) = 'preparatory' AND btrim(coalesce(_grade, '')) IN ('third', 'الثالث', 'ثالث', 'الصف الثالث', '3') THEN 'pr3'
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' AND btrim(coalesce(_grade, '')) IN ('first', 'الأول', 'اول', 'أول', 'الصف الأول', 'الاول', '1') THEN 'sec1'
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' AND btrim(coalesce(_grade, '')) IN ('second', 'الثاني', 'ثاني', 'الصف الثاني', 'الثانى', '2') THEN 'sec2'
    WHEN public.library_stage_code_from_subject(_stage) = 'secondary' AND btrim(coalesce(_grade, '')) IN ('third', 'الثالث', 'ثالث', 'الصف الثالث', '3') THEN 'sec3'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('first', 'الأول', 'اول', 'أول', 'الصف الأول', 'الاول', '1') THEN 'p1'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('second', 'الثاني', 'ثاني', 'الصف الثاني', 'الثانى', '2') THEN 'p2'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('third', 'الثالث', 'ثالث', 'الصف الثالث', '3') THEN 'p3'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('fourth', 'الرابع', 'رابع', 'الصف الرابع', '4') THEN 'p4'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('fifth', 'الخامس', 'خامس', 'الصف الخامس', '5') THEN 'p5'
    WHEN public.library_stage_code_from_subject(_stage) = 'primary' AND btrim(coalesce(_grade, '')) IN ('sixth', 'السادس', 'سادس', 'الصف السادس', '6') THEN 'p6'
    ELSE nullif(btrim(coalesce(_grade, '')), '')
  END
$$;

CREATE OR REPLACE FUNCTION public.library_profile_track_code(_section text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(coalesce(_section, '')) IN ('علمي علوم', 'علمى علوم', 'science_track') THEN 'sci_science'
    WHEN btrim(coalesce(_section, '')) IN ('علمي رياضة', 'علمى رياضة', 'math_track') THEN 'sci_math'
    WHEN btrim(coalesce(_section, '')) IN ('علمي', 'علمى', 'scientific', 'science', 'sci', 'علم') THEN 'scientific'
    WHEN btrim(coalesce(_section, '')) IN ('أدبي', 'ادبي', 'أدبى', 'ادبى', 'literary') THEN 'literary'
    ELSE nullif(btrim(coalesce(_section, '')), '')
  END
$$;

REVOKE ALL ON FUNCTION public.library_profile_grade_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_profile_track_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.library_profile_grade_code(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.library_profile_track_code(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Students view scoped ready free library books" ON public.library_books;
CREATE POLICY "Students view scoped ready free library books"
ON public.library_books
FOR SELECT
TO authenticated
USING (
  status = 'ready'
  AND access_tier = 'free'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.library_stages st ON st.id = library_books.stage_id
      LEFT JOIN public.library_grades gr ON gr.id = library_books.grade_id
      LEFT JOIN public.library_sections sec ON sec.id = library_books.section_id
      LEFT JOIN public.library_tracks tr ON tr.id = library_books.track_id
      WHERE p.id = auth.uid()
        AND coalesce(p.role, 'student') = 'student'
        AND (
          library_books.education_type = 'both'
          OR p.education_type IS NULL
          OR library_books.education_type = p.education_type
        )
        AND (
          library_books.stage_id IS NULL
          OR st.code = public.library_stage_code_from_subject(p.stage)
        )
        AND (
          library_books.grade_id IS NULL
          OR gr.code = public.library_profile_grade_code(p.stage, p.grade)
        )
        AND (
          library_books.section_id IS NULL
          OR sec.code = 'shared'
          OR sec.code = CASE
            WHEN p.education_type = 'عام' THEN 'general'
            WHEN p.education_type = 'أزهر' THEN 'azhar'
            ELSE sec.code
          END
        )
        AND (
          library_books.track_id IS NULL
          OR tr.code = 'none'
          OR public.library_profile_track_code(p.section) IS NULL
          OR public.library_profile_track_code(p.section) = ''
          OR tr.code = public.library_profile_track_code(p.section)
          OR (public.library_profile_track_code(p.section) = 'scientific' AND tr.code IN ('scientific', 'sci_science', 'sci_math'))
          OR (tr.code = 'scientific' AND public.library_profile_track_code(p.section) IN ('scientific', 'sci_science', 'sci_math'))
        )
    )
  )
);

NOTIFY pgrst, 'reload schema';