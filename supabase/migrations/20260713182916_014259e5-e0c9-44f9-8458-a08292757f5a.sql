
ALTER TABLE public.library_processing_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'extract_book',
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_state_check') THEN
    ALTER TABLE public.library_processing_jobs DROP CONSTRAINT library_processing_jobs_state_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_state_check2') THEN
    ALTER TABLE public.library_processing_jobs
      ADD CONSTRAINT library_processing_jobs_state_check2
      CHECK (state IN ('queued','running','completed','failed','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_kind_check') THEN
    ALTER TABLE public.library_processing_jobs
      ADD CONSTRAINT library_processing_jobs_kind_check
      CHECK (kind IN ('extract_book','extract_page'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS library_jobs_state_idx
  ON public.library_processing_jobs (state, created_at);
CREATE INDEX IF NOT EXISTS library_jobs_book_page_idx
  ON public.library_processing_jobs (book_id, page_number);

CREATE UNIQUE INDEX IF NOT EXISTS library_jobs_unique_page_idx
  ON public.library_processing_jobs (book_id, page_number)
  WHERE kind = 'extract_page';

CREATE UNIQUE INDEX IF NOT EXISTS library_jobs_unique_book_prepare_idx
  ON public.library_processing_jobs (book_id)
  WHERE kind = 'extract_book' AND state IN ('queued','running');

CREATE OR REPLACE FUNCTION public.claim_library_job(_worker text)
RETURNS SETOF public.library_processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jid uuid;
BEGIN
  UPDATE public.library_processing_jobs
     SET state = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
   WHERE state = 'running'
     AND locked_at IS NOT NULL
     AND locked_at < now() - interval '10 minutes';

  SELECT id INTO jid
    FROM public.library_processing_jobs
   WHERE state = 'queued'
     AND attempts < max_attempts
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF jid IS NULL THEN RETURN; END IF;

  UPDATE public.library_processing_jobs
     SET state = 'running',
         locked_by = _worker,
         locked_at = now(),
         attempts = attempts + 1,
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = jid;

  RETURN QUERY SELECT * FROM public.library_processing_jobs WHERE id = jid;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_library_job(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_library_job(text) FROM anon;
REVOKE ALL ON FUNCTION public.claim_library_job(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_library_job(text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_library_book_processing(_book_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jid uuid;
BEGIN
  UPDATE public.library_books
     SET status = 'processing',
         processing_progress = 0,
         processing_stage = 'queued',
         processing_error = NULL,
         updated_at = now()
   WHERE id = _book_id;

  -- Cancel any old failed/queued jobs so a fresh run starts clean
  DELETE FROM public.library_processing_jobs
   WHERE book_id = _book_id
     AND state IN ('failed','cancelled');

  INSERT INTO public.library_processing_jobs (book_id, stage, kind, state, progress, attempts)
  VALUES (_book_id, 'prepare', 'extract_book', 'queued', 0, 0)
  ON CONFLICT DO NOTHING
  RETURNING id INTO jid;

  IF jid IS NULL THEN
    SELECT id INTO jid FROM public.library_processing_jobs
     WHERE book_id = _book_id AND kind = 'extract_book' AND state IN ('queued','running')
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  RETURN jid;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_library_book_processing(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.library_jobs_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_library_jobs_updated_at ON public.library_processing_jobs;
CREATE TRIGGER trg_library_jobs_updated_at
  BEFORE UPDATE ON public.library_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.library_jobs_touch_updated_at();

-- Allow admins to read jobs (for the developer dashboard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='library_processing_jobs'
      AND policyname='library_jobs_admin_read'
  ) THEN
    CREATE POLICY library_jobs_admin_read ON public.library_processing_jobs
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

GRANT SELECT ON public.library_processing_jobs TO authenticated;
