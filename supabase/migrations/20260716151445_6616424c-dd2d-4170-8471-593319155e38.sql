ALTER TABLE public.library_books
  ADD COLUMN IF NOT EXISTS edition_year INTEGER;

NOTIFY pgrst, 'reload schema';