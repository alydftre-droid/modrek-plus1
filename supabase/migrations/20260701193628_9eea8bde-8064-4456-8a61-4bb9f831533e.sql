
-- 1) Revoke EXECUTE from anon on all SECURITY DEFINER functions in public schema
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public;', r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Prevent client-supplied ip_address / user_agent tampering on teacher_activity_logs
CREATE OR REPLACE FUNCTION public.sanitize_teacher_activity_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If caller is not service_role, discard any client-supplied ip/user_agent.
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.ip_address := NULL;
    NEW.user_agent := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sanitize_teacher_activity_log() FROM anon, public;

DROP TRIGGER IF EXISTS trg_sanitize_teacher_activity_log ON public.teacher_activity_logs;
CREATE TRIGGER trg_sanitize_teacher_activity_log
BEFORE INSERT OR UPDATE ON public.teacher_activity_logs
FOR EACH ROW EXECUTE FUNCTION public.sanitize_teacher_activity_log();
