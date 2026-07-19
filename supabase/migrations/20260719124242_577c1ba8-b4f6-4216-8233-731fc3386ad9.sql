ALTER TABLE public.library_processing_jobs
  DROP CONSTRAINT IF EXISTS library_processing_jobs_kind_check,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_kind_check_v2,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_kind_check_v3,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_kind_check_v4;

ALTER TABLE public.library_processing_jobs
  ADD CONSTRAINT library_processing_jobs_kind_check_v4
  CHECK (kind IN ('extract_book','extract_page','build_index','embed_book','generate_explanations','generate_quiz'));

ALTER TABLE public.library_processing_jobs
  DROP CONSTRAINT IF EXISTS library_processing_jobs_stage_check,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_stage_check_v2,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_stage_check_v3;

ALTER TABLE public.library_processing_jobs
  ADD CONSTRAINT library_processing_jobs_stage_check_v3
  CHECK (stage IN ('upload','split','ocr','sections','embed','explain','tts','finalize','extract_page'));

CREATE INDEX IF NOT EXISTS library_jobs_book_kind_state_idx
  ON public.library_processing_jobs(book_id, kind, state, created_at);

NOTIFY pgrst, 'reload schema';