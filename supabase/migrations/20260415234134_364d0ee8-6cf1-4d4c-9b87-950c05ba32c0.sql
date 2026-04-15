
-- 1. Fix teacher_requests privilege escalation: drop the unrestricted insert policy
DROP POLICY IF EXISTS "teacher insert request" ON public.teacher_requests;

-- 2. Prevent teachers from updating their own wallet balance directly
DROP POLICY IF EXISTS "Teachers update own wallet" ON public.teacher_wallets;

-- Teachers should only be able to view their wallet, not update it
-- Balance changes should only happen via server-side functions (credit_teacher_on_purchase trigger)

-- 3. Fix payment-receipts storage: restrict reads to own files + admins
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Students upload receipts" ON storage.objects;

-- Students can only read their own receipts (path starts with their user id)
CREATE POLICY "Users can read own receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts'
  AND auth.role() = 'authenticated'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Students can only upload to their own folder
CREATE POLICY "Users can upload own receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Fix live-recordings: restrict uploads to teachers only
DROP POLICY IF EXISTS "Teachers can upload recordings" ON storage.objects;

CREATE POLICY "Teachers can upload recordings"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'live-recordings'
  AND auth.role() = 'authenticated'
  AND has_role(auth.uid(), 'teacher'::app_role)
);
