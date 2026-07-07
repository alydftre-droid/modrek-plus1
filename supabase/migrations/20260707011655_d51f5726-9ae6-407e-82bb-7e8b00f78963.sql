ALTER TYPE public.processing_job_kind ADD VALUE IF NOT EXISTS 'extract_page';
ALTER TYPE public.processing_job_kind ADD VALUE IF NOT EXISTS 'merge_text';

CREATE OR REPLACE FUNCTION public.modrek_claim_next_job()
RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.processing_jobs j
  SET status = 'retrying',
      error = COALESCE(j.error, 'job heartbeat timeout; requeued automatically'),
      finished_at = now(),
      next_run_at = now(),
      updated_at = now()
  WHERE j.status = 'running'
    AND COALESCE(j.updated_at, j.started_at, j.created_at) < now() - interval '4 minutes';

  UPDATE public.processing_jobs j
  SET status = 'failed',
      error = COALESCE(j.error, 'انتهت محاولات المعالجة لهذه المرحلة تلقائياً'),
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
          AND j.kind NOT IN ('extract_page'::public.processing_job_kind, 'merge_text'::public.processing_job_kind)
        ORDER BY j.updated_at DESC NULLS LAST, j.created_at DESC
        LIMIT 1
      ), v.error_message, 'توقفت المعالجة بسبب فشل مرحلة أساسية'),
      updated_at = now()
  WHERE v.pipeline_stage <> 'failed'
    AND EXISTS (
      SELECT 1 FROM public.processing_jobs j
      WHERE j.version_id = v.id
        AND j.status = 'failed'
        AND j.kind NOT IN ('extract_page'::public.processing_job_kind, 'merge_text'::public.processing_job_kind)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.processing_jobs j
      WHERE j.version_id = v.id
        AND j.status IN ('pending','running','retrying')
        AND j.attempts < COALESCE(j.max_attempts, 3)
        AND j.kind NOT IN ('extract_page'::public.processing_job_kind, 'merge_text'::public.processing_job_kind)
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
    SELECT id FROM public.processing_jobs
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
NOTIFY pgrst, 'reload schema';