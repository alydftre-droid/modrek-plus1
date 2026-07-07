CREATE OR REPLACE FUNCTION public.modrek_enqueue_stage(
  p_version_id uuid,
  p_kind public.processing_job_kind,
  p_stage_order integer,
  p_input jsonb DEFAULT '{}'::jsonb,
  p_asset_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.modrek_enqueue_stage(
    p_version_id,
    p_kind,
    p_stage_order,
    COALESCE(p_input, '{}'::jsonb),
    p_asset_id,
    NULL::integer
  );
$$;

REVOKE ALL ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid) TO service_role;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO v_jobid
    FROM cron.job
    WHERE jobname = 'modrek-worker-heartbeat'
    LIMIT 1;

    IF v_jobid IS NOT NULL THEN
      PERFORM cron.unschedule(v_jobid);
    END IF;

    PERFORM cron.schedule(
      'modrek-worker-heartbeat',
      '* * * * *',
      'SELECT public.modrek_worker_heartbeat();'
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';