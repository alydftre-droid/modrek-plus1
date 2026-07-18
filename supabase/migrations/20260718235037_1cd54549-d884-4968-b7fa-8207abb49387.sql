DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.library_processing_events;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.library_processing_jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.library_books;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;