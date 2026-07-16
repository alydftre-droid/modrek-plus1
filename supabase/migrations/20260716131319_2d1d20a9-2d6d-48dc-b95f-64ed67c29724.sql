DROP POLICY IF EXISTS "Students can update own pending deposit requests" ON public.deposit_requests;
CREATE POLICY "Students can update own pending deposit requests"
  ON public.deposit_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id AND status = 'pending')
  WITH CHECK (
    auth.uid() = student_id
    AND status = 'pending'
    AND amount = (SELECT amount FROM public.deposit_requests d WHERE d.id = deposit_requests.id)
    AND COALESCE(recharge_code, '') = COALESCE((SELECT recharge_code FROM public.deposit_requests d WHERE d.id = deposit_requests.id), '')
  );

DROP POLICY IF EXISTS "Students update own in-progress attempts" ON public.exam_attempts;
CREATE POLICY "Students update own in-progress attempts"
  ON public.exam_attempts FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id AND status = 'in_progress'::exam_attempt_status)
  WITH CHECK (
    auth.uid() = student_id
    AND status IN ('in_progress'::exam_attempt_status, 'submitted'::exam_attempt_status)
    AND total_score IS NOT DISTINCT FROM (SELECT total_score FROM public.exam_attempts a WHERE a.id = exam_attempts.id)
    AND max_score IS NOT DISTINCT FROM (SELECT max_score FROM public.exam_attempts a WHERE a.id = exam_attempts.id)
    AND percentage IS NOT DISTINCT FROM (SELECT percentage FROM public.exam_attempts a WHERE a.id = exam_attempts.id)
    AND passed IS NOT DISTINCT FROM (SELECT passed FROM public.exam_attempts a WHERE a.id = exam_attempts.id)
    AND is_graded IS NOT DISTINCT FROM (SELECT is_graded FROM public.exam_attempts a WHERE a.id = exam_attempts.id)
    AND graded_by IS NOT DISTINCT FROM (SELECT graded_by FROM public.exam_attempts a WHERE a.id = exam_attempts.id)
  );

DROP POLICY IF EXISTS "Students can insert own purchases" ON public.student_group_purchases;
CREATE POLICY "Students can insert own purchases"
  ON public.student_group_purchases FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND amount_paid > 0
    AND (activated_by_admin IS NULL OR activated_by_admin = false)
  );
