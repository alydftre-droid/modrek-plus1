
ALTER TABLE public.library_books
  ADD COLUMN IF NOT EXISTS term TEXT,
  ADD COLUMN IF NOT EXISTS edition_year INTEGER,
  ADD COLUMN IF NOT EXISTS sub_subject_name TEXT;

ALTER TABLE public.library_books
  DROP CONSTRAINT IF EXISTS library_books_term_check;

ALTER TABLE public.library_books
  ADD CONSTRAINT library_books_term_check
  CHECK (term IS NULL OR term IN ('annual','term1','term2'));
