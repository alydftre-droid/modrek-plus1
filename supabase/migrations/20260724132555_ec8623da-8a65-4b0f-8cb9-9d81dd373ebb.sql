
DROP POLICY IF EXISTS "students read index of accessible books" ON public.library_book_index;
CREATE POLICY "students read index of accessible books"
ON public.library_book_index
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.library_books b
    WHERE b.id = library_book_index.book_id
      AND b.status = 'ready'
      AND public.has_library_access(auth.uid(), b.access_tier)
  )
);

DROP POLICY IF EXISTS "modrek_lib_read" ON storage.objects;
DROP POLICY IF EXISTS "modrek_lib_insert" ON storage.objects;
DROP POLICY IF EXISTS "modrek_lib_update" ON storage.objects;
DROP POLICY IF EXISTS "modrek_lib_delete" ON storage.objects;
