
-- 1) deposit_requests: prevent students from changing status/amount/processed fields
DROP POLICY IF EXISTS "Students can update own deposit requests" ON public.deposit_requests;

CREATE OR REPLACE FUNCTION public.prevent_deposit_request_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Deposit request can no longer be modified';
  END IF;
  -- Lock down sensitive fields for non-admin updates
  NEW.status := OLD.status;
  NEW.amount := OLD.amount;
  NEW.student_id := OLD.student_id;
  NEW.processed_by := OLD.processed_by;
  NEW.processed_at := OLD.processed_at;
  NEW.admin_message := OLD.admin_message;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_deposit_request_tampering ON public.deposit_requests;
CREATE TRIGGER trg_prevent_deposit_request_tampering
BEFORE UPDATE ON public.deposit_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_deposit_request_tampering();

CREATE POLICY "Students can update own pending deposit requests"
ON public.deposit_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id AND status = 'pending')
WITH CHECK (auth.uid() = student_id);

-- 2) notification_delivery_logs: remove user SELECT (contains device push tokens)
DROP POLICY IF EXISTS "Users view own delivery logs" ON public.notification_delivery_logs;

-- 3) notifications: prevent users from updating broadcast (user_id IS NULL) rows
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;
CREATE POLICY "Users can update their notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
