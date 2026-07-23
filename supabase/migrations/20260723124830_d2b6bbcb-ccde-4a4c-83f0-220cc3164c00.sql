INSERT INTO public.platform_settings (key, value)
SELECT 'modrek_worker_shared_key', value
FROM public.platform_settings
WHERE key = 'library_worker_shared_key'
  AND NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'modrek_worker_shared_key')
LIMIT 1;

INSERT INTO public.platform_settings (key, value)
SELECT 'modrek_worker_url', regexp_replace(value, '/library-worker$', '/modrek-worker')
FROM public.platform_settings
WHERE key = 'library_worker_url'
  AND NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'modrek_worker_url')
LIMIT 1;

CREATE OR REPLACE FUNCTION public.modrek_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  v_url text;
  v_key text;
  v_anon text;
BEGIN
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

REVOKE ALL ON FUNCTION public.modrek_worker_heartbeat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_worker_heartbeat() TO service_role;

UPDATE public.processing_jobs
   SET next_run_at = now(), updated_at = now()
 WHERE status IN ('pending','retrying');

NOTIFY pgrst, 'reload schema';