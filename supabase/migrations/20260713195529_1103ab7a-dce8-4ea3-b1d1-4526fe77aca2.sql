
DROP POLICY IF EXISTS "chunks readable by authenticated" ON public.library_book_chunks;
CREATE POLICY "chunks readable by entitled users"
ON public.library_book_chunks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.library_books b
    WHERE b.id = library_book_chunks.book_id
      AND (b.access_tier = 'free' OR b.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "quizzes readable authenticated" ON public.library_generated_quizzes;
CREATE POLICY "quizzes readable by entitled users"
ON public.library_generated_quizzes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.library_books b
    WHERE b.id = library_generated_quizzes.book_id
      AND (b.access_tier = 'free' OR b.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "cache read for authenticated" ON public.modrek_search_cache;
CREATE POLICY "cache read for admins only"
ON public.modrek_search_cache FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';
