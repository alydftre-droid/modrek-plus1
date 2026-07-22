-- Revoke anon EXECUTE from SECURITY DEFINER functions in public,
-- keep authenticated + service_role grants intact.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant a small allow-list of pre-login helpers to anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('get_email_by_phone')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', r.proname, r.args);
  END LOOP;
END $$;

-- Also drop the anon default privilege we just added so future SECDEF fns aren't exposed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

NOTIFY pgrst, 'reload schema';
