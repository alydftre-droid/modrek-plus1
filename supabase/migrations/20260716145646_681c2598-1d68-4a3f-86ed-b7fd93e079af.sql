
DROP POLICY IF EXISTS "Readable when book is readable" ON public.library_book_pages;
CREATE POLICY "Readable when parent book visible" ON public.library_book_pages
FOR SELECT USING (EXISTS (SELECT 1 FROM public.library_books b WHERE b.id = library_book_pages.book_id));

DROP POLICY IF EXISTS "Readable when book is readable" ON public.library_book_sections;
CREATE POLICY "Readable when parent book visible" ON public.library_book_sections
FOR SELECT USING (EXISTS (SELECT 1 FROM public.library_books b WHERE b.id = library_book_sections.book_id));

DROP POLICY IF EXISTS "Readable when book is readable" ON public.library_section_explanations;
CREATE POLICY "Readable when parent book visible" ON public.library_section_explanations
FOR SELECT USING (EXISTS (SELECT 1 FROM public.library_books b WHERE b.id = library_section_explanations.book_id));
