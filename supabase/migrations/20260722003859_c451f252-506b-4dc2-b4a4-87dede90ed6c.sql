-- Restore EXECUTE grants that were revoked by a prior hardening step.
-- Only affects EXECUTE on functions in the public schema; does not alter RLS,
-- table grants, or function bodies. SECURITY DEFINER functions continue to
-- enforce their own internal authorization (has_role, auth.uid(), etc.).

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- Ensure future functions created in public inherit these grants too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

NOTIFY pgrst, 'reload schema';
