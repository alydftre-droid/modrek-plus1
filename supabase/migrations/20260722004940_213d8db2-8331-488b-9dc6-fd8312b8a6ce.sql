
-- Books bucket: teacher isolation by folder
DROP POLICY IF EXISTS "Teachers can upload books" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete books" ON storage.objects;
CREATE POLICY "Teachers can upload books"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'books'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "Teachers can delete books"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'books'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Exams bucket
DROP POLICY IF EXISTS "Teachers can upload exams" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete exams" ON storage.objects;
CREATE POLICY "Teachers can upload exams"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exams'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "Teachers can delete exams"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'exams'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Videos bucket
DROP POLICY IF EXISTS "Teachers can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete videos" ON storage.objects;
CREATE POLICY "Teachers can upload videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "Teachers can delete videos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'videos'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Live recordings: scope INSERT to the teacher's own folder (mirrors DELETE)
DROP POLICY IF EXISTS "Teachers can upload recordings" ON storage.objects;
CREATE POLICY "Teachers can upload recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'live-recordings'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = auth.uid()::text
);
