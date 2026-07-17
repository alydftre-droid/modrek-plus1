ALTER TABLE public.library_books ADD COLUMN IF NOT EXISTS sub_subject_id UUID;
CREATE INDEX IF NOT EXISTS idx_library_books_sub_subject_id ON public.library_books(sub_subject_id);