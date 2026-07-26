CREATE OR REPLACE FUNCTION public.modrek_enqueue_stage(
  p_version_id uuid,
  p_kind public.processing_job_kind,
  p_stage_order integer,
  p_input jsonb DEFAULT '{}'::jsonb,
  p_asset_id uuid DEFAULT NULL::uuid,
  p_max_attempts integer DEFAULT NULL::integer
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

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'knowledge source version not found: %', p_version_id;
  END IF;

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
    IF p_max_attempts IS NOT NULL THEN
      UPDATE public.processing_jobs
      SET max_attempts = GREATEST(COALESCE(max_attempts, 0), p_max_attempts),
          updated_at = now()
      WHERE id = v_job_id;
    END IF;
    RETURN v_job_id;
  END IF;

  v_max_attempts := COALESCE(
    NULLIF(p_max_attempts, 0),
    CASE
      WHEN p_kind = 'merge_text'::public.processing_job_kind THEN 80
      WHEN p_kind = 'extract_page'::public.processing_job_kind THEN 30
      WHEN p_kind IN ('embed'::public.processing_job_kind, 'upload_pdf_chunk'::public.processing_job_kind) THEN 10
      ELSE 4
    END
  );

  INSERT INTO public.processing_jobs
    (source_id, version_id, asset_id, kind, status, input, stage_order, priority, max_attempts, next_run_at)
  VALUES
    (v_source_id, p_version_id, p_asset_id, p_kind, 'pending', COALESCE(p_input, '{}'::jsonb), p_stage_order, 100, v_max_attempts, now())
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid, integer) TO service_role;

-- Keep the existing 5-argument RPC working for older deployed functions and manual retry tools.
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) TO service_role;