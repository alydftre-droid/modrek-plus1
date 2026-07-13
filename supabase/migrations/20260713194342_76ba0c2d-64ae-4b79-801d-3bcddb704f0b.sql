ALTER TABLE public.library_books
  ADD COLUMN IF NOT EXISTS grade_id uuid REFERENCES public.library_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.library_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_books_grade ON public.library_books(grade_id);
CREATE INDEX IF NOT EXISTS idx_library_books_section ON public.library_books(section_id);
CREATE INDEX IF NOT EXISTS idx_library_books_full_scope ON public.library_books(stage_id, grade_id, section_id, track_id, subject_id);

DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'library_%'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
  END LOOP;
END;
$$;

GRANT SELECT ON public.library_stages TO anon;
GRANT SELECT ON public.library_tracks TO anon;
GRANT SELECT ON public.library_subjects TO anon;
GRANT SELECT ON public.library_grades TO anon;
GRANT SELECT ON public.library_sub_subjects TO anon;
GRANT SELECT ON public.library_sections TO anon;
GRANT SELECT ON public.library_access_tiers TO anon;

DROP POLICY IF EXISTS "Authenticated can view ready free books" ON public.library_books;
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