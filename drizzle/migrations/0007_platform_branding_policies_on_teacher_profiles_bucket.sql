-- Public buckets are blocked by workspace policy, so platform branding lives in the
-- existing public `teacher-profiles` bucket under the strict path contract:
--   platforms/{platform_id}/branding/<file>
DROP POLICY IF EXISTS "platform_logos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "platform_logos_manager_insert" ON storage.objects;
DROP POLICY IF EXISTS "platform_logos_manager_update" ON storage.objects;
DROP POLICY IF EXISTS "platform_logos_manager_delete" ON storage.objects;

CREATE POLICY "platform_branding_manager_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'teacher-profiles'
    AND (storage.foldername(name))[1] = 'platforms'
    AND (storage.foldername(name))[3] = 'branding'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "platform_branding_manager_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'teacher-profiles'
    AND (storage.foldername(name))[1] = 'platforms'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'teacher-profiles'
    AND (storage.foldername(name))[1] = 'platforms'
    AND (storage.foldername(name))[3] = 'branding'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );

CREATE POLICY "platform_branding_manager_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'teacher-profiles'
    AND (storage.foldername(name))[1] = 'platforms'
    AND public.can_manage_platform_branding(auth.uid(), ((storage.foldername(name))[2])::uuid)
  );
