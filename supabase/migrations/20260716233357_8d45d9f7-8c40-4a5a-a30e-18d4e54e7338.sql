
-- Fix critical entitlement leak on library book content.
-- Previous policies only checked "book row exists", letting any signed-in
-- user read paid book pages, sections, and AI explanations. This mirrors
-- the entitlement check used by library_book_chunks (free / owner / admin)
-- and additionally honors paid access tiers via has_library_access.

DROP POLICY IF EXISTS "Readable when parent book visible" ON public.library_book_pages;
CREATE POLICY "pages readable by entitled users"
  ON public.library_book_pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.library_books b
      WHERE b.id = library_book_pages.book_id
        AND (
          b.access_tier = 'free'
          OR b.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_library_access(auth.uid(), b.access_tier)
        )
    )
  );

DROP POLICY IF EXISTS "Readable when parent book visible" ON public.library_book_sections;
CREATE POLICY "sections readable by entitled users"
  ON public.library_book_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.library_books b
      WHERE b.id = library_book_sections.book_id
        AND (
          b.access_tier = 'free'
          OR b.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_library_access(auth.uid(), b.access_tier)
        )
    )
  );

DROP POLICY IF EXISTS "Readable when parent book visible" ON public.library_section_explanations;
CREATE POLICY "explanations readable by entitled users"
  ON public.library_section_explanations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.library_books b
      WHERE b.id = library_section_explanations.book_id
        AND (
          b.access_tier = 'free'
          OR b.created_by = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_library_access(auth.uid(), b.access_tier)
        )
    )
  );
