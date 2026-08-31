-- 1) Make the platform admin RPCs unambiguously visible to PostgREST again
--    (explicit grants + a DDL touch that forces a schema-cache reload).
ALTER FUNCTION public.admin_list_teacher_platforms() SET search_path TO 'public';
ALTER FUNCTION public.admin_list_platform_students(uuid) SET search_path TO 'public';

REVOKE ALL ON FUNCTION public.admin_list_teacher_platforms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_platforms() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_teacher_platform(text, text, uuid, uuid[], text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_teacher_platform(uuid, text, text, text, text, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_list_teacher_platforms() IS
  'Admin-only listing of teacher platforms (no parameters). Called from /admin/platforms.';

-- 2) Helper: is this user allowed to write branding files for a given platform id?
CREATE OR REPLACE FUNCTION public.can_manage_platform_branding(_user_id uuid, _platform_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.teacher_platforms p
      WHERE p.id = _platform_id AND p.owner_teacher_id = _user_id
    )
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_platform_branding(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_platform_branding(uuid, uuid) TO authenticated, service_role;

-- 3) Storage policies for platform branding assets.
--    Path contract: platforms/{platform_id}/branding/<file>
DROP POLICY IF EXISTS "platform_logos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "platform_logos_manager_insert" ON storage.objects;
DROP POLICY IF EXISTS "platform_logos_manager_update" ON storage.objects;
DROP POLICY IF EXISTS "platform_logos_manager_delete" ON storage.objects;

CREATE POLICY "platform_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'platform-logos');

CREATE POLICY "platform_logos_manager_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'platform-logos'
    AND (storage.foldername(name))[1] = 'platforms'
    AND (storage.foldername(name))[3] = 'branding'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "platform_logos_manager_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'platform-logos'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'platform-logos'
    AND (storage.foldername(name))[1] = 'platforms'
    AND (storage.foldername(name))[3] = 'branding'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "platform_logos_manager_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'platform-logos'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );
