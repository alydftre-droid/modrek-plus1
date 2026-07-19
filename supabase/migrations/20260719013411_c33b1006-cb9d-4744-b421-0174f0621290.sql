DO $$
BEGIN
  PERFORM cron.unschedule('mp_library_worker_heartbeat');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.library_worker_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_id uuid;
  v_book_id uuid;
BEGIN
  SELECT id, book_id INTO v_job_id, v_book_id
  FROM public.library_processing_jobs
  WHERE state IN ('queued', 'running')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_book_id IS NOT NULL THEN
    PERFORM public.log_library_processing_event(
      v_book_id,
      v_job_id,
      'cron_dispatch_disabled',
      'تم تعطيل Cron القديم لأنه كان يفشل داخل pg_net؛ التشغيل الآن يتم مباشرة من Edge Function عند النشر ومن شاشة المراقبة',
      'warning',
      0,
      jsonb_build_object(
        'reason', 'pg_net_http_post_out_of_memory',
        'replacement', 'library-admin kickWorker + library-worker self dispatch',
        'function', 'public.library_worker_heartbeat'
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM anon;
REVOKE ALL ON FUNCTION public.library_worker_heartbeat() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.library_worker_heartbeat() TO service_role;
GRANT EXECUTE ON FUNCTION public.library_worker_heartbeat() TO postgres;

DELETE FROM net._http_response;
DELETE FROM net.http_request_queue;
NOTIFY pgrst, 'reload schema';