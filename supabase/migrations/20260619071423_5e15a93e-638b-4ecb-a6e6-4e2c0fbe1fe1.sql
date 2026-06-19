
-- Allow authenticated users to read from the three buckets that are about to become private.
-- Routes that render these files are all behind ProtectedRoute, so authenticated access is acceptable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Authenticated read books bucket' AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY "Authenticated read books bucket"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'books');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Authenticated read videos bucket' AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY "Authenticated read videos bucket"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'videos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Authenticated read exams bucket' AND polrelid = 'storage.objects'::regclass
  ) THEN
    CREATE POLICY "Authenticated read exams bucket"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'exams');
  END IF;
END $$;

-- Drop old public-read policies that allowed anonymous access via /object/public/ paths.
DROP POLICY IF EXISTS "Books are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Exams are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Videos are publicly accessible" ON storage.objects;
