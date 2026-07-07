CREATE OR REPLACE FUNCTION public.modrek_enqueue_stage(
  p_version_id uuid,
  p_kind public.processing_job_kind,
  p_stage_order integer,
  p_input jsonb DEFAULT '{}'::jsonb,
  p_asset_id uuid DEFAULT NULL::uuid
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
BEGIN
  SELECT source_id INTO v_source_id
  FROM public.knowledge_source_versions
  WHERE id = p_version_id;

  v_max_attempts := CASE
    WHEN p_kind IN ('extract_page'::public.processing_job_kind, 'merge_text'::public.processing_job_kind, 'embed'::public.processing_job_kind) THEN 6
    ELSE 4
  END;

  INSERT INTO public.processing_jobs
    (source_id, version_id, asset_id, kind, status, input, stage_order, priority, max_attempts, next_run_at)
  VALUES
    (v_source_id, p_version_id, p_asset_id, p_kind, 'pending', COALESCE(p_input, '{}'::jsonb), p_stage_order, 100, v_max_attempts, now())
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) TO service_role;

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
    AND COALESCE(j.updated_at, j.started_at, j.created_at) < now() - interval '2 minutes';

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

UPDATE public.processing_jobs
SET status = 'retrying',
    next_run_at = now(),
    finished_at = now(),
    error = COALESCE(error, 'تم إنقاذ مهمة كانت معلقة وإعادتها للمعالجة بعد تحديث نظام Modrek'),
    updated_at = now()
WHERE status = 'running'
  AND COALESCE(updated_at, started_at, created_at) < now() - interval '2 minutes';

NOTIFY pgrst, 'reload schema';