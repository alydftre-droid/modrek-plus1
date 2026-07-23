-- Fix: Modrek worker cron heartbeat had no auth headers, so every tick returned
-- 401 unauthorized_worker and the queue never drained (books stuck at 5%).
--
-- Seed a shared key + worker URL in platform_settings, then rewrite the
-- heartbeat to POST them as x-worker-key (matches the worker's auth guard).

INSERT INTO public.platform_settings (key, value)
SELECT 'modrek_worker_shared_key',
       to_jsonb(encode(gen_random_bytes(32), 'hex'))
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings WHERE key = 'modrek_worker_shared_key'
);

INSERT INTO public.platform_settings (key, value)
SELECT 'modrek_worker_url',
       to_jsonb('https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/modrek-worker'::text)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings WHERE key = 'modrek_worker_url'
);

CREATE OR REPLACE FUNCTION public.modrek_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT CASE
           WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
           ELSE value::text
         END
    INTO v_url
    FROM public.platform_settings
   WHERE key = 'modrek_worker_url';

  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://qteuqfntsocsdbjmdvmr.supabase.co/functions/v1/modrek-worker';
  END IF;

  SELECT CASE
           WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
           WHEN jsonb_typeof(value) = 'object' THEN COALESCE(value ->> 'key', value::text)
           ELSE value::text
         END
    INTO v_key
    FROM public.platform_settings
   WHERE key = 'modrek_worker_shared_key';

  PERFORM extensions.net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-key', COALESCE(v_key, '')
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.modrek_worker_heartbeat() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_worker_heartbeat() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('modrek-worker-heartbeat');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('modrek-worker-heartbeat', '* * * * *', 'SELECT public.modrek_worker_heartbeat();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'modrek worker heartbeat schedule skipped: %', SQLERRM;
END $$;

UPDATE public.processing_jobs
   SET next_run_at = now(),
       updated_at = now()
 WHERE status IN ('pending','retrying');

NOTIFY pgrst, 'reload schema';