CREATE OR REPLACE FUNCTION public.submit_exam_attempt_resilient(
  _exam_id uuid,
  _attempt_id uuid,
  _answers json,
  _tab_switches integer DEFAULT 0,
  _fullscreen_exits integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.submit_exam_attempt_resilient(
    _exam_id,
    _attempt_id,
    COALESCE(_answers::jsonb, '[]'::jsonb),
    COALESCE(_tab_switches, 0),
    COALESCE(_fullscreen_exits, 0)
  );
$$;

REVOKE ALL ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, json, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt_resilient(uuid, uuid, json, integer, integer) TO authenticated, service_role;