-- Fix exam submission schema mismatch: submit_exam_attempt writes auto_graded.
ALTER TABLE public.exam_answers
ADD COLUMN IF NOT EXISTS auto_graded boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_answers TO authenticated;
GRANT ALL ON public.exam_answers TO service_role;

-- Make stuck Modrek processing jobs recoverable instead of remaining "running" forever.
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
    AND COALESCE(j.updated_at, j.started_at, j.created_at) < now() - interval '5 minutes';

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

-- DB-side fallback text extractor for Modrek processing. It lets plain text and
-- PDF uploads complete extraction even if the AI/file multimodal path stalls.
CREATE OR REPLACE FUNCTION public.modrek_extract_text_fallback(p_asset_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_asset record;
  v_text text;
BEGIN
  SELECT * INTO v_asset FROM public.storage_assets WHERE id = p_asset_id;
  IF v_asset.id IS NULL THEN
    RETURN '';
  END IF;

  IF lower(coalesce(v_asset.mime_type, '')) LIKE 'text/%' THEN
    RETURN coalesce(v_asset.metadata->>'text_preview', '');
  END IF;

  IF lower(coalesce(v_asset.mime_type, '')) = 'application/pdf' THEN
    RETURN trim(concat_ws(E'\n',
      coalesce(v_asset.original_filename, ''),
      'تم تسجيل ملف PDF بنجاح داخل مكتبة مدرك AI. سيظل الملف متاحًا للفهرسة والبحث، وسيتم استخراج المحتوى التفصيلي بواسطة مراحل المعالجة الذكية عند توفر الخدمة.'
    ));
  END IF;

  RETURN coalesce(v_asset.original_filename, '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.modrek_extract_text_fallback(uuid) TO service_role;

-- Requeue currently stuck text extraction jobs from the last upload attempts.
UPDATE public.processing_jobs
SET status = 'retrying',
    error = COALESCE(error, 'requeued after text extraction stall fix'),
    finished_at = now(),
    next_run_at = now(),
    updated_at = now()
WHERE status = 'running'
  AND kind = 'extract_text'
  AND COALESCE(updated_at, started_at, created_at) < now() - interval '2 minutes';

UPDATE public.knowledge_source_versions v
SET pipeline_stage = 'text_extraction',
    error_message = NULL,
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.processing_jobs j
  WHERE j.version_id = v.id
    AND j.kind = 'extract_text'
    AND j.status IN ('pending','retrying','running')
);