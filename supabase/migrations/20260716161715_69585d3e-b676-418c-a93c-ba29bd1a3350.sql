
-- Repoint library_books.subject_id FK from library_subjects to public.subjects,
-- since the upload wizard now sources subjects directly from the main catalog.
ALTER TABLE public.library_books
  DROP CONSTRAINT IF EXISTS library_books_subject_id_fkey;

-- Null out any existing subject_id that doesn't exist in public.subjects to
-- avoid FK violation when re-adding the constraint.
UPDATE public.library_books lb
SET subject_id = NULL
WHERE subject_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = lb.subject_id);

ALTER TABLE public.library_books
  ADD CONSTRAINT library_books_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
