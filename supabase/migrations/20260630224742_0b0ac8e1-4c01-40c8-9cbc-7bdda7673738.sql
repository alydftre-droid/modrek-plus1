
DROP POLICY IF EXISTS "Teachers can upload own profile files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can update own profile files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete own profile files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers upload profile images" ON storage.objects;

CREATE POLICY "Authed users upload own teacher-profile files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'teacher-profiles'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authed users update own teacher-profile files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'teacher-profiles'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'teacher-profiles'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authed users delete own teacher-profile files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'teacher-profiles'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
