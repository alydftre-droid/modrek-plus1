DROP POLICY IF EXISTS "Students view scoped ready free library books" ON public.library_books;

CREATE POLICY "Students view scoped ready free library books"
  ON public.library_books
  FOR SELECT
  TO authenticated
  USING (
    status = 'ready'
    AND access_tier = 'free'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        LEFT JOIN public.library_stages st ON st.id = library_books.stage_id
        LEFT JOIN public.library_grades gr ON gr.id = library_books.grade_id
        LEFT JOIN public.library_sections sec ON sec.id = library_books.section_id
        LEFT JOIN public.library_tracks tr ON tr.id = library_books.track_id
        WHERE p.id = auth.uid()
          AND COALESCE(p.role, 'student') = 'student'
          AND (
            library_books.education_type = 'both'
            OR p.education_type IS NULL
            OR library_books.education_type = p.education_type
          )
          AND (
            library_books.stage_id IS NULL
            OR st.code = p.stage
          )
          AND (
            library_books.grade_id IS NULL
            OR gr.code = CASE
              WHEN p.stage = 'preparatory' AND p.grade = 'first' THEN 'pr1'
              WHEN p.stage = 'preparatory' AND p.grade = 'second' THEN 'pr2'
              WHEN p.stage = 'preparatory' AND p.grade = 'third' THEN 'pr3'
              WHEN p.stage = 'secondary' AND p.grade = 'first' THEN 'sec1'
              WHEN p.stage = 'secondary' AND p.grade = 'second' THEN 'sec2'
              WHEN p.stage = 'secondary' AND p.grade = 'third' THEN 'sec3'
              WHEN p.stage = 'primary' AND p.grade = 'first' THEN 'p1'
              WHEN p.stage = 'primary' AND p.grade = 'second' THEN 'p2'
              WHEN p.stage = 'primary' AND p.grade = 'third' THEN 'p3'
              WHEN p.stage = 'primary' AND p.grade = 'fourth' THEN 'p4'
              WHEN p.stage = 'primary' AND p.grade = 'fifth' THEN 'p5'
              WHEN p.stage = 'primary' AND p.grade = 'sixth' THEN 'p6'
              ELSE p.grade
            END
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
            OR CASE
              WHEN p.section IN ('علمي علوم', 'علمى علوم') THEN 'sci_science'
              WHEN p.section IN ('علمي رياضة', 'علمى رياضة') THEN 'sci_math'
              WHEN p.section IN ('أدبي', 'ادبي', 'أدبى', 'ادبى') THEN 'literary'
              ELSE 'none'
            END = tr.code
          )
      )
    )
  );

NOTIFY pgrst, 'reload schema';