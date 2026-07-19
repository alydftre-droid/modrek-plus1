-- Production reconciliation for the imported database baseline.
-- The live production database already contains many historical objects while
-- their migration versions are missing, so GitHub `db push` must baseline the
-- historical files and run this single canonical, idempotent schema sync.

-- ---------------------------------------------------------------------------
-- Library processing events (monitoring)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_processing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.library_processing_jobs(id) ON DELETE SET NULL,
  event_key text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  progress integer,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.library_processing_events TO authenticated;
GRANT ALL ON public.library_processing_events TO service_role;

ALTER TABLE public.library_processing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view library processing events" ON public.library_processing_events;
CREATE POLICY "Admins can view library processing events"
  ON public.library_processing_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS library_processing_events_book_created_idx
  ON public.library_processing_events (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS library_processing_events_job_created_idx
  ON public.library_processing_events (job_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_library_processing_event(
  _book_id uuid,
  _job_id uuid,
  _event_key text,
  _message text,
  _level text DEFAULT 'info',
  _progress integer DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  eid uuid;
BEGIN
  INSERT INTO public.library_processing_events (book_id, job_id, event_key, level, message, progress, data)
  VALUES (
    _book_id,
    _job_id,
    COALESCE(NULLIF(_event_key, ''), 'event'),
    CASE WHEN _level IN ('debug','info','warning','error','success') THEN _level ELSE 'info' END,
    COALESCE(NULLIF(_message, ''), _event_key, 'library processing event'),
    CASE WHEN _progress IS NULL THEN NULL ELSE LEAST(100, GREATEST(0, _progress)) END,
    COALESCE(_data, '{}'::jsonb)
  )
  RETURNING id INTO eid;
  RETURN eid;
END;
$$;

REVOKE ALL ON FUNCTION public.log_library_processing_event(uuid, uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_library_processing_event(uuid, uuid, text, text, text, integer, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Library processing jobs: V2-compatible schema, constraints, indexes, RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE public.library_processing_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'extract_book',
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS parent_job_id uuid,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_stack text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.library_processing_jobs'::regclass
      AND conname = 'library_processing_jobs_parent_job_id_fkey'
  ) THEN
    ALTER TABLE public.library_processing_jobs
      ADD CONSTRAINT library_processing_jobs_parent_job_id_fkey
      FOREIGN KEY (parent_job_id) REFERENCES public.library_processing_jobs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.library_processing_jobs'::regclass
      AND contype = 'c'
      AND conname LIKE 'library_processing_jobs_%_check%'
  LOOP
    EXECUTE format('ALTER TABLE public.library_processing_jobs DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.library_processing_jobs
  ADD CONSTRAINT library_processing_jobs_kind_check_v5 CHECK (kind = ANY (ARRAY[
    'extract_book','extract_page','build_index','embed_book',
    'generate_explanations','generate_quiz',
    'v2_extract_pages','v2_extract_text','v2_chunk_embed','v2_build_index',
    'v2_generate_explanations','v2_generate_tts','v2_generate_quiz','v2_finalize'
  ])),
  ADD CONSTRAINT library_processing_jobs_stage_check_v4 CHECK (stage = ANY (ARRAY[
    'upload','split','ocr','sections','embed','explain','tts','finalize','extract_page',
    'extract_pages','extract_text','chunk_embed','build_index',
    'generate_explanations','generate_tts','generate_quiz'
  ])),
  ADD CONSTRAINT library_processing_jobs_state_check3 CHECK (state = ANY (ARRAY[
    'queued','running','completed','failed','cancelled','retry','dead_letter'
  ]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_processing_jobs TO authenticated;
GRANT ALL ON public.library_processing_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;

CREATE INDEX IF NOT EXISTS library_jobs_dispatch_idx
  ON public.library_processing_jobs (state, next_run_at, priority, created_at)
  WHERE state IN ('queued','retry');
CREATE INDEX IF NOT EXISTS library_jobs_parent_idx
  ON public.library_processing_jobs (parent_job_id);
CREATE INDEX IF NOT EXISTS library_jobs_book_kind_state_v2_idx
  ON public.library_processing_jobs (book_id, kind, state);
CREATE INDEX IF NOT EXISTS library_jobs_book_kind_state_idx
  ON public.library_processing_jobs(book_id, kind, state, created_at);
CREATE INDEX IF NOT EXISTS library_jobs_kind_state_idx
  ON public.library_processing_jobs (kind, state, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS library_jobs_unique_page_idx
  ON public.library_processing_jobs (book_id, page_number)
  WHERE kind = 'extract_page';
CREATE UNIQUE INDEX IF NOT EXISTS library_jobs_unique_book_prepare_idx
  ON public.library_processing_jobs (book_id)
  WHERE kind = 'extract_book' AND state IN ('queued','running');

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
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1), 25))
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
         locked_by = NULL,
         locked_at = NULL,
         updated_at = now()
   WHERE id = p_job_id;
END;
$$;

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
    WHERE book_id = p_book_id
    GROUP BY kind, state
  ), totals AS (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE state = 'completed')::int AS done,
           count(*) FILTER (WHERE state IN ('queued','retry'))::int AS pending,
           count(*) FILTER (WHERE state = 'running')::int AS running,
           count(*) FILTER (WHERE state IN ('failed','dead_letter'))::int AS failed
    FROM public.library_processing_jobs
    WHERE book_id = p_book_id
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

CREATE OR REPLACE FUNCTION public.claim_library_job(_worker text)
RETURNS SETOF public.library_processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jid uuid;
  stuck record;
  claimed public.library_processing_jobs%ROWTYPE;
BEGIN
  FOR stuck IN
    SELECT id, book_id, kind, attempts, locked_by, locked_at
      FROM public.library_processing_jobs
     WHERE state = 'running'
       AND locked_at IS NOT NULL
       AND locked_at < now() - interval '10 minutes'
       AND kind NOT LIKE 'v2\_%' ESCAPE '\'
  LOOP
    UPDATE public.library_processing_jobs
       SET state = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = stuck.id;

    PERFORM public.log_library_processing_event(
      stuck.book_id, stuck.id, 'job_requeued_after_timeout',
      'تمت إعادة مهمة عالقة إلى الطابور بعد انتهاء مهلة التشغيل', 'warning', NULL,
      jsonb_build_object('worker', _worker, 'previous_locked_by', stuck.locked_by, 'previous_locked_at', stuck.locked_at, 'kind', stuck.kind, 'attempts', stuck.attempts)
    );
  END LOOP;

  SELECT id INTO jid
    FROM public.library_processing_jobs
   WHERE state IN ('queued','retry')
     AND attempts < max_attempts
     AND kind NOT LIKE 'v2\_%' ESCAPE '\'
   ORDER BY priority ASC, created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF jid IS NULL THEN RETURN; END IF;

  UPDATE public.library_processing_jobs
     SET state = 'running', locked_by = _worker, locked_at = now(),
         attempts = attempts + 1, started_at = COALESCE(started_at, now()), updated_at = now()
   WHERE id = jid
   RETURNING * INTO claimed;

  PERFORM public.log_library_processing_event(
    claimed.book_id, claimed.id, 'job_claimed',
    'بدأ عامل الخلفية تنفيذ مهمة من طابور المكتبة', 'info', claimed.progress,
    jsonb_build_object('worker', _worker, 'kind', claimed.kind, 'attempts', claimed.attempts, 'state', claimed.state)
  );

  RETURN NEXT claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.library_claim_next_job(text, text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.library_complete_job(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.library_fail_job(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_library_job(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.library_claim_next_job(text, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_complete_job(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_fail_job(uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.library_book_progress_v2(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_library_job(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Prevent profile privilege/financial tampering by non-admin users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_caller boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_admin_caller := public.has_role(auth.uid(), 'admin'::app_role);
  EXCEPTION WHEN OTHERS THEN
    is_admin_caller := false;
  END;

  IF is_admin_caller THEN
    RETURN NEW;
  END IF;

  NEW.role := OLD.role;
  NEW.is_banned := OLD.is_banned;
  NEW.is_test_account := OLD.is_test_account;
  NEW.teacher_code := OLD.teacher_code;
  NEW.commission_rate := OLD.commission_rate;
  NEW.pending_commission_rate := OLD.pending_commission_rate;
  NEW.pending_effective_date := OLD.pending_effective_date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_fields();

NOTIFY pgrst, 'reload schema';