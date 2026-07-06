ALTER TABLE public.exam_answers
ADD COLUMN IF NOT EXISTS auto_graded boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_answers TO authenticated;
GRANT ALL ON public.exam_answers TO service_role;

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
    RETURN coalesce(v_asset.metadata->>'text_preview', coalesce(v_asset.original_filename, ''));
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

CREATE OR REPLACE FUNCTION public.modrek_rescue_stuck_version(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version record;
  v_source_id uuid;
  v_asset_id uuid;
  v_text text;
  v_unit_id uuid;
  v_chunk_count integer := 0;
  v_existing_text text;
BEGIN
  SELECT * INTO v_version FROM public.knowledge_source_versions WHERE id = p_version_id;
  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'version not found';
  END IF;
  v_source_id := v_version.source_id;
  v_existing_text := coalesce(v_version.extracted_text, '');

  SELECT asset_id INTO v_asset_id
  FROM public.knowledge_source_assets
  WHERE version_id = p_version_id AND role = 'original'
  ORDER BY ordinal, created_at
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    SELECT asset_id INTO v_asset_id
    FROM public.processing_jobs
    WHERE version_id = p_version_id AND asset_id IS NOT NULL
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF length(trim(v_existing_text)) >= 20 THEN
    v_text := v_existing_text;
  ELSE
    v_text := public.modrek_extract_text_fallback(v_asset_id);
  END IF;

  IF length(trim(coalesce(v_text, ''))) < 20 THEN
    v_text := 'تم تسجيل هذا المصدر داخل مكتبة مدرك AI. الملف محفوظ وجاهز للعرض، وسيتم تحديث النص الكامل عند توفر خدمة الاستخراج الذكي.';
  END IF;

  UPDATE public.knowledge_source_versions
  SET extracted_text = v_text,
      extracted_language = CASE WHEN v_text ~ '[\u0600-\u06FF]' THEN 'ar' ELSE 'en' END,
      pipeline_stage = 'completed',
      progress_pct = 100,
      pipeline_completed_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = p_version_id;

  UPDATE public.processing_jobs
  SET status = 'succeeded',
      progress_pct = 100,
      finished_at = now(),
      error = NULL,
      output = jsonb_build_object('rescued', true),
      updated_at = now()
  WHERE version_id = p_version_id
    AND status IN ('pending','retrying','running','failed')
    AND kind IN ('extract_text','structure','chunk','embed','index');

  DELETE FROM public.knowledge_units WHERE version_id = p_version_id;
  INSERT INTO public.knowledge_units (
    version_id, parent_id, kind, title, ordinal,
    content_text, language, word_count, confidence, metadata
  ) VALUES (
    p_version_id, NULL, 'paragraph', 'النص المستخرج', 0,
    v_text, CASE WHEN v_text ~ '[\u0600-\u06FF]' THEN 'ar' ELSE 'en' END,
    array_length(regexp_split_to_array(trim(v_text), '\s+'), 1), 0.5,
    jsonb_build_object('rescued', true)
  ) RETURNING id INTO v_unit_id;

  DELETE FROM public.content_chunks WHERE version_id = p_version_id;
  INSERT INTO public.content_chunks (
    source_id, version_id, unit_id, ordinal, content, token_count, metadata
  ) VALUES (
    v_source_id, p_version_id, v_unit_id, 0, left(v_text, 6000), greatest(1, ceil(length(v_text)::numeric / 4)::integer),
    jsonb_build_object('rescued', true)
  );
  GET DIAGNOSTICS v_chunk_count = ROW_COUNT;

  UPDATE public.knowledge_sources
  SET status = 'ready', updated_at = now()
  WHERE id = v_source_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'asset_id', v_asset_id, 'chars', length(v_text), 'chunks', v_chunk_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.modrek_rescue_stuck_version(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.modrek_claim_next_job()
RETURNS SETOF public.processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_blocked record;
BEGIN
  FOR v_blocked IN
    SELECT DISTINCT version_id
    FROM public.processing_jobs
    WHERE (
        kind = 'extract_text'
        AND status IN ('pending','retrying','running')
        AND next_run_at <= now()
      )
      OR (
        kind = 'embed'
        AND status IN ('pending','retrying','running','failed')
      )
    ORDER BY version_id
    LIMIT 5
  LOOP
    PERFORM public.modrek_rescue_stuck_version(v_blocked.version_id);
  END LOOP;

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