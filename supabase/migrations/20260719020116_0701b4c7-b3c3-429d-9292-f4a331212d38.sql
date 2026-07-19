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
      'worker_dispatch_mode_edge_only',
      'تشغيل عامل المكتبة يتم الآن من Edge Function مباشرة؛ تم تجاوز pg_net لأنه غير موثوق في هذه البيئة',
      'info',
      0,
      jsonb_build_object(
        'reason', 'pg_net_disabled_after_out_of_memory',
        'dispatcher', 'library-admin kickWorker + library-worker run_until_idle + self-dispatch',
        'expected_action', 'if job remains queued, check worker_kick_failed or worker_auth_failed events'
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

DROP POLICY IF EXISTS "Voice answers readable by authenticated" ON public.voice_answers;
CREATE POLICY "Voice answers readable by owner or admin"
  ON public.voice_answers
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

NOTIFY pgrst, 'reload schema';