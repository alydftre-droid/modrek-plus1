CREATE OR REPLACE FUNCTION public.modrek_register_bunny_upload(
  p_version_id uuid,
  p_bunny_path text,
  p_filename text,
  p_mime text,
  p_size bigint,
  p_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version record;
  v_asset_id uuid;
  v_existing_link uuid;
  v_ordinal integer;
  v_job_id uuid;
  v_bucket text := 'bunny:modrekplus-storage';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT public.is_modrek_admin(v_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_version_id IS NULL THEN
    RAISE EXCEPTION 'version_id required';
  END IF;

  IF p_sha256 IS NULL OR length(lower(trim(p_sha256))) <> 64 THEN
    RAISE EXCEPTION 'valid sha256 required';
  END IF;

  p_bunny_path := regexp_replace(coalesce(p_bunny_path, ''), '^/+', '');
  IF p_bunny_path = '' OR p_bunny_path NOT LIKE 'modrek/%' THEN
    RAISE EXCEPTION 'bunny_path must start with modrek/';
  END IF;

  SELECT id, source_id INTO v_version
  FROM public.knowledge_source_versions
  WHERE id = p_version_id;

  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'version not found';
  END IF;

  SELECT id INTO v_asset_id
  FROM public.storage_assets
  WHERE sha256 = lower(trim(p_sha256))
  LIMIT 1;

  IF v_asset_id IS NULL THEN
    INSERT INTO public.storage_assets (
      sha256, storage_provider, bucket, object_path, mime_type,
      byte_size, original_filename, uploaded_by, metadata
    ) VALUES (
      lower(trim(p_sha256)), 'bunny', v_bucket, p_bunny_path, coalesce(nullif(p_mime, ''), 'application/octet-stream'),
      greatest(coalesce(p_size, 0), 0), coalesce(nullif(p_filename, ''), 'file'), v_user_id,
      jsonb_build_object('zone', 'modrekplus-storage', 'host', 'storage.bunnycdn.com', 'registered_via', 'db_rpc')
    )
    RETURNING id INTO v_asset_id;
  END IF;

  SELECT id INTO v_existing_link
  FROM public.knowledge_source_assets
  WHERE version_id = v_version.id
    AND asset_id = v_asset_id
    AND role = 'original'
  LIMIT 1;

  IF v_existing_link IS NULL THEN
    SELECT coalesce(max(ordinal), -1) + 1 INTO v_ordinal
    FROM public.knowledge_source_assets
    WHERE version_id = v_version.id
      AND role = 'original';

    INSERT INTO public.knowledge_source_assets (
      source_id, version_id, asset_id, role, ordinal
    ) VALUES (
      v_version.source_id, v_version.id, v_asset_id, 'original', coalesce(v_ordinal, 0)
    );
  END IF;

  UPDATE public.knowledge_source_versions
  SET pipeline_stage = 'queued',
      progress_pct = greatest(coalesce(progress_pct, 0), 5),
      pipeline_started_at = coalesce(pipeline_started_at, now()),
      error_message = null,
      updated_at = now()
  WHERE id = v_version.id;

  UPDATE public.knowledge_sources
  SET status = 'processing',
      updated_at = now()
  WHERE id = v_version.source_id;

  v_job_id := public.modrek_enqueue_stage(
    v_version.id,
    'detect'::public.processing_job_kind,
    10,
    jsonb_build_object('asset_id', v_asset_id, 'mime', coalesce(nullif(p_mime, ''), 'application/octet-stream'), 'filename', coalesce(nullif(p_filename, ''), 'file')),
    v_asset_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'job_id', v_job_id,
    'provider', 'bunny',
    'bunny_path', p_bunny_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_register_bunny_upload(uuid, text, text, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.modrek_register_bunny_upload(uuid, text, text, text, bigint, text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';