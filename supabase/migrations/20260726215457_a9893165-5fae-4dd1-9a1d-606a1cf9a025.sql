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
      next_run_at = now() + interval '30 seconds',
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
    SELECT candidate.id
    FROM public.processing_jobs candidate
    WHERE candidate.status IN ('pending','retrying')
      AND candidate.next_run_at <= now()
      AND candidate.attempts < COALESCE(candidate.max_attempts, 3)
      AND (
        candidate.kind <> 'extract_page'::public.processing_job_kind
        OR NOT EXISTS (
          SELECT 1
          FROM public.processing_jobs running_page
          WHERE running_page.kind = 'extract_page'::public.processing_job_kind
            AND running_page.status = 'running'
            AND COALESCE(running_page.updated_at, running_page.started_at, running_page.created_at) > now() - interval '3 minutes'
        )
      )
      AND (
        candidate.kind <> 'extract_page'::public.processing_job_kind
        OR NOT EXISTS (
          SELECT 1
          FROM public.processing_events e
          JOIN public.processing_jobs ej ON ej.id = e.job_id
          WHERE ej.kind = 'extract_page'::public.processing_job_kind
            AND COALESCE(e.data->>'provider', '') = 'gemini_file_api'
            AND (e.data->>'category') IN ('quota_exhausted', 'rate_limit')
            AND e.created_at > now() - interval '13 hours'
            AND COALESCE(
              CASE
                WHEN COALESCE(e.data->>'global_cooldown_until', '') ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN (e.data->>'global_cooldown_until')::timestamptz
                ELSE NULL
              END,
              e.created_at + CASE
                WHEN (e.data->>'category') = 'quota_exhausted' THEN interval '6 hours'
                ELSE interval '10 minutes'
              END
            ) > now()
        )
      )
    ORDER BY candidate.priority DESC, candidate.stage_order ASC, candidate.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_claim_next_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_claim_next_job() TO service_role;

CREATE INDEX IF NOT EXISTS idx_processing_events_provider_category_created
  ON public.processing_events ((data->>'provider'), (data->>'category'), created_at DESC);

UPDATE public.processing_jobs
SET max_attempts = GREATEST(COALESCE(max_attempts, 0), 30),
    next_run_at = CASE
      WHEN status IN ('pending','retrying','running')
       AND lower(COALESCE(error, '')) LIKE ANY (ARRAY['%exceeded your current quota%', '%check your plan and billing%', '%quota exhausted%', '%quota ex%', '%resource exhausted%'])
        THEN now() + interval '6 hours'
      WHEN status IN ('pending','retrying','running')
       AND lower(COALESCE(error, '')) LIKE ANY (ARRAY['%rate-limit%', '%rate limit%', '%429%', '%too many requests%'])
        THEN now() + interval '10 minutes'
      ELSE next_run_at
    END,
    status = CASE WHEN status = 'running' THEN 'retrying' ELSE status END,
    finished_at = CASE WHEN status = 'running' THEN now() ELSE finished_at END,
    updated_at = now()
WHERE kind = 'extract_page'::public.processing_job_kind
  AND status IN ('pending','running','retrying');

INSERT INTO public.processing_events (job_id, level, message, data)
SELECT j.id,
       'warn',
       'global Gemini File API quota cooldown restored from existing job errors',
       jsonb_build_object(
         'category', 'quota_exhausted',
         'provider', 'gemini_file_api',
         'global_cooldown_until', (now() + interval '6 hours')::text,
         'rawMessage', left(COALESCE(j.error, ''), 1200),
         'at', now()::text
       )
FROM public.processing_jobs j
WHERE j.kind = 'extract_page'::public.processing_job_kind
  AND j.status IN ('pending','retrying')
  AND lower(COALESCE(j.error, '')) LIKE ANY (ARRAY['%exceeded your current quota%', '%check your plan and billing%', '%quota exhausted%', '%quota ex%', '%resource exhausted%'])
ORDER BY j.updated_at DESC NULLS LAST, j.created_at DESC
LIMIT 1;

NOTIFY pgrst, 'reload schema';