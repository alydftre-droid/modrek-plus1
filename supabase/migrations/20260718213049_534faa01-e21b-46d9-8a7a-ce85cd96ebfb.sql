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

  DELETE FROM public.library_processing_jobs
   WHERE book_id = _book_id
     AND state IN ('failed','cancelled');

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

  RETURN jid;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_library_book_processing(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_library_book_processing(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';