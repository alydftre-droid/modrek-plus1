
-- Fix storage policies for payment-receipts bucket
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can read receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-receipts');

-- Fix deposit_requests: drop RESTRICTIVE policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Students can insert own deposit requests" ON public.deposit_requests;
DROP POLICY IF EXISTS "Students can update own deposit requests" ON public.deposit_requests;
DROP POLICY IF EXISTS "Students can view own deposit requests" ON public.deposit_requests;
DROP POLICY IF EXISTS "Admins manage all deposit requests" ON public.deposit_requests;

CREATE POLICY "Students can insert own deposit requests"
ON public.deposit_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can view own deposit requests"
ON public.deposit_requests FOR SELECT TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "Students can update own deposit requests"
ON public.deposit_requests FOR UPDATE TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "Admins manage all deposit requests"
ON public.deposit_requests FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
