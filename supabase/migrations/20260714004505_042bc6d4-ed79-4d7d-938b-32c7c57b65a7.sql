DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_kind_check') THEN
    ALTER TABLE public.library_processing_jobs DROP CONSTRAINT library_processing_jobs_kind_check;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_kind_check_v2') THEN
    ALTER TABLE public.library_processing_jobs
      ADD CONSTRAINT library_processing_jobs_kind_check_v2
      CHECK (kind IN ('extract_book','extract_page','build_index','embed_book'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS library_jobs_kind_state_idx
  ON public.library_processing_jobs (kind, state, created_at);

NOTIFY pgrst, 'reload schema';