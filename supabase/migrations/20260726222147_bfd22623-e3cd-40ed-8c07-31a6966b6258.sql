DROP FUNCTION IF EXISTS public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid);

REVOKE ALL ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.modrek_enqueue_stage(uuid, public.processing_job_kind, integer, jsonb, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';