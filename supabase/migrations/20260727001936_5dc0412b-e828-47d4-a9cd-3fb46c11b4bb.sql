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
  SET input = jsonb_set(jsonb_set(COALESCE(j.input, '{}'::jsonb), '{extractor}', '"local_pdfjs"'::jsonb, true), '{gemini_file}', 'null'::jsonb, true),
      status = 'pending',
      error = NULL,
      attempts = 0,
      max_attempts = GREATEST(COALESCE(j.max_attempts, 0), 30),
      next_run_at = now(),
      started_at = NULL,
      finished_at = NULL,
      updated_at = now()
  FROM public.storage_assets a
  WHERE j.asset_id = a.id
    AND j.kind = 'extract_page'::public.processing_job_kind
    AND j.status IN ('pending','running','retrying','failed')
    AND a.mime_type = 'application/pdf'
    AND COALESCE(a.byte_size, 0) <= 80 * 1024 * 1024
    AND (
      COALESCE(j.input->>'extractor', '') = 'gemini_file'
      OR COALESCE(j.input->'gemini_file'->>'uri', '') <> ''
      OR COALESCE(j.error, '') ILIKE '%Gemini file generation failed%'
      OR COALESCE(j.error, '') ILIKE '%exceeded your current quota%'
      OR COALESCE(j.error, '') ILIKE '%quota%'
    );

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
        OR COALESCE((SELECT asset.byte_size FROM public.storage_assets asset WHERE asset.id = candidate.asset_id), 0) <= 80 * 1024 * 1024
        OR NOT (
          COALESCE(candidate.input->>'extractor', '') = 'gemini_file'
          OR COALESCE(candidate.input->'gemini_file'->>'uri', '') <> ''
        )
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
                WHEN COALESCE(e.data->>'global_cooldown_until', '') ~ '^\d{4}-\d{2}-\d{2}T' THEN (e.data->>'global_cooldown_until')::timestamptz
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

NOTIFY pgrst, 'reload schema';