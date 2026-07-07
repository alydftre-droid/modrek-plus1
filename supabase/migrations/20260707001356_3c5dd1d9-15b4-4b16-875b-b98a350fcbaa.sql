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
  v_pos integer := 1;
  v_ord integer := 0;
  v_chunk text;
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
  WHILE v_pos <= length(v_text) LOOP
    v_chunk := substr(v_text, v_pos, 3500);
    IF length(trim(v_chunk)) > 0 THEN
      INSERT INTO public.content_chunks (
        source_id, version_id, unit_id, ordinal, content, token_count, metadata
      ) VALUES (
        v_source_id,
        p_version_id,
        v_unit_id,
        v_ord,
        v_chunk,
        greatest(1, ceil(length(v_chunk)::numeric / 4)::integer),
        jsonb_build_object('rescued_from_existing_full_text', true)
      );
      v_chunk_count := v_chunk_count + 1;
      v_ord := v_ord + 1;
    END IF;
    v_pos := v_pos + 3250;
  END LOOP;

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
NOTIFY pgrst, 'reload schema';