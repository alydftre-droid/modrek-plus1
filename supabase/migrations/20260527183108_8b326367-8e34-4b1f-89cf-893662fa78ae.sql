
-- 1) Realtime channel authorization: deny anonymous subscribes by default,
--    restrict authenticated subscribers to user-owned topics like "user:<uid>".
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated may subscribe to own topic" ON realtime.messages;
CREATE POLICY "Authenticated may subscribe to own topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'user:' || auth.uid()::text
  OR realtime.topic() LIKE 'public:%'
);

DROP POLICY IF EXISTS "Authenticated may broadcast to own topic" ON realtime.messages;
CREATE POLICY "Authenticated may broadcast to own topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = 'user:' || auth.uid()::text
);

-- 2) Revoke EXECUTE from anon on SECURITY DEFINER functions in public schema.
--    None of these are intended for unauthenticated callers; RLS-evaluated
--    definer functions (e.g. has_role) are executed in the policy context
--    and do not require anon EXECUTE.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
