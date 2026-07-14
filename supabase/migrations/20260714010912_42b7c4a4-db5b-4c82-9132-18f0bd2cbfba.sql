ALTER POLICY "Admins manage access tiers" ON public.library_access_tiers TO authenticated;
ALTER POLICY "Admins manage all library books" ON public.library_books TO authenticated;
ALTER POLICY "Admins manage pages" ON public.library_book_pages TO authenticated;
ALTER POLICY "Admins manage sections" ON public.library_book_sections TO authenticated;
ALTER POLICY "Admins manage explanations" ON public.library_section_explanations TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'library_processing_jobs'
      AND policyname = 'Admins manage library jobs'
  ) THEN
    ALTER POLICY "Admins manage library jobs" ON public.library_processing_jobs TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';