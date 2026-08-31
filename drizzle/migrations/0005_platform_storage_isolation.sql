-- Teacher Platforms: storage isolation.
-- Tenant uploads live under `platforms/<platform_id>/...`. Objects on that
-- prefix are readable/writable only by members of that platform (admins keep
-- full access). Objects outside the prefix are untouched, so the official
-- platform keeps working exactly as before.
CREATE OR REPLACE FUNCTION public.storage_platform_path_ok(_name text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name IS NULL OR _name NOT LIKE 'platforms/%' THEN true
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.platform_memberships m
      WHERE m.user_id = _user_id
        AND m.status = 'active'
        AND m.platform_id::text = split_part(_name, '/', 2)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.storage_platform_path_ok(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_platform_path_ok(text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Platform storage isolation" ON storage.objects;
CREATE POLICY "Platform storage isolation"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.storage_platform_path_ok(name, auth.uid()))
WITH CHECK (public.storage_platform_path_ok(name, auth.uid()));
