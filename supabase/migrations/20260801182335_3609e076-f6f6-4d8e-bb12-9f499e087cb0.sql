CREATE OR REPLACE FUNCTION public.library_track_code_from_section(p_section text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_section,'')) = '' THEN 'none'
    WHEN btrim(p_section) IN ('علمي علوم','علمى علوم','science_track','sci_science') THEN 'sci_science'
    WHEN btrim(p_section) IN ('علمي رياضة','علمى رياضة','math_track','sci_math') THEN 'sci_math'
    WHEN btrim(p_section) IN ('علمي','علمى','علم','scientific','science','sci') THEN 'scientific'
    WHEN btrim(p_section) IN ('أدبي','ادبي','أدبى','ادبى','literary') THEN 'literary'
    ELSE btrim(p_section)
  END
$$;

CREATE OR REPLACE FUNCTION public.library_track_matches_student(p_book_track text, p_section text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN coalesce(p_book_track,'') IN ('', 'none') THEN true
    ELSE (
      WITH s AS (SELECT public.library_track_code_from_section(p_section) AS code)
      SELECT CASE
        WHEN (SELECT code FROM s) IN ('', 'none') THEN true
        WHEN (SELECT code FROM s) = p_book_track THEN true
        WHEN p_book_track IN ('scientific','sci_science','sci_math')
             AND (SELECT code FROM s) IN ('scientific','sci_science','sci_math') THEN true
        ELSE false
      END
    )
  END
$$;

GRANT EXECUTE ON FUNCTION public.library_track_code_from_section(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.library_track_matches_student(text, text) TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "Students view scoped ready free library books" ON public.library_books;
CREATE POLICY "Students view scoped ready free library books"
ON public.library_books FOR SELECT TO authenticated
USING (
  status = 'ready' AND access_tier = 'free' AND (
    has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
      SELECT 1
      FROM profiles p
      LEFT JOIN library_stages st ON st.id = library_books.stage_id
      LEFT JOIN library_grades gr ON gr.id = library_books.grade_id
      LEFT JOIN library_sections sec ON sec.id = library_books.section_id
      LEFT JOIN library_tracks tr ON tr.id = library_books.track_id
      WHERE p.id = auth.uid()
        AND coalesce(p.role,'student') = 'student'
        AND (library_books.education_type = 'both' OR p.education_type IS NULL OR library_books.education_type = p.education_type)
        AND (library_books.stage_id IS NULL OR st.code = p.stage)
        AND (library_books.grade_id IS NULL OR gr.code = CASE
              WHEN p.stage='preparatory' AND p.grade='first' THEN 'pr1'
              WHEN p.stage='preparatory' AND p.grade='second' THEN 'pr2'
              WHEN p.stage='preparatory' AND p.grade='third' THEN 'pr3'
              WHEN p.stage='secondary' AND p.grade='first' THEN 'sec1'
              WHEN p.stage='secondary' AND p.grade='second' THEN 'sec2'
              WHEN p.stage='secondary' AND p.grade='third' THEN 'sec3'
              WHEN p.stage='primary' AND p.grade='first' THEN 'p1'
              WHEN p.stage='primary' AND p.grade='second' THEN 'p2'
              WHEN p.stage='primary' AND p.grade='third' THEN 'p3'
              WHEN p.stage='primary' AND p.grade='fourth' THEN 'p4'
              WHEN p.stage='primary' AND p.grade='fifth' THEN 'p5'
              WHEN p.stage='primary' AND p.grade='sixth' THEN 'p6'
              ELSE p.grade END)
        AND (library_books.section_id IS NULL OR sec.code = 'shared' OR sec.code = CASE
              WHEN p.education_type='عام' THEN 'general'
              WHEN p.education_type='أزهر' THEN 'azhar'
              ELSE sec.code END)
        AND public.library_track_matches_student(tr.code, p.section)
    )
  )
);