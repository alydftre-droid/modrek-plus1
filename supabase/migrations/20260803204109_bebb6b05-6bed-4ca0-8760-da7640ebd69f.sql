CREATE OR REPLACE FUNCTION public.modrek_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_anon text;
  v_pending integer := 0;
BEGIN
  -- Only wake the worker when there is real work queued. Previously this ran an
  -- unconditional HTTP POST every single minute (~86k wasted edge invocations
  -- per month, all failing with 401).
  SELECT
    (SELECT count(*) FROM public.library_processing_jobs WHERE state IN ('pending','running','retrying'))
    + (SELECT count(*) FROM public.processing_jobs WHERE status IN ('pending','running','retrying'))
    + (SELECT count(*) FROM public.knowledge_source_versions WHERE pipeline_stage NOT IN ('completed','failed'))
  INTO v_pending;

  IF COALESCE(v_pending, 0) = 0 THEN
    RETURN;
  END IF;

  SELECT value INTO v_url FROM public.platform_settings WHERE key = 'modrek_worker_url' LIMIT 1;
  IF v_url IS NULL OR btrim(v_url) = '' THEN
    v_url := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/modrek-worker';
  END IF;

  SELECT value INTO v_key FROM public.platform_settings WHERE key = 'modrek_worker_shared_key' LIMIT 1;
  IF v_key IS NULL OR btrim(v_key) = '' THEN
    SELECT value INTO v_key FROM public.platform_settings WHERE key = 'library_worker_shared_key' LIMIT 1;
  END IF;

  SELECT value INTO v_anon FROM public.platform_settings WHERE key = 'library_worker_anon_key' LIMIT 1;
  IF v_anon IS NOT NULL THEN
    v_anon := trim(both '"' from v_anon);
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', COALESCE(v_anon, ''),
      'Authorization', CASE WHEN v_anon IS NULL OR btrim(v_anon) = '' THEN '' ELSE 'Bearer ' || v_anon END,
      'x-worker-key', COALESCE(v_key, '')
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
DECLARE
  v_id bigint;
BEGIN
  -- Drop the duplicate per-minute worker cron (heartbeat already covers it).
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'modrek-worker-minute';
  IF v_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_id);
  END IF;

  -- Heartbeat: every 5 minutes instead of every minute.
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'modrek-worker-heartbeat';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_id, schedule => '*/5 * * * *');
  END IF;

  -- Cache/network log cleanups: hourly is plenty.
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'modrek-search-cache-cleanup';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_id, schedule => '7 * * * *');
  END IF;

  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'mp_cleanup_pg_net_http_logs';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_id, schedule => '17 * * * *');
  END IF;

  -- Withdrawal release scheduler: every 10 minutes instead of every minute.
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'modrek_teacher_monthly_withdrawal_release';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_id, schedule => '*/10 * * * *');
  END IF;
END $$;