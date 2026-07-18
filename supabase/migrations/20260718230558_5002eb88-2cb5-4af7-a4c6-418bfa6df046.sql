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
  SELECT value::text INTO v_key
  FROM public.platform_settings
  WHERE key = 'library_worker_shared_key';

  v_url := current_setting('app.library_worker_url', true);
  IF COALESCE(v_url, '') = '' THEN
    v_url := current_setting('app.settings.supabase_url', true);
    IF COALESCE(v_url, '') <> '' THEN
      v_url := regexp_replace(v_url, '/+$', '') || '/functions/v1/library-worker';
    END IF;
  END IF;

  IF COALESCE(v_url, '') = '' THEN
    PERFORM public.log_library_processing_event(
      j.book_id,
      j.id,
      'worker_heartbeat_url_missing',
      'فشل تشغيل عامل المكتبة: رابط الخلفية غير مضبوط داخل قاعدة البيانات',
      'error',
      j.progress,
      jsonb_build_object('state', j.state, 'kind', j.kind)
    )
    FROM public.library_processing_jobs j
    WHERE j.state = 'queued'
    ORDER BY j.created_at ASC
    LIMIT 1;
    RETURN;
  END IF;

  v_anon := current_setting('app.settings.anon_key', true);

  SELECT net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', NULLIF(v_anon, ''),
      'x-worker-key', COALESCE(v_key, '')
    )),
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

CREATE OR REPLACE FUNCTION public.enqueue_library_book_processing(_book_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jid uuid;
BEGIN
  UPDATE public.library_books
     SET status = 'processing',
         processing_progress = 0,
         processing_stage = 'queued',
         processing_error = NULL,
         updated_at = now()
   WHERE id = _book_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'library_book_not_found:%', _book_id;
  END IF;

  PERFORM public.log_library_processing_event(
    _book_id,
    NULL,
    'publish_started',
    'بدأ نشر الكتاب وتجهيز طابور المعالجة',
    'info',
    0,
    jsonb_build_object('status', 'processing', 'stage', 'queued')
  );

  DELETE FROM public.library_processing_jobs
   WHERE book_id = _book_id
     AND state IN ('failed','cancelled','completed');

  INSERT INTO public.library_processing_jobs (book_id, stage, kind, state, progress, attempts)
  VALUES (_book_id, 'upload', 'extract_book', 'queued', 0, 0)
  ON CONFLICT DO NOTHING
  RETURNING id INTO jid;

  IF jid IS NULL THEN
    SELECT id INTO jid
      FROM public.library_processing_jobs
     WHERE book_id = _book_id
       AND kind = 'extract_book'
       AND state IN ('queued','running')
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  IF jid IS NULL THEN
    RAISE EXCEPTION 'library_enqueue_failed_no_job:%', _book_id;
  END IF;

  PERFORM public.log_library_processing_event(
    _book_id,
    jid,
    'queue_job_created',
    'تم إنشاء مهمة معالجة الكتاب في الطابور',
    'info',
    0,
    jsonb_build_object('kind', 'extract_book', 'state', 'queued')
  );

  PERFORM pg_notify('pgrst', 'reload schema');

  RETURN jid;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_library_book_processing(uuid) TO service_role;

DO $$
BEGIN
  PERFORM public.library_worker_heartbeat();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'library_worker_heartbeat verification failed: %', SQLERRM;
END $$;