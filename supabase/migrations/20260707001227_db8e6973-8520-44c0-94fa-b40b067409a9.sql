CREATE OR REPLACE FUNCTION public.modrek_extract_text_fallback(p_asset_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_asset record;
BEGIN
  SELECT * INTO v_asset FROM public.storage_assets WHERE id = p_asset_id;
  IF v_asset.id IS NULL THEN
    RETURN '';
  END IF;

  IF lower(coalesce(v_asset.mime_type, '')) LIKE 'text/%' THEN
    RETURN coalesce(v_asset.metadata->>'text_preview', '');
  END IF;

  -- لا نُرجع اسم الملف أو رسالة عامة كبديل عن محتوى الكتاب.
  -- أي استخراج غير كامل يجب أن يفشل بوضوح حتى لا يتم فهرسة كتاب ناقص.
  RETURN '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.modrek_extract_text_fallback(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_rescue_stuck_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version record;
  v_source_id uuid;
  v_text text;
  v_unit_id uuid;
  v_chunk_count integer := 0;
BEGIN
  SELECT * INTO v_version FROM public.knowledge_source_versions WHERE id = p_version_id;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'version not found';
  END IF;

  v_source_id := v_version.source_id;
  v_text := coalesce(v_version.extracted_text, '');

  IF length(trim(v_text)) < 200 THEN
    UPDATE public.processing_jobs
    SET status = 'failed',
        progress_pct = 100,
        finished_at = now(),
        error = 'تعذر استخراج النص الكامل من الملف. لم يتم اعتماد نص مختصر بديل.',
        updated_at = now()
    WHERE version_id = p_version_id
      AND status IN ('pending','retrying','running','failed')
      AND kind IN ('extract_text','structure','chunk','embed','index');

    UPDATE public.knowledge_source_versions
    SET pipeline_stage = 'failed',
        error_message = 'تعذر استخراج النص الكامل من الملف. لم يتم اعتماد نص مختصر بديل؛ أعد رفع PDF نصي واضح أو شغّل OCR كامل ثم أعد المحاولة.',
        updated_at = now()
    WHERE id = p_version_id;

    UPDATE public.knowledge_sources
    SET status = 'failed', updated_at = now()
    WHERE id = v_source_id;

    RETURN jsonb_build_object('ok', false, 'version_id', p_version_id, 'reason', 'no_full_text');
  END IF;

  DELETE FROM public.knowledge_units WHERE version_id = p_version_id;
  INSERT INTO public.knowledge_units (
    version_id, parent_id, kind, title, ordinal,
    content_text, language, word_count, confidence, metadata
  ) VALUES (
    p_version_id, NULL, 'paragraph', 'النص الكامل المستخرج', 0,
    v_text, CASE WHEN v_text ~ '[\u0600-\u06FF]' THEN 'ar' ELSE 'en' END,
    array_length(regexp_split_to_array(trim(v_text), '\s+'), 1), 0.9,
    jsonb_build_object('rescued_from_existing_full_text', true)
  ) RETURNING id INTO v_unit_id;

  DELETE FROM public.content_chunks WHERE version_id = p_version_id;
  INSERT INTO public.content_chunks (
    source_id, version_id, unit_id, ordinal, content, token_count, metadata
  )
  SELECT
    v_source_id,
    p_version_id,
    v_unit_id,
    row_number() over () - 1,
    chunk,
    greatest(1, ceil(length(chunk)::numeric / 4)::integer),
    jsonb_build_object('rescued_from_existing_full_text', true)
  FROM regexp_split_to_table(v_text, '(?<=.{3500})') AS chunk
  WHERE length(trim(chunk)) > 0;
  GET DIAGNOSTICS v_chunk_count = ROW_COUNT;

  UPDATE public.processing_jobs
  SET status = 'succeeded',
      progress_pct = 100,
      finished_at = now(),
      error = NULL,
      output = jsonb_build_object('rescued_from_existing_full_text', true, 'chunks', v_chunk_count),
      updated_at = now()
  WHERE version_id = p_version_id
    AND status IN ('pending','retrying','running','failed')
    AND kind IN ('structure','chunk','embed','index');

  UPDATE public.knowledge_source_versions
  SET pipeline_stage = 'completed',
      progress_pct = 100,
      pipeline_completed_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = p_version_id;

  UPDATE public.knowledge_sources
  SET status = 'ready', updated_at = now()
  WHERE id = v_source_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'chars', length(v_text), 'chunks', v_chunk_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.modrek_rescue_stuck_version(uuid) TO service_role;

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

NOTIFY pgrst, 'reload schema';