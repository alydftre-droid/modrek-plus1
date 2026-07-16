ALTER TABLE public.library_books
  ADD COLUMN IF NOT EXISTS grade_id UUID REFERENCES public.library_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.library_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS term TEXT,
  ADD COLUMN IF NOT EXISTS edition_year INTEGER,
  ADD COLUMN IF NOT EXISTS sub_subject_name TEXT;

ALTER TABLE public.library_books
  DROP CONSTRAINT IF EXISTS library_books_term_check;
ALTER TABLE public.library_books
  ADD CONSTRAINT library_books_term_check
  CHECK (term IS NULL OR term IN ('annual', 'term1', 'term2'));

GRANT SELECT ON public.library_stages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_stages TO authenticated;
GRANT ALL ON public.library_stages TO service_role;

GRANT SELECT ON public.library_grades TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_grades TO authenticated;
GRANT ALL ON public.library_grades TO service_role;

GRANT SELECT ON public.library_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_sections TO authenticated;
GRANT ALL ON public.library_sections TO service_role;

GRANT SELECT ON public.library_tracks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_tracks TO authenticated;
GRANT ALL ON public.library_tracks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;

GRANT SELECT ON public.library_subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_subjects TO authenticated;
GRANT ALL ON public.library_subjects TO service_role;

CREATE INDEX IF NOT EXISTS idx_library_books_grade_id ON public.library_books(grade_id);
CREATE INDEX IF NOT EXISTS idx_library_books_section_id ON public.library_books(section_id);
CREATE INDEX IF NOT EXISTS idx_library_books_term ON public.library_books(term);

NOTIFY pgrst, 'reload schema';