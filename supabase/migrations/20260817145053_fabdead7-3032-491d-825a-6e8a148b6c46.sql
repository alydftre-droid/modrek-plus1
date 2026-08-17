CREATE OR REPLACE FUNCTION public.modrek_retry_failed_pages(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requeued INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.knowledge_source_versions
     SET credits_blocked_at = NULL,
         credits_blocked_reason = NULL,
         error_message = NULL,
         updated_at = now()
   WHERE id = p_version_id;

  UPDATE public.knowledge_page_state
     SET extraction_status = 'pending',
         error_category = NULL,
         error_message = NULL,
         updated_at = now()
   WHERE version_id = p_version_id
     AND extraction_status IN ('failed', 'cancelled');

  WITH requeued AS (
    UPDATE public.processing_jobs
       SET status = 'pending',
           attempts = 0,
           error = NULL,
           next_run_at = now(),
           finished_at = NULL,
           updated_at = now()
     WHERE version_id = p_version_id
       AND status IN ('failed', 'cancelled')
     RETURNING id
  )
  SELECT COUNT(*) INTO v_requeued FROM requeued;

  RETURN jsonb_build_object('success', true, 'requeued_jobs', v_requeued);
END;
$function$;