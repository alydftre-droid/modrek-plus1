INSERT INTO public.library_tracks (code, name_ar, sort_order, is_active)
VALUES
  ('scientific', 'علمي', 1, true),
  ('sci_science', 'علمي علوم', 2, true),
  ('sci_math', 'علمي رياضة', 3, true),
  ('literary', 'أدبي', 4, true)
ON CONFLICT (code) DO UPDATE
SET name_ar = EXCLUDED.name_ar,
    sort_order = EXCLUDED.sort_order,
    is_active = true,
    updated_at = now();

UPDATE public.library_tracks
SET sort_order = 0,
    is_active = true,
    updated_at = now()
WHERE code = 'none';

ALTER TABLE public.library_books
  DROP CONSTRAINT IF EXISTS library_books_subject_id_fkey;

ALTER TABLE public.library_books
  ADD CONSTRAINT library_books_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_tracks TO authenticated;
GRANT ALL ON public.library_tracks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;