
-- Drop restrictive policies on deposit_requests
DROP POLICY IF EXISTS "Admins manage all deposit requests" ON public.deposit_requests;
DROP POLICY IF EXISTS "Students manage own deposit requests" ON public.deposit_requests;

-- Re-create as PERMISSIVE policies
CREATE POLICY "Admins manage all deposit requests"
ON public.deposit_requests FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students can insert own deposit requests"
ON public.deposit_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can view own deposit requests"
ON public.deposit_requests FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "Students can update own deposit requests"
ON public.deposit_requests FOR UPDATE
TO authenticated
USING (auth.uid() = student_id);
