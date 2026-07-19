ALTER TABLE public.library_section_explanations
  ADD COLUMN IF NOT EXISTS audio_duration_seconds numeric,
  ADD COLUMN IF NOT EXISTS audio_quality text,
  ADD COLUMN IF NOT EXISTS audio_storage_path text,
  ADD COLUMN IF NOT EXISTS voice_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_library_expl_audio_storage_path
  ON public.library_section_explanations(audio_storage_path);

CREATE OR REPLACE FUNCTION public.library_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_worker_key text;
  v_anon_key text;
  v_request_id bigint;
  v_job_id uuid;
  v_book_id uuid;
BEGIN
  SELECT value INTO v_worker_key
  FROM public.platform_settings
  WHERE key = 'library_worker_shared_key';

  SELECT value INTO v_url
  FROM public.platform_settings
  WHERE key = 'library_worker_url';

  SELECT value INTO v_anon_key
  FROM public.platform_settings
  WHERE key IN ('library_worker_anon_key', 'supabase_anon_key', 'app.settings.anon_key')
  ORDER BY CASE key
    WHEN 'library_worker_anon_key' THEN 1
    WHEN 'supabase_anon_key' THEN 2
    ELSE 3
  END
  LIMIT 1;

  IF COALESCE(v_url, '') = '' THEN
    SELECT regexp_replace(value, '/+$', '') || '/functions/v1/library-worker'
    INTO v_url
    FROM public.platform_settings
    WHERE key IN ('supabase_url', 'app.settings.supabase_url')
    ORDER BY CASE key WHEN 'supabase_url' THEN 1 ELSE 2 END
    LIMIT 1;
  END IF;

  SELECT id, book_id INTO v_job_id, v_book_id
  FROM public.library_processing_jobs
  WHERE state IN ('queued', 'running')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_book_id IS NOT NULL THEN
    PERFORM public.log_library_processing_event(
      v_book_id,
      v_job_id,
      'worker_heartbeat_started',
      'تم تشغيل نبض عامل معالجة المكتبة من الجدولة الدورية',
      'info',
      0,
      jsonb_build_object(
        'source', 'pg_cron',
        'function', 'public.library_worker_heartbeat',
        'has_url', COALESCE(v_url, '') <> '',
        'has_anon_key', COALESCE(v_anon_key, '') <> '',
        'has_worker_key', COALESCE(v_worker_key, '') <> ''
      )
    );
  END IF;

  IF COALESCE(v_url, '') = '' OR COALESCE(v_anon_key, '') = '' OR COALESCE(v_worker_key, '') = '' THEN
    IF v_book_id IS NOT NULL THEN
      PERFORM public.log_library_processing_event(
        v_book_id,
        v_job_id,
        'worker_dispatch_config_missing',
        'فشل استدعاء العامل: إعدادات رابط العامل أو مفاتيح التشغيل غير مكتملة',
        'error',
        0,
        jsonb_build_object(
          'reason', 'worker_dispatch_config_missing',
          'has_url', COALESCE(v_url, '') <> '',
          'has_anon_key', COALESCE(v_anon_key, '') <> '',
          'has_worker_key', COALESCE(v_worker_key, '') <> ''
        )
      );
    END IF;
    RETURN;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := jsonb_build_object('job', 'mp_library_worker_heartbeat', 'source', 'cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-worker-key', v_worker_key
    ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  IF v_book_id IS NOT NULL THEN
    PERFORM public.log_library_processing_event(
      v_book_id,
      v_job_id,
      'worker_dispatch_sent',
      'تم إرسال طلب تشغيل العامل إلى Edge Function',
      'info',
      0,
      jsonb_build_object('request_id', v_request_id, 'source', 'pg_cron', 'url_configured', true)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM anon;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.library_worker_heartbeat() TO service_role;
GRANT EXECUTE ON FUNCTION public.library_worker_heartbeat() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('mp_library_worker_heartbeat');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'mp_library_worker_heartbeat',
  '* * * * *',
  'SELECT public.library_worker_heartbeat();'
);

NOTIFY pgrst, 'reload schema';