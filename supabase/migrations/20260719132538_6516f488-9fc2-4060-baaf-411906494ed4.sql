
-- =========================================================================
-- Library Pipeline v2: Independent stage jobs with reliable dispatcher
-- =========================================================================

-- 1) Extend library_processing_jobs
ALTER TABLE public.library_processing_jobs
  ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES public.library_processing_jobs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_stack text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

-- 2) Drop old constraints and add v2 versions
ALTER TABLE public.library_processing_jobs
  DROP CONSTRAINT IF EXISTS library_processing_jobs_kind_check_v4,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_stage_check_v3,
  DROP CONSTRAINT IF EXISTS library_processing_jobs_state_check2;

ALTER TABLE public.library_processing_jobs
  ADD CONSTRAINT library_processing_jobs_kind_check_v5 CHECK (kind = ANY (ARRAY[
    'extract_book','extract_page','build_index','embed_book',
    'generate_explanations','generate_quiz',
    -- v2 stages (one kind = one job type = one worker invocation)
    'v2_extract_pages','v2_extract_text','v2_chunk_embed','v2_build_index',
    'v2_generate_explanations','v2_generate_tts','v2_generate_quiz','v2_finalize'
  ])),
  ADD CONSTRAINT library_processing_jobs_stage_check_v4 CHECK (stage = ANY (ARRAY[
    'upload','split','ocr','sections','embed','explain','tts','finalize','extract_page',
    -- v2
    'extract_pages','extract_text','chunk_embed','build_index',
    'generate_explanations','generate_tts','generate_quiz'
  ])),
  ADD CONSTRAINT library_processing_jobs_state_check3 CHECK (state = ANY (ARRAY[
    'queued','running','completed','failed','cancelled','retry','dead_letter'
  ]));

-- 3) Indexes for the dispatcher and monitoring
CREATE INDEX IF NOT EXISTS library_jobs_dispatch_idx
  ON public.library_processing_jobs (state, next_run_at, priority, created_at)
  WHERE state IN ('queued','retry');

CREATE INDEX IF NOT EXISTS library_jobs_parent_idx
  ON public.library_processing_jobs (parent_job_id);

CREATE INDEX IF NOT EXISTS library_jobs_book_kind_state_v2_idx
  ON public.library_processing_jobs (book_id, kind, state);

-- 4) Claim next job atomically (SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.library_claim_next_job(
  p_worker_id text,
  p_kinds text[] DEFAULT NULL,
  p_limit integer DEFAULT 1
)
RETURNS SETOF public.library_processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT id FROM public.library_processing_jobs
    WHERE state IN ('queued','retry')
      AND next_run_at <= now()
      AND (p_kinds IS NULL OR kind = ANY(p_kinds))
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.library_processing_jobs
       SET state = 'running',
           worker_id = p_worker_id,
           locked_by = p_worker_id,
           locked_at = now(),
           started_at = COALESCE(started_at, now()),
           attempts = attempts + 1,
           updated_at = now()
     WHERE id = v_id;
    RETURN QUERY SELECT * FROM public.library_processing_jobs WHERE id = v_id;
  END LOOP;
END;
$$;

-- 5) Complete a job (records duration and progress)
CREATE OR REPLACE FUNCTION public.library_complete_job(
  p_job_id uuid,
  p_progress integer DEFAULT 100
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.library_processing_jobs
     SET state = 'completed',
         progress = COALESCE(p_progress, 100),
         finished_at = now(),
         duration_ms = COALESCE(EXTRACT(EPOCH FROM (now() - started_at))*1000, 0)::integer,
         last_error = NULL,
         last_stack = NULL,
         updated_at = now()
   WHERE id = p_job_id;
END;
$$;

-- 6) Fail a job with backoff. Moves to 'retry' with next_run_at,
--    or to 'dead_letter' once attempts >= max_attempts.
CREATE OR REPLACE FUNCTION public.library_fail_job(
  p_job_id uuid,
  p_error text,
  p_stack text DEFAULT NULL,
  p_backoff_seconds integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.library_processing_jobs;
  v_next_state text;
  v_backoff integer;
BEGIN
  SELECT * INTO v_job FROM public.library_processing_jobs WHERE id = p_job_id;
  IF v_job.id IS NULL THEN RETURN 'not_found'; END IF;

  IF v_job.attempts >= COALESCE(v_job.max_attempts, 3) THEN
    v_next_state := 'dead_letter';
  ELSE
    v_next_state := 'retry';
  END IF;

  v_backoff := COALESCE(p_backoff_seconds, LEAST(300, 15 * (v_job.attempts * v_job.attempts + 1)));

  UPDATE public.library_processing_jobs
     SET state = v_next_state,
         last_error = LEFT(COALESCE(p_error,''), 4000),
         last_stack = LEFT(COALESCE(p_stack,''), 8000),
         finished_at = CASE WHEN v_next_state = 'dead_letter' THEN now() ELSE finished_at END,
         next_run_at = now() + make_interval(secs => v_backoff),
         duration_ms = COALESCE(EXTRACT(EPOCH FROM (now() - started_at))*1000, 0)::integer,
         locked_by = NULL,
         locked_at = NULL,
         updated_at = now()
   WHERE id = p_job_id;
  RETURN v_next_state;
END;
$$;

-- 7) Progress view based on JOB COUNTS (not %)
CREATE OR REPLACE FUNCTION public.library_book_progress_v2(p_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH j AS (
    SELECT kind, state, count(*) AS n
    FROM public.library_processing_jobs
    WHERE book_id = p_book_id AND kind LIKE 'v2_%'
    GROUP BY kind, state
  ),
  totals AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE state = 'completed')::int AS done,
      count(*) FILTER (WHERE state IN ('queued','retry'))::int AS pending,
      count(*) FILTER (WHERE state = 'running')::int AS running,
      count(*) FILTER (WHERE state IN ('failed','dead_letter'))::int AS failed
    FROM public.library_processing_jobs
    WHERE book_id = p_book_id AND kind LIKE 'v2_%'
  )
  SELECT jsonb_build_object(
    'book_id', p_book_id,
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'by_kind', COALESCE((SELECT jsonb_object_agg(kind, per_kind) FROM (
      SELECT kind, jsonb_object_agg(state, n) AS per_kind FROM j GROUP BY kind
    ) s), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_claim_next_job(text, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_complete_job(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_fail_job(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_book_progress_v2(uuid) TO service_role, authenticated;
