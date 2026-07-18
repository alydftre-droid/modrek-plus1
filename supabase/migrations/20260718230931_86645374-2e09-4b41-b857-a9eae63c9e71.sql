CREATE OR REPLACE FUNCTION public.library_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_anon text;
  v_request_id bigint;
BEGIN
  SELECT trim(both '"' from value::text) INTO v_key
  FROM public.platform_settings
  WHERE key = 'library_worker_shared_key';

  SELECT trim(both '"' from value::text) INTO v_url
  FROM public.platform_settings
  WHERE key = 'library_worker_url';

  IF COALESCE(v_url, '') = '' THEN
    SELECT trim(both '"' from value::text) INTO v_url
    FROM public.platform_settings
    WHERE key IN ('supabase_url', 'app.settings.supabase_url')
    ORDER BY CASE key WHEN 'supabase_url' THEN 0 ELSE 1 END
    LIMIT 1;

    IF COALESCE(v_url, '') <> '' THEN
      v_url := regexp_replace(v_url, '/+$', '') || '/functions/v1/library-worker';
    END IF;
  END IF;

  SELECT trim(both '"' from value::text) INTO v_anon
  FROM public.platform_settings
  WHERE key IN ('library_worker_anon_key', 'supabase_anon_key', 'app.settings.anon_key')
  ORDER BY CASE key WHEN 'library_worker_anon_key' THEN 0 WHEN 'supabase_anon_key' THEN 1 ELSE 2 END
  LIMIT 1;

  IF COALESCE(v_url, '') = '' OR COALESCE(v_anon, '') = '' OR COALESCE(v_key, '') = '' THEN
    PERFORM public.log_library_processing_event(
      j.book_id,
      j.id,
      'worker_heartbeat_config_missing',
      'فشل تشغيل عامل المكتبة: إعدادات رابط العامل أو مفاتيح الاستدعاء غير مكتملة',
      'error',
      j.progress,
      jsonb_build_object(
        'state', j.state,
        'kind', j.kind,
        'has_url', COALESCE(v_url, '') <> '',
        'has_anon_key', COALESCE(v_anon, '') <> '',
        'has_worker_key', COALESCE(v_key, '') <> ''
      )
    )
    FROM public.library_processing_jobs j
    WHERE j.state = 'queued'
    ORDER BY j.created_at ASC
    LIMIT 1;
    RETURN;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'x-worker-key', v_key
    ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  PERFORM public.log_library_processing_event(
    j.book_id,
    j.id,
    'worker_heartbeat_dispatched',
    'تم إرسال طلب تشغيل عامل معالجة المكتبة من قاعدة البيانات',
    'info',
    j.progress,
    jsonb_build_object('request_id', v_request_id, 'kind', j.kind, 'state', j.state)
  )
  FROM public.library_processing_jobs j
  WHERE j.state = 'queued'
  ORDER BY j.created_at ASC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM anon;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.library_worker_heartbeat() TO service_role;

DO $$
BEGIN
  PERFORM public.library_worker_heartbeat();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'library_worker_heartbeat verification failed: %', SQLERRM;
END $$;