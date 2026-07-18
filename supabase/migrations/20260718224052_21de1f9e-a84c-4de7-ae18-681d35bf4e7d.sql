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
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS library_processing_events_book_created_idx
  ON public.library_processing_events (book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS library_processing_events_job_created_idx
  ON public.library_processing_events (job_id, created_at DESC);

INSERT INTO public.platform_settings (key, value)
VALUES ('library_worker_shared_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

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

REVOKE ALL ON FUNCTION public.log_library_processing_event(uuid, uuid, text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_library_processing_event(uuid, uuid, text, text, text, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.log_library_processing_event(uuid, uuid, text, text, text, integer, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_library_processing_event(uuid, uuid, text, text, text, integer, jsonb) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_state_check') THEN
    ALTER TABLE public.library_processing_jobs DROP CONSTRAINT library_processing_jobs_state_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_state_check2') THEN
    ALTER TABLE public.library_processing_jobs DROP CONSTRAINT library_processing_jobs_state_check2;
  END IF;
  ALTER TABLE public.library_processing_jobs
    ADD CONSTRAINT library_processing_jobs_state_check2
    CHECK (state IN ('queued','running','completed','failed','cancelled'));

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_kind_check') THEN
    ALTER TABLE public.library_processing_jobs DROP CONSTRAINT library_processing_jobs_kind_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_processing_jobs_kind_check_v2') THEN
    ALTER TABLE public.library_processing_jobs DROP CONSTRAINT library_processing_jobs_kind_check_v2;
  END IF;
  ALTER TABLE public.library_processing_jobs
    ADD CONSTRAINT library_processing_jobs_kind_check_v2
    CHECK (kind IN ('extract_book','extract_page','build_index','embed_book'));
END $$;

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
  LOOP
    UPDATE public.library_processing_jobs
       SET state = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = stuck.id;

    PERFORM public.log_library_processing_event(
      stuck.book_id,
      stuck.id,
      'job_requeued_after_timeout',
      'تمت إعادة مهمة عالقة إلى الطابور بعد انتهاء مهلة التشغيل',
      'warning',
      NULL,
      jsonb_build_object('worker', _worker, 'previous_locked_by', stuck.locked_by, 'previous_locked_at', stuck.locked_at, 'kind', stuck.kind, 'attempts', stuck.attempts)
    );
  END LOOP;

  SELECT id INTO jid
    FROM public.library_processing_jobs
   WHERE state = 'queued'
     AND attempts < max_attempts
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF jid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.library_processing_jobs
     SET state = 'running',
         locked_by = _worker,
         locked_at = now(),
         attempts = attempts + 1,
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = jid
   RETURNING * INTO claimed;

  PERFORM public.log_library_processing_event(
    claimed.book_id,
    claimed.id,
    'job_claimed',
    'بدأ عامل الخلفية تنفيذ مهمة من طابور المكتبة',
    'info',
    claimed.progress,
    jsonb_build_object('worker', _worker, 'kind', claimed.kind, 'attempts', claimed.attempts, 'state', claimed.state)
  );

  RETURN NEXT claimed;
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'library_book_not_found:%', _book_id;
  END IF;

  DELETE FROM public.library_processing_jobs
   WHERE book_id = _book_id
     AND state IN ('failed','cancelled');

  INSERT INTO public.library_processing_jobs (book_id, stage, kind, state, progress, attempts)
  VALUES (_book_id, 'upload', 'extract_book', 'queued', 0, 0)
  ON CONFLICT DO NOTHING
  RETURNING id INTO jid;

  IF jid IS NULL THEN
    SELECT id INTO jid
      FROM public.library_processing_jobs
     WHERE book_id = _book_id
       AND kind = 'extract_book'
       AND state IN ('queued','running')
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  PERFORM public.log_library_processing_event(
    _book_id,
    jid,
    'book_enqueued',
    'تم إنشاء مهمة معالجة الكتاب في الطابور',
    'info',
    0,
    jsonb_build_object('kind', 'extract_book', 'state', 'queued')
  );

  RETURN jid;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_library_book_processing(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.library_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_key FROM public.platform_settings WHERE key = 'library_worker_shared_key';
  v_url := current_setting('app.library_worker_url', true);
  IF COALESCE(v_url, '') = '' THEN
    v_url := 'https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/library-worker';
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-key', COALESCE(v_key, '')
    ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM anon;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.library_worker_heartbeat() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
      FROM cron.job
     WHERE jobname IN ('library-worker-tick','library-worker-every-minute','library_worker_tick','mp_library_worker_heartbeat');

    PERFORM cron.schedule(
      'mp_library_worker_heartbeat',
      '* * * * *',
      'SELECT public.library_worker_heartbeat();'
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';