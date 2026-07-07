CREATE OR REPLACE FUNCTION public.modrek_bulk_set_embeddings(
  p_rows jsonb,
  p_model_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row jsonb;
  v_count integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    UPDATE public.content_chunks
    SET embedding = (v_row->>'embedding')::vector,
        embedding_model_id = p_model_id,
        updated_at = now()
    WHERE id = (v_row->>'id')::uuid;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_bulk_set_embeddings(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_bulk_set_embeddings(jsonb, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_enqueue_stage(
  p_version_id uuid,
  p_kind public.processing_job_kind,
  p_stage_order integer,
  p_input jsonb DEFAULT '{}'::jsonb,
  p_asset_id uuid DEFAULT NULL::uuid,
  p_max_attempts integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_source_id uuid;
  v_job_id uuid;
  v_max_attempts integer;
  v_page_from text;
  v_page_to text;
BEGIN
  SELECT source_id INTO v_source_id
  FROM public.knowledge_source_versions
  WHERE id = p_version_id;

  v_page_from := COALESCE(p_input->>'page_from', '');
  v_page_to := COALESCE(p_input->>'page_to', '');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_version_id::text || ':' || p_kind::text || ':' || v_page_from || ':' || v_page_to,
    20260707
  ));

  IF p_kind = 'extract_page'::public.processing_job_kind THEN
    SELECT id INTO v_job_id
    FROM public.processing_jobs
    WHERE version_id = p_version_id
      AND kind = p_kind
      AND status IN ('pending','running','retrying')
      AND COALESCE(input->>'page_from','') = v_page_from
      AND COALESCE(input->>'page_to','') = v_page_to
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT id INTO v_job_id
    FROM public.processing_jobs
    WHERE version_id = p_version_id
      AND kind = p_kind
      AND status IN ('pending','running','retrying')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_job_id IS NOT NULL THEN
    RETURN v_job_id;
  END IF;

  v_max_attempts := COALESCE(p_max_attempts, CASE
    WHEN p_kind = 'merge_text'::public.processing_job_kind THEN 80
    WHEN p_kind IN ('extract_page'::public.processing_job_kind, 'embed'::public.processing_job_kind) THEN 10
    ELSE 4
  END);

  INSERT INTO public.processing_jobs
    (source_id, version_id, asset_id, kind, status, input, stage_order, priority, max_attempts, next_run_at)
  VALUES
    (v_source_id, p_version_id, p_asset_id, p_kind, 'pending', COALESCE(p_input, '{}'::jsonb), p_stage_order, 100, v_max_attempts, now())
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_claim_next_job()
RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.processing_jobs j
  SET status = 'retrying',
      error = COALESCE(j.error, 'انقطع نبض العامل أو انتهت مهلة المرحلة؛ تمت إعادة الجدولة تلقائياً'),
      finished_at = now(),
      next_run_at = now(),
      updated_at = now()
  WHERE j.status = 'running'
    AND COALESCE(j.updated_at, j.started_at, j.created_at) < now() - interval '3 minutes';

  UPDATE public.processing_jobs j
  SET status = 'failed',
      error = COALESCE(j.error, 'انتهت كل محاولات هذه المرحلة تلقائياً'),
      finished_at = COALESCE(j.finished_at, now()),
      updated_at = now()
  WHERE j.status = 'retrying'
    AND j.attempts >= COALESCE(j.max_attempts, 3);

  UPDATE public.knowledge_source_versions v
  SET pipeline_stage = 'failed',
      error_message = COALESCE((
        SELECT 'توقفت المعالجة في مرحلة ' || j.kind::text || ': ' || COALESCE(j.error, 'خطأ غير معروف')
        FROM public.processing_jobs j
        WHERE j.version_id = v.id
          AND j.status = 'failed'
        ORDER BY CASE WHEN j.kind = 'extract_page'::public.processing_job_kind THEN 1 ELSE 0 END,
                 j.updated_at DESC NULLS LAST,
                 j.created_at DESC
        LIMIT 1
      ), v.error_message, 'توقفت المعالجة بسبب فشل مرحلة أساسية'),
      updated_at = now()
  WHERE v.pipeline_stage <> 'failed'
    AND EXISTS (
      SELECT 1 FROM public.processing_jobs j
      WHERE j.version_id = v.id
        AND j.status = 'failed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.processing_jobs j
      WHERE j.version_id = v.id
        AND j.status IN ('pending','running','retrying')
        AND j.attempts < COALESCE(j.max_attempts, 3)
    );

  UPDATE public.knowledge_sources s
  SET status = 'failed',
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.knowledge_source_versions v
    WHERE v.source_id = s.id
      AND v.is_current = true
      AND v.pipeline_stage = 'failed'
  );

  RETURN QUERY
  UPDATE public.processing_jobs j
  SET status = 'running',
      started_at = now(),
      finished_at = NULL,
      attempts = j.attempts + 1,
      error = NULL,
      updated_at = now()
  WHERE j.id = (
    SELECT id
    FROM public.processing_jobs
    WHERE status IN ('pending','retrying')
      AND next_run_at <= now()
      AND attempts < COALESCE(max_attempts, 3)
    ORDER BY priority DESC, stage_order ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.modrek_claim_next_job() TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  PERFORM extensions.net.http_post(
    url := 'https://qohhrliaecdtaeyfhcvb.supabase.co/functions/v1/modrek-worker',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_worker_heartbeat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_worker_heartbeat() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('modrek-worker-heartbeat');
    PERFORM cron.schedule('modrek-worker-heartbeat', '* * * * *', 'SELECT public.modrek_worker_heartbeat();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'modrek worker heartbeat schedule skipped: %', SQLERRM;
END $$;

UPDATE public.processing_jobs
SET max_attempts = CASE
      WHEN kind = 'merge_text'::public.processing_job_kind THEN GREATEST(COALESCE(max_attempts, 0), 80)
      WHEN kind IN ('extract_page'::public.processing_job_kind, 'embed'::public.processing_job_kind) THEN GREATEST(COALESCE(max_attempts, 0), 10)
      ELSE GREATEST(COALESCE(max_attempts, 0), 4)
    END,
    updated_at = now()
WHERE status IN ('pending','running','retrying');

NOTIFY pgrst, 'reload schema';