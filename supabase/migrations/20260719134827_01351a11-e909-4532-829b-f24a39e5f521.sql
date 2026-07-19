
CREATE OR REPLACE FUNCTION public.claim_library_job(_worker text)
 RETURNS SETOF library_processing_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  jid uuid;
  stuck record;
  claimed public.library_processing_jobs%ROWTYPE;
BEGIN
  FOR stuck IN
    SELECT id, book_id, kind, attempts, locked_by, locked_at
      FROM public.library_processing_jobs
     WHERE state = 'running'
       AND locked_at IS NOT NULL
       AND locked_at < now() - interval '10 minutes'
       AND kind NOT LIKE 'v2\_%' ESCAPE '\'
  LOOP
    UPDATE public.library_processing_jobs
       SET state = 'queued', locked_by = NULL, locked_at = NULL, updated_at = now()
     WHERE id = stuck.id;

    PERFORM public.log_library_processing_event(
      stuck.book_id, stuck.id, 'job_requeued_after_timeout',
      'تمت إعادة مهمة عالقة إلى الطابور بعد انتهاء مهلة التشغيل', 'warning', NULL,
      jsonb_build_object('worker', _worker, 'previous_locked_by', stuck.locked_by, 'previous_locked_at', stuck.locked_at, 'kind', stuck.kind, 'attempts', stuck.attempts)
    );
  END LOOP;

  SELECT id INTO jid
    FROM public.library_processing_jobs
   WHERE state = 'queued'
     AND attempts < max_attempts
     AND kind NOT LIKE 'v2\_%' ESCAPE '\'
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF jid IS NULL THEN RETURN; END IF;

  UPDATE public.library_processing_jobs
     SET state = 'running', locked_by = _worker, locked_at = now(),
         attempts = attempts + 1, started_at = COALESCE(started_at, now()), updated_at = now()
   WHERE id = jid
   RETURNING * INTO claimed;

  PERFORM public.log_library_processing_event(
    claimed.book_id, claimed.id, 'job_claimed',
    'بدأ عامل الخلفية تنفيذ مهمة من طابور المكتبة', 'info', claimed.progress,
    jsonb_build_object('worker', _worker, 'kind', claimed.kind, 'attempts', claimed.attempts, 'state', claimed.state)
  );

  RETURN NEXT claimed;
END;
$function$;
